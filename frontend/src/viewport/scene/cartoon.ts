/**
 * The Cartoon view: a stand-in for a game engine's toon lighting.
 *
 * Toon shading is something an engine does to whatever it draws, so none of
 * this reaches the file. It only lets someone see how their prop will read in
 * a cartoon game: light in a few hard bands, and a dark edge around the shape.
 */

import * as THREE from 'three'
import {roleOfPart, type GeneratedPart} from '../../assets/shared/generator-types'
import {VIEWPORT_COLORS} from './materials'

/** Shadow, mid and lit. More steps start to read as smooth again. */
const BANDS = [90, 170, 255]

/** How thick the edge is, as a share of the view's height, so zooming out keeps it thin. */
export const INK_WIDTH = 0.0035

/**
 * The edge is never wider than this share of the shape under it. A twig a
 * few pixels across would otherwise be all edge, and read as a black stick.
 */
export const INK_SHARE = 0.2

/** Anything thicker than this, in metres, counts as thick, so the search stays short. */
const THICK = 0.4

let gradient: THREE.DataTexture | null = null

/** Shared by every part, so it is made once and never disposed with one. */
function bandTexture(): THREE.DataTexture {
    if (!gradient) {
        gradient = new THREE.DataTexture(new Uint8Array(BANDS), BANDS.length, 1, THREE.RedFormat)
        gradient.minFilter = THREE.NearestFilter
        gradient.magFilter = THREE.NearestFilter
        gradient.generateMipmaps = false
        gradient.needsUpdate = true
    }

    return gradient
}

export function createCartoonMaterial(
    part: GeneratedPart,
    color: THREE.ColorRepresentation,
    flatShading: boolean,
): THREE.MeshToonMaterial {
    const surface = part.surface
    const material = new THREE.MeshToonMaterial({
        color: new THREE.Color(color),
        gradientMap: bandTexture(),
        vertexColors: surface?.vertexColors ?? false,
        map: surface?.map ?? null,
        normalMap: surface?.normalMap ?? null,
        alphaTest: surface?.alphaTest ?? 0,
    })

    // The toon material has no setting for facets, but its shader honours the
    // flag, and a low-poly prop should keep its facets here too.
    Object.assign(material, {flatShading: surface ? false : flatShading})

    return material
}

/**
 * Whether a part gets the dark edge.
 *
 * A cut-out leaf card is flat, and a flipped copy of a flat card is a smudge
 * rather than an edge. Grass blades and fern leaves are thin as well, and their
 * shading normals point at the sky rather than out of the shape, so pushing
 * along them smears ink across the blade. Leaves and blades go without, as
 * cartoon games usually draw them.
 */
export function takesInk(part: GeneratedPart): boolean {
    const surface = part.surface

    if (!surface) {
        return true
    }

    if (surface.proxy === true || (surface.alphaTest ?? 0) > 0) {
        return false
    }

    return roleOfPart(part) === 'solid'
}

/**
 * The dark edge: the part drawn again from behind, pushed out across the
 * screen, so only a rim shows around the front.
 *
 * It goes after whatever already moves the part, such as the wind, so the edge
 * stays on the shape as it sways.
 */
export function addInk(material: THREE.Material): void {
    const moved = material.onBeforeCompile
    const movedKey = material.customProgramCacheKey.bind(material)

    material.onBeforeCompile = (shader, renderer) => {
        moved.call(material, shader, renderer)
        shader.uniforms.inkWidth = {value: INK_WIDTH}
        shader.uniforms.inkShare = {value: INK_SHARE}
        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                '#include <common>\nuniform float inkWidth;\nuniform float inkShare;\nattribute float inkThickness;',
            )
            .replace(
                '#include <project_vertex>',
                /* glsl */ `#include <project_vertex>
                vec3 inkNormal = normalize(normalMatrix * normal);
                vec2 inkPush = (projectionMatrix * vec4(inkNormal, 0.0)).xy;
                if (dot(inkPush, inkPush) > 0.0) {
                    // The same push, measured once on screen and once against the shape.
                    float inkOnScreen = inkWidth * 2.0 * gl_Position.w;
                    float inkOnShape = inkThickness * inkShare * length(modelViewMatrix[0].xyz) * projectionMatrix[1][1];
                    gl_Position.xy += normalize(inkPush) * min(inkOnScreen, inkOnShape);
                }`,
            )
    }
    material.customProgramCacheKey = () => `ink-${movedKey()}`
}

export function createInkMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({color: new THREE.Color(VIEWPORT_COLORS.ink), side: THREE.BackSide})
}

/**
 * How thick the shape is at each point: the distance to the nearest point
 * across from it, facing the other way. Across a twig, that is its width.
 */
export function measureThickness(geometry: THREE.BufferGeometry): Float32Array {
    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')
    const count = position.count
    const thickness = new Float32Array(count).fill(THICK)

    if (!normal) {
        return thickness
    }

    const cells = new Map<string, number[]>()
    const cellOf = (x: number, y: number, z: number) =>
        [Math.floor(x / THICK), Math.floor(y / THICK), Math.floor(z / THICK)] as const

    for (let index = 0; index < count; index++) {
        const key = cellOf(position.getX(index), position.getY(index), position.getZ(index)).join()
        const cell = cells.get(key)

        if (cell) {
            cell.push(index)
        } else {
            cells.set(key, [index])
        }
    }

    for (let index = 0; index < count; index++) {
        const x = position.getX(index)
        const y = position.getY(index)
        const z = position.getZ(index)
        const nx = normal.getX(index)
        const ny = normal.getY(index)
        const nz = normal.getZ(index)
        const [cx, cy, cz] = cellOf(x, y, z)
        let nearest = THICK * THICK

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    for (const other of cells.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
                        const ox = position.getX(other) - x
                        const oy = position.getY(other) - y
                        const oz = position.getZ(other) - z
                        const facing = nx * normal.getX(other) + ny * normal.getY(other) + nz * normal.getZ(other)

                        // Across means facing away, and lying behind this point rather than beside it.
                        if (facing > -0.5 || ox * nx + oy * ny + oz * nz >= 0) {
                            continue
                        }

                        nearest = Math.min(nearest, ox * ox + oy * oy + oz * oz)
                    }
                }
            }
        }

        thickness[index] = Math.sqrt(nearest)
    }

    return thickness
}

/**
 * The edge's own copy of a part's shape: the same points, plus how thick the
 * shape is at each, so the part's shape itself is left as it was.
 */
export function createInkGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const ink = new THREE.BufferGeometry()

    ink.setIndex(geometry.getIndex())
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
        ink.setAttribute(name, attribute)
    }
    ink.setAttribute('inkThickness', new THREE.BufferAttribute(measureThickness(geometry), 1))
    ink.boundingBox = geometry.boundingBox
    ink.boundingSphere = geometry.boundingSphere

    return ink
}
