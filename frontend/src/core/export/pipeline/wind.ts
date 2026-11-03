/**
 * How much each vertex may move, for a material in the engine to use.
 *
 * Both values depend only on where a vertex is, measured against the full-detail
 * prop, so every detail level moves alike and a leaf stays on its twig.
 */

import * as THREE from 'three'
import {roleOfPart, type PartRole} from '../../../assets/shared/generator-types'
import type {PlacedPart, Vec3} from './types'

/** How the height of a vertex turns into sway: slow low down, faster near the top. */
const SWAY_POWER = 1.5
/** The share of sway every height has, the rest coming with distance from the trunk. */
const SWAY_FROM_HEIGHT = 0.6
/** Leaves always flutter this much, and more towards the outside. */
const FLUTTER_BASE = 0.5
/** A thin part flutters a little, whatever it is. */
const FLUTTER_THIN = 0.25

/** What sway is measured against, in metres from the pivot. */
export interface WindExtent {
    readonly height: number
    readonly reach: number
}

/**
 * How the wind materials move a prop: the defaults the Godot kit's shaders start
 * with, which the view also uses. A test holds them to the kit's files.
 */
export const WIND_MOTION = {
    swayStrength: 0.25,
    swaySpeed: 1.1,
    flutterStrength: 0.04,
    flutterSpeed: 5,
    direction: [1, 0, 0.3],
} as const

/** Further than any prop, so being far out adds nothing and a patch's rim moves as its middle does. */
export const EVEN_REACH = 1e6

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** Sway and flutter at a point, given relative to the pivot. */
export function windWeight(x: number, y: number, z: number, role: PartRole, extent: WindExtent): readonly [number, number] {
    const out = clamp01(Math.hypot(x, z) / extent.reach)
    const sway = clamp01(y / extent.height) ** SWAY_POWER * (SWAY_FROM_HEIGHT + (1 - SWAY_FROM_HEIGHT) * out)
    const flutter = role === 'foliage' ? FLUTTER_BASE + (1 - FLUTTER_BASE) * out : role === 'thin' ? FLUTTER_THIN : 0

    return [sway, flutter]
}

/** The size of a prop, from the parts of its full detail. */
export function measureWindExtent(parts: readonly PlacedPart[], pivot: Vec3): WindExtent {
    const point = new THREE.Vector3()
    const matrix = new THREE.Matrix4()
    let height = 0
    let reach = 0

    for (const {part, matrix: placed} of parts) {
        const position = part.geometry.getAttribute('position')

        if (part.surface?.proxy || !position) {
            continue
        }

        matrix.fromArray([...placed])

        for (let i = 0; i < position.count; i++) {
            point.fromBufferAttribute(position, i).applyMatrix4(matrix)
            height = Math.max(height, point.y - pivot[1])
            reach = Math.max(reach, Math.hypot(point.x - pivot[0], point.z - pivot[2]))
        }
    }

    // Never zero, so a flat or single-point prop still divides cleanly.
    return {height: Math.max(height, 1e-3), reach: Math.max(reach, 1e-3)}
}

/**
 * Both values for every vertex of a part already placed in the prop's space.
 *
 * `rigid` marks points that sway but never flutter, such as fruit, which would
 * otherwise swell and shrink as its surface moved in and out.
 */
export function windAttribute(
    geometry: THREE.BufferGeometry,
    placed: PlacedPart,
    pivot: Vec3,
    extent: WindExtent,
    rigid?: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
): THREE.BufferAttribute {
    const position = geometry.getAttribute('position')
    const role = roleOfPart(placed.part)
    const values = new Float32Array(position.count * 2)

    for (let i = 0; i < position.count; i++) {
        const [sway, flutter] = windWeight(
            position.getX(i) - pivot[0],
            position.getY(i) - pivot[1],
            position.getZ(i) - pivot[2],
            role,
            extent,
        )

        values[i * 2] = sway
        values[i * 2 + 1] = rigid ? flutter * (1 - rigid.getX(i)) : flutter
    }

    return new THREE.BufferAttribute(values, 2)
}
