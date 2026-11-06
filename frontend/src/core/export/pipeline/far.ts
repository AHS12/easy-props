/**
 * The far-away card: two crossed upright cards with pictures of the prop on
 * them, for an engine to show in place of the prop once it is far off.
 *
 * Crossed cards need no material of their own in any engine. Each side of each
 * card shows the view from that side, drawn level and without perspective, so
 * the card is the prop's real size and stands where the prop does.
 */

import * as THREE from 'three'
import {flattenPicture} from '../../../assets/style/flat-colours'
import {webglFarPainter} from '../far-painter'
import {afterPaint} from './yield'
import {reliefForFile, type MergedMesh} from './merge'
import type {NamedMesh} from '../glb-exporter'
import {windWeight, type WindExtent} from './wind'

export {FAR_FACES} from './types'

/** Pixels across each view. Plenty for a prop a few dozen pixels tall, and light on disk. */
export const FAR_VIEW_SIZE = 256
/** Where an engine cuts the picture out, as glTF's alpha cut-off. */
export const FAR_CUTOFF = 0.5
/**
 * How much the see-through amount is thickened. An engine averages it as it
 * shrinks the picture, so cut-out crowns thin out with distance without this.
 */
const EDGE_THICKENING = 1.3
/** How many pixels deep edge colours spread into the see-through ones. */
const FILL_DEPTH = 8

/** The box every view is framed by, in metres from the pivot. */
export interface FarFrame {
    /** Half the card's width: the prop's widest reach from its base. */
    readonly reach: number
    readonly bottom: number
    readonly top: number
}

export interface FarView {
    readonly name: string
    /** The way this side of the card faces, towards the camera that drew it. */
    readonly facing: readonly [number, number, number]
    /** Right in the picture, as seen from that camera. */
    readonly right: readonly [number, number, number]
    /** Its cell in the 2 × 2 grid, column then row from the bottom. */
    readonly cell: readonly [number, number]
}

export const FAR_VIEWS: readonly FarView[] = [
    {name: 'front', facing: [0, 0, 1], right: [1, 0, 0], cell: [0, 0]},
    {name: 'right', facing: [1, 0, 0], right: [0, 0, -1], cell: [1, 0]},
    {name: 'back', facing: [0, 0, -1], right: [-1, 0, 0], cell: [0, 1]},
    {name: 'left', facing: [-1, 0, 0], right: [0, 0, 1], cell: [1, 1]},
]

/** Two square images, each four views in a 2 × 2 grid, rows from the bottom. */
export interface FarPictures {
    /** Pixels along each edge of each image. */
    readonly size: number
    /** sRGB colour, with the see-through amount in alpha. */
    readonly colour: Uint8Array
    /** Which way the surface faces, as a relief image reads it, in the viewport's convention. */
    readonly relief: Uint8Array
}

/** Draws the views. In the app that takes WebGL, which tests do without. */
export interface FarPainter {
    /** Null when it can't draw, in which case there is no card. */
    paint(meshes: readonly MergedMesh[], frame: FarFrame, viewSize: number): Promise<FarPictures | null>
}

let painterOverride: FarPainter | null = null

/** Swaps the painter, or puts the app's own back with null. */
export function setFarPainter(painter: FarPainter | null): void {
    painterOverride = painter
}

function farPainter(): FarPainter {
    return painterOverride ?? webglFarPainter
}

/** The box around merged meshes, which already stand on the pivot. */
export function farFrame(meshes: readonly MergedMesh[]): FarFrame {
    let reach = 0
    let bottom = 0
    let top = 0

    for (const {geometry} of meshes) {
        const position = geometry.getAttribute('position')

        for (let i = 0; i < position.count; i++) {
            reach = Math.max(reach, Math.hypot(position.getX(i), position.getZ(i)))
            bottom = Math.min(bottom, position.getY(i))
            top = Math.max(top, position.getY(i))
        }
    }

    // A hair of room, so the outermost leaf isn't cut by the frame's edge.
    return {reach: Math.max(reach, 1e-3) * 1.01, bottom, top: Math.max(top, bottom + 1e-3) * 1.01}
}

/**
 * Spreads the colour of solid pixels into see-through ones, one cell at a time.
 * Without it an engine blends with black as it shrinks the picture, and the card
 * gets a dark outline. Whatever is still empty after a few pixels takes the
 * cell's average, for the smallest sizes an engine shrinks to.
 */
