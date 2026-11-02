/**
 * Merging a prop's parts into as few meshes as it has materials.
 *
 * Each part's transform is baked into its vertices and its material colour into
 * its vertex colours, so what stays apart is only what has to: wood and leaves
 * draw with different materials, and everything else can share.
 */

import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {roleOfPart} from '../../../assets/shared/generator-types'
import {tidyWood} from './tidy'
import type {PlacedPart, Vec3} from './types'
import {windAttribute, type WindExtent} from './wind'

const ROUGHNESS = 0.85
const METALNESS = 0
const WHITE_SIZE = 4

let white: THREE.DataTexture | null = null

/**
 * A plain white texture, for a mesh with no texture of its own.
 *
 * It changes nothing about how the mesh looks. Unreal builds a simpler material
 * for a glTF mesh with no texture, and that material ignores vertex colours,
 * which is where all of our paint is.
 */
function whiteTexture(): THREE.DataTexture {
    if (!white) {
        white = new THREE.DataTexture(new Uint8Array(WHITE_SIZE * WHITE_SIZE * 4).fill(255), WHITE_SIZE, WHITE_SIZE)
        white.name = 'white'
        white.colorSpace = THREE.SRGBColorSpace
        white.needsUpdate = true
    }

    return white
}

const fileReliefs = new WeakMap<THREE.Texture, THREE.DataTexture>()
const smallFileReliefs = new WeakMap<THREE.Texture, THREE.DataTexture>()

/** Half a relief's size each way. Fine bark is noise to a PNG, so this is most of a lighter file's weight. */
function halved({data, width, height}: {data: Uint8Array; width: number; height: number}) {
    const smallWidth = width / 2
    const smallHeight = height / 2
    const small = new Uint8Array(smallWidth * smallHeight * 4)

    for (let y = 0; y < smallHeight; y++) {
        for (let x = 0; x < smallWidth; x++) {
            for (let channel = 0; channel < 4; channel++) {
                const sum =
                    data[(y * 2 * width + x * 2) * 4 + channel] +
                    data[(y * 2 * width + x * 2 + 1) * 4 + channel] +
                    data[((y * 2 + 1) * width + x * 2) * 4 + channel] +
                    data[((y * 2 + 1) * width + x * 2 + 1) * 4 + channel]

                small[(y * smallWidth + x) * 4 + channel] = Math.round(sum / 4)
            }
        }
    }

    return {data: small, width: smallWidth, height: smallHeight}
}

/**
 * Relief as a file wants it. The viewport works out its directions from the texture
 * coordinates and a file's reader the other way up, so green is inverted. GLTFExporter
 * would do this itself but cannot read a DataTexture: a negative `normalScale.y`, set
 * beside this, tells it the work is done.
 */
function reliefForFile(relief: THREE.Texture, full: boolean): THREE.Texture {
    const store = full ? fileReliefs : smallFileReliefs
    const cached = store.get(relief)

    if (cached) {
        return cached
    }

    const image = relief.image as {data: Uint8Array; width: number; height: number}
    const {data, width, height} = full ? image : halved(image)
    const flipped = Uint8Array.from(data)

    for (let at = 1; at < flipped.length; at += 4) {
        flipped[at] = 255 - flipped[at]
    }

    const texture = new THREE.DataTexture(flipped, width, height, THREE.RGBAFormat)

    texture.wrapS = relief.wrapS
    texture.wrapT = relief.wrapT
    texture.magFilter = relief.magFilter
    texture.minFilter = relief.minFilter
    texture.generateMipmaps = relief.generateMipmaps
    texture.needsUpdate = true
    store.set(relief, texture)

    return texture
}

export interface MergedMesh {
    readonly name: string
    readonly geometry: THREE.BufferGeometry
    readonly material: THREE.MeshStandardMaterial
    readonly faces: number
}

export interface JoinedMesh extends Omit<MergedMesh, 'material'> {
    readonly material: THREE.MeshStandardMaterial[]
}

function hasFinitePositions(geometry: THREE.BufferGeometry): boolean {
    const position = geometry.getAttribute('position')

    if (!position || position.count === 0) {
        return false
    }

    const values = position.array

    for (let i = 0; i < values.length; i++) {
        if (!Number.isFinite(values[i])) {
            return false
        }
    }

    return true
}

