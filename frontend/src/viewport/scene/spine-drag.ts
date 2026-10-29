/**
 * Dragging a part's spine.
 *
 * The same code serves the trunk, a branch, and a root. What differs is how
 * the part's own space is laid out, which `spines.ts` knows, and which plane
 * the drag happens in: a trunk slides on a horizontal plane at the handle's
 * own height, because it rises and stays upright, while a branch or a root
 * follows the screen, because it points wherever its parent sent it.
 */

import * as THREE from 'three'
import type {SceneComponent} from '../../assets/shared/component-types'
import {findComponent, type Scene} from '../../core/scene/scene-model'
import {
    spineKindOf,
    spineLengthKey,
    spinePointPosition,
    withSpineOffsets,
    type SpineKind,
    type SpineLike,
} from '../../assets/shared/spines'

export interface PartSpine {
    readonly componentId: string
    readonly kind: SpineKind
    /** The spine points as stored on the component. */
    readonly points: readonly SpineLike[]
    /** How long the part is along its own axis, which `t` is a fraction of. */
    readonly length: number
    readonly twist: number
    /** Local to world. */
    readonly matrix: THREE.Matrix4
    /** World to local. */
    readonly inverse: THREE.Matrix4
    /** Where the handles go, in world space. */
    readonly positions: readonly THREE.Vector3[]
}

function numberOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function matrixOf(component: SceneComponent): THREE.Matrix4 {
    const {position, rotation, scale} = component.transform

    return new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...scale),
    )
}

/**
 * The spine of the selected part, or `null` if it has none.
 *
 * A leaf clump has no spine, so selecting one shows no handles.
 */
export function selectedSpine(scene: Scene, selectedId: string | null): PartSpine | null {
    if (!selectedId) {
        return null
    }

    const component = findComponent(scene, selectedId)
    if (!component) {
        return null
    }

    const kind = spineKindOf(component.type)
    if (!kind) {
        return null
    }

    const points = component.parameters.spine
    if (!Array.isArray(points) || points.length < 2) {
        return null
    }

    const length = numberOr(component.parameters[spineLengthKey(component.type)], 1)
    const twist = numberOr(component.parameters.twist, 0)
    const matrix = matrixOf(component)
    const inverse = matrix.clone().invert()

    const positions = (points as SpineLike[]).map((point) =>
        spinePointPosition(point, kind, length, twist).applyMatrix4(matrix),
    )

    return {
        componentId: component.id,
        kind,
        points: points as SpineLike[],
        length,
        twist,
        matrix,
        inverse,
        positions,
    }
}

/**
 * The spine with one point moved to a world position.
 *
 * The position is taken back into the part's own space and un-twisted before
 * it is stored, so the handle ends up exactly under the pointer rather than
 * wherever the twist would have swung it.
 */
export function movedSpine(
    spine: PartSpine,
    index: number,
    world: THREE.Vector3,
): SpineLike[] {
    const local = world.clone().applyMatrix4(spine.inverse)
    const point = spine.points[index]

    const unTwisted = spinePointPosition(
        {t: point.t, x: local.x, y: local.y, z: local.z},
        spine.kind,
        spine.length,
        -spine.twist,
    )

    return spine.points.map((existing, position) =>
        position === index ? withSpineOffsets(existing, spine.kind, unTwisted) : existing,
    )
}

/**
 * Which plane a drag slides along.
 *
 * A spine point can only move across its part's axis: the offsets are the two
 * numbers beside `t`, and nothing writes the distance along the axis. So the
 * drag happens in the plane through the handle that the axis is normal to,
 * and the handle lands exactly under the pointer.
 *
 * A trunk is upright, so that plane is horizontal, at the handle's own
 * height. A limb points wherever its parent sent it, so the plane turns with
 * it.
 */
export function dragPlaneFor(spine: PartSpine, index: number): THREE.Plane {
    const origin = new THREE.Vector3().applyMatrix4(spine.matrix)

    const axis =
        spine.kind === 'vertical'
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(1, 0, 0)
                  .applyMatrix4(spine.matrix)
                  .sub(origin)
                  .normalize()

    return new THREE.Plane().setFromNormalAndCoplanarPoint(axis, spine.positions[index])
}