export function fillGaps(pixels: Uint8Array, size: number, cells = 2, depth = FILL_DEPTH): void {
    const cell = size / cells
    const filled = new Uint8Array(size * size)

    for (let at = 0; at < size * size; at++) {
        filled[at] = pixels[at * 4 + 3] > 0 ? 1 : 0
    }

    for (let row = 0; row < cells; row++) {
        for (let column = 0; column < cells; column++) {
            const x0 = column * cell
            const y0 = row * cell
            const average = [0, 0, 0]
            let solid = 0

            for (let y = y0; y < y0 + cell; y++) {
                for (let x = x0; x < x0 + cell; x++) {
                    const at = y * size + x

                    if (filled[at]) {
                        for (let channel = 0; channel < 3; channel++) {
                            average[channel] += pixels[at * 4 + channel]
                        }
                        solid++
                    }
                }
            }

            for (let step = 0; step < depth; step++) {
                const reached: [number, number[]][] = []

                for (let y = y0; y < y0 + cell; y++) {
                    for (let x = x0; x < x0 + cell; x++) {
                        if (filled[y * size + x]) {
                            continue
                        }

                        const sum = [0, 0, 0]
                        let count = 0

                        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                            const nx = x + dx
                            const ny = y + dy

                            if (nx >= x0 && nx < x0 + cell && ny >= y0 && ny < y0 + cell && filled[ny * size + nx]) {
                                const near = (ny * size + nx) * 4

                                sum[0] += pixels[near]
                                sum[1] += pixels[near + 1]
                                sum[2] += pixels[near + 2]
                                count++
                            }
                        }

                        if (count > 0) {
                            reached.push([y * size + x, sum.map((value) => Math.round(value / count))])
                        }
                    }
                }

                for (const [at, colour] of reached) {
                    pixels.set(colour, at * 4)
                    filled[at] = 1
                }
            }

            const rest = solid > 0 ? average.map((value) => Math.round(value / solid)) : [128, 128, 128]

            for (let y = y0; y < y0 + cell; y++) {
                for (let x = x0; x < x0 + cell; x++) {
                    if (!filled[y * size + x]) {
                        pixels.set(rest, (y * size + x) * 4)
                    }
                }
            }
        }
    }
}

/** Gives the relief the colour picture's see-through amount, then fills both. */
export function finishPictures(colour: Uint8Array, relief: Uint8Array, size: number): void {
    for (let at = 3; at < colour.length; at += 4) {
        colour[at] = Math.min(255, Math.round(colour[at] * EDGE_THICKENING))
        relief[at] = colour[at]
    }

    fillGaps(colour, size)
    fillGaps(relief, size)

    // A relief image has no see-through part.
    for (let at = 3; at < relief.length; at += 4) {
        relief[at] = 255
    }
}

/**
 * Two upright cards through the pivot, crossed at right angles. Each side has
 * its own corners, so it can show its own picture, and is seen from its own side
 * only. With `wind`, each corner sways as the prop does at that point, and never
 * flutters, so the picture bends with the nearer levels without wobbling.
 */
export function farCardGeometry(frame: FarFrame, wind?: WindExtent): THREE.BufferGeometry {
    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const index: number[] = []
    const {reach, bottom, top} = frame

    for (const {facing, right, cell} of FAR_VIEWS) {
        const first = positions.length / 3

        for (const [across, up] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
            const out = (across * 2 - 1) * reach

            positions.push(right[0] * out, up ? top : bottom, right[2] * out)
            normals.push(...facing)
            uvs.push((cell[0] + across) / 2, (cell[1] + up) / 2)
        }

        index.push(first, first + 1, first + 2, first, first + 2, first + 3)
    }

    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(index)

    if (wind) {
        const sway: number[] = []

        for (let at = 0; at < positions.length; at += 3) {
            sway.push(windWeight(positions[at], positions[at + 1], positions[at + 2], 'solid', wind)[0], 0)
        }

        geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(sway, 2))
    }

    return geometry
}

function pictureTexture(pixels: Uint8Array, size: number, colourSpace: THREE.ColorSpace, name: string): THREE.DataTexture {
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat)

    texture.name = name
    texture.colorSpace = colourSpace
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.needsUpdate = true

    return texture
}

export interface FarCard {
    readonly frame: FarFrame
    readonly pictures: FarPictures
    readonly geometry: THREE.BufferGeometry
    /** As the view draws it. */
    readonly material: THREE.MeshStandardMaterial
}

/** The card for merged full-detail meshes, or null when the pictures can't be drawn. */
export async function buildFarCard(meshes: readonly MergedMesh[], name: string, wind?: WindExtent): Promise<FarCard | null> {
    if (meshes.length === 0) {
        return null
    }

    const frame = farFrame(meshes)

    await afterPaint()

    const pictures = await farPainter().paint(meshes, frame, FAR_VIEW_SIZE)

    if (!pictures) {
        return null
    }

    return {
        frame,
        pictures,
        geometry: farCardGeometry(frame, wind),
        material: new THREE.MeshStandardMaterial({
            name: `${name}_far`,
            color: 0xffffff,
            roughness: 1,
            metalness: 0,
            map: pictureTexture(pictures.colour, pictures.size, THREE.SRGBColorSpace, `${name}_far`),
            normalMap: pictureTexture(pictures.relief, pictures.size, THREE.NoColorSpace, `${name}_far_relief`),
            alphaTest: FAR_CUTOFF,
        }),
    }
}

/** The card as a file wants it. The card's own material stays the view's. A Comic card's picture is cut to flat colours. */
export function farCardMesh(card: FarCard, name: string, comic = false): NamedMesh {
    const material = card.material.clone()

    if (comic && card.material.map instanceof THREE.DataTexture) {
        material.map = flattenPicture(card.material.map, FAR_CUTOFF)
        material.map.name = card.material.map.name
    }

    material.normalMap = card.material.normalMap ? reliefForFile(card.material.normalMap, true) : null
    material.normalScale = new THREE.Vector2(1, -1)

    return {name: `${name}_far`, geometry: card.geometry, material}
}