/** The same shape with the attributes every part in a mesh must share. */
function normalised(placed: PlacedPart, pivot: Vec3, wind?: WindExtent): THREE.BufferGeometry {
    const {part, matrix, tint, flatShading} = placed
    // A faceted part has one normal per face, which takes its own vertices.
    const faceted = flatShading && !part.surface
    const source = faceted && part.geometry.index ? part.geometry.toNonIndexed() : part.geometry
    const geometry = new THREE.BufferGeometry()
    const position = source.getAttribute('position')
    const colors = new Float32Array(position.count * 3)
    const vertexColors = source.getAttribute('color')

    for (let i = 0; i < position.count; i++) {
        colors[i * 3] = (vertexColors ? vertexColors.getX(i) : 1) * tint[0]
        colors[i * 3 + 1] = (vertexColors ? vertexColors.getY(i) : 1) * tint[1]
        colors[i * 3 + 2] = (vertexColors ? vertexColors.getZ(i) : 1) * tint[2]
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(position.array), 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    if (faceted || !source.getAttribute('normal')) {
        geometry.setIndex(source.index ? [...source.index.array] : null)
        geometry.computeVertexNormals()
    } else {
        geometry.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(source.getAttribute('normal').array), 3))
    }

    // Without a texture of its own, every vertex reads the one white colour.
    geometry.setAttribute(
        'uv',
        part.surface?.map
            ? new THREE.BufferAttribute(Float32Array.from(source.getAttribute('uv').array), 2)
            : new THREE.BufferAttribute(new Float32Array(position.count * 2), 2),
    )

    // Every part is indexed, so parts can merge whichever way they were built.
    if (source.index) {
        geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(source.index.array), 1))
    } else {
        geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from({length: position.count}, (_, i) => i), 1))
    }

    geometry.applyMatrix4(new THREE.Matrix4().fromArray([...matrix]))

    if (bucketName(placed) === 'wood') {
        tidyWood(geometry)
    }

    if (wind) {
        geometry.setAttribute('uv1', windAttribute(geometry, placed, pivot, wind))
    }

    if (source !== part.geometry) {
        source.dispose()
    }

    return geometry
}

function bucketName(part: PlacedPart): string {
    const role = roleOfPart(part.part)

    return role === 'foliage' ? 'leaves' : 'wood'
}

/**
 * Merges placed parts. A part that only exists to be clicked has nothing to
 * show, and one with a broken coordinate is dropped rather than written out:
 * one NaN vertex makes the whole file unreadable in most viewers.
 */
export function mergeParts(
    parts: readonly PlacedPart[],
    name: string,
    pivot: Vec3,
    wind?: WindExtent,
    fullRelief = true,
): MergedMesh[] {
    const buckets = new Map<string, PlacedPart[]>()

    for (const placed of parts) {
        if (placed.part.surface?.proxy || !hasFinitePositions(placed.part.geometry)) {
            continue
        }

        // A textured part cannot share with one that has nowhere to read the texture.
        const key = `${bucketName(placed)}${placed.part.surface?.map ? '' : '-plain'}`
        const bucket = buckets.get(key) ?? []

        bucket.push(placed)
        buckets.set(key, bucket)
    }

    const merged: MergedMesh[] = []
    const used = new Set<string>()

    for (const bucket of buckets.values()) {
        const surface = bucket[0].part.surface
        const pieces = bucket.map((placed) => normalised(placed, pivot, wind))
        const geometry = mergeGeometries(pieces, false)

        for (const piece of pieces) {
            piece.dispose()
        }

        if (!geometry) {
            throw new Error('The parts of this prop could not be merged.')
        }

        geometry.translate(-pivot[0], -pivot[1], -pivot[2])

        const base = `${name}_${bucketName(bucket[0])}`
        const meshName = used.has(base) ? `${base}_2` : base

        used.add(base)

        merged.push({
            name: meshName,
            geometry,
            material: new THREE.MeshStandardMaterial({
                name: meshName,
                color: 0xffffff,
                roughness: surface ? 1 : ROUGHNESS,
                metalness: METALNESS,
                vertexColors: true,
                map: surface?.map ?? whiteTexture(),
                normalMap: surface?.normalMap ? reliefForFile(surface.normalMap, fullRelief) : null,
                normalScale: new THREE.Vector2(1, -1),
                alphaTest: surface?.alphaTest ?? 0,
            }),
            faces: geometry.index!.count / 3,
        })
    }

    return merged
}

/**
 * Makes one mesh of merged ones, for an engine that places a mesh many times over.
 * Each keeps its own material, because leaves and wood still draw differently.
 */
export function joinMeshes(meshes: readonly MergedMesh[], name: string): JoinedMesh[] {
    if (meshes.length === 0) {
        return []
    }

    const geometry = mergeGeometries(meshes.map((mesh) => mesh.geometry), true)

    if (!geometry) {
        throw new Error('The parts of this prop could not be joined.')
    }

    for (const mesh of meshes) {
        mesh.geometry.dispose()
    }

    return [{
        name,
        geometry,
        material: meshes.map((mesh) => mesh.material),
        faces: geometry.index!.count / 3,
    }]
}
