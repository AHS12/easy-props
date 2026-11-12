/**
 * What leaf shapes, strands and fruit are built into: plain lists of points,
 * painted per point, and the few shapes they share.
 */

import * as THREE from 'three'
import {RIGID_ATTRIBUTE} from '../../shared/generator-types'
import {resolvePalette, type PaintedTreeParameters} from './parameters'
import type {Clump, Vec3} from './plan'

/** The middle of the first dab, which is solid at every mip level. */
const SOLID_UV = 0.25

export interface LeafBuffers {
    readonly positions: number[]
    readonly normals: number[]
    readonly colors: number[]
    readonly uvs: number[]
    readonly indices: number[]
    /** Where fruit starts and ends among the vertices, in pairs: it sways whole. */
    readonly rigid: number[]
}

export const emptyLeafBuffers = (): LeafBuffers => ({positions: [], normals: [], colors: [], uvs: [], indices: [], rigid: []})

export function leafGeometry({positions, normals, colors, uvs, indices, rigid}: LeafBuffers): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)

    if (rigid.length > 0) {
        const marks = new Float32Array(positions.length / 3)

        for (let pair = 0; pair < rigid.length; pair += 2) {
            marks.fill(1, rigid[pair], rigid[pair + 1])
        }

        geometry.setAttribute(RIGID_ATTRIBUTE, new THREE.BufferAttribute(marks, 1))
    }

    geometry.computeBoundingSphere()

    return geometry
}

/** The three colours a leaf shape is painted from, with its clump's own tint. */
export function leafColours(tree: PaintedTreeParameters, clump: Clump) {
    const palette = resolvePalette(tree)
    const deep = new THREE.Color(palette.leafDeep)
    const mid = new THREE.Color(palette.leafMid)
    const light = new THREE.Color(palette.leafLight)

    if (clump.edit.colour) {
        const tint = new THREE.Color(clump.edit.colour)

        mid.lerp(tint, 0.72)
        light.lerp(tint.clone().lerp(new THREE.Color('#ffffff'), 0.55), 0.72)
        deep.lerp(tint.clone().multiplyScalar(0.45), 0.72)
    }

    const paint = new THREE.Color()

    return (value: number): THREE.Color => {
        const v = Math.min(1, Math.max(0, value))

        return v < 0.5 ? paint.copy(deep).lerp(mid, v * 2) : paint.copy(mid).lerp(light, (v - 0.5) * 2)
    }
}

export function pushVertex(buffers: LeafBuffers, point: Vec3, normal: Vec3, colour: THREE.Color): number {
    const index = buffers.positions.length / 3

    buffers.positions.push(point[0], point[1], point[2])
    buffers.normals.push(normal[0], normal[1], normal[2])
    buffers.colors.push(colour.r, colour.g, colour.b)
    buffers.uvs.push(SOLID_UV, SOLID_UV)

    return index
}

/** A triangle seen from both sides, over the same vertices. */
export function pushBothSides(buffers: LeafBuffers, a: number, b: number, c: number) {
    buffers.indices.push(a, b, c, a, c, b)
}

/** One leaf: a kite from `base` to `tip`, widest a third of the way along. */
export function addLeaf(
    buffers: LeafBuffers,
    base: Vec3,
    tip: Vec3,
    across: Vec3,
    width: number,
    normal: Vec3,
    paint: (value: number) => THREE.Color,
    value: number,
) {
    const at = (share: number, side: number): Vec3 => [
        base[0] + (tip[0] - base[0]) * share + across[0] * side,
        base[1] + (tip[1] - base[1]) * share + across[1] * side,
        base[2] + (tip[2] - base[2]) * share + across[2] * side,
    ]
    const half = width * 0.5
    const a = pushVertex(buffers, base, normal, paint(value - 0.2))
    const b = pushVertex(buffers, at(0.34, half), normal, paint(value))
    const c = pushVertex(buffers, tip, normal, paint(value + 0.2))
    const d = pushVertex(buffers, at(0.34, -half), normal, paint(value))

    pushBothSides(buffers, a, b, c)
    pushBothSides(buffers, a, c, d)
}
