/**
 * Spine arithmetic, shared by every part that has one.
 *
 * A trunk rises along Y, so its spine offsets are X and Z. A branch and a
 * root reach along X, because each is built along the axis its transform then
 * points somewhere, so their offsets are Y and Z. The generators and the
 * drag handles both come through here, so neither has to care which is which.
 */

import * as THREE from 'three'
import type {ComponentType} from './component-types'

/**
 * How a part's spine is laid out in its own space.
 *
 * `vertical` is the trunk: along Y, offsets on X and Z.
 * `outward` is a branch or a root: along X, offsets on Y and Z.
 */
export type SpineKind = 'vertical' | 'outward'

/** A spine point of either layout. `x` belongs to the trunk, `y` to a limb. */
export interface SpineLike {
    readonly t: number
    readonly x?: number
    readonly y?: number
    readonly z: number
}

/** The kind of spine a component type has, or `null` if it has none. */
export function spineKindOf(type: ComponentType): SpineKind | null {
    switch (type) {
        case 'trunk':
            return 'vertical'
        case 'branch':
        case 'root':
            return 'outward'
        default:
            return null
    }
}

/** Which parameter holds the part's length along its spine axis. */
export function spineLengthKey(type: ComponentType): string {
    return type === 'trunk' ? 'height' : 'length'
}

const TWIST_AXIS: Readonly<Record<SpineKind, THREE.Vector3>> = {
    vertical: new THREE.Vector3(0, 1, 0),
    outward: new THREE.Vector3(1, 0, 0),
}

/**
 * The position of a spine point in the part's own space.
 *
 * The twist is applied, so the result is where the geometry actually is and
 * a handle sits on the part the user can see. Passing a negative twist runs
 * the same rotation the other way, which is what turns a dragged position
 * back into an un-twisted offset.
 */
export function spinePointPosition(
    point: SpineLike,
    kind: SpineKind,
    length: number,
    twistDegrees = 0,
): THREE.Vector3 {
    const position =
        kind === 'vertical'
            ? new THREE.Vector3(point.x ?? 0, point.t * length, point.z)
            : new THREE.Vector3(point.t * length, point.y ?? 0, point.z)

    if (twistDegrees === 0) {
        return position
    }

    const twist = THREE.MathUtils.degToRad(twistDegrees)
    return position.applyAxisAngle(TWIST_AXIS[kind], twist * point.t)
}

/**
 * Replaces a spine point's two lateral offsets and leaves `t` alone.
 *
 * The position must already be un-twisted.
 */
export function withSpineOffsets<T extends SpineLike>(
    point: T,
    kind: SpineKind,
    local: THREE.Vector3,
): T {
    return (
        kind === 'vertical'
            ? {...point, x: local.x, z: local.z}
            : {...point, y: local.y, z: local.z}
    ) as T
}

/**
 * Whether a parameter change means the spine should be rebuilt.
 *
 * These are the controls that shape the part's default curve. Dragging a
 * handle overrides the result, and touching one of these overrides the drag,
 * so the control is never dead.
 */
export function reshapesSpine(type: ComponentType, key: string): boolean {
    if (type === 'trunk') {
        return key === 'bend'
    }

    if (type === 'branch') {
        return key === 'bend' || key === 'curl'
    }

    if (type === 'root') {
        return key === 'drop' || key === 'curl'
    }

    return false
}
