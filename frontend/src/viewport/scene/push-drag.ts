/**
 * The shape tool's drag.
 *
 * A push is stored in the part's own space, so a click on the surface has to
 * be taken back into that space before it means anything. The result is a
 * `SurfacePush` parameter, which the generator applies to the mesh, so undo
 * and save work on it like any other parameter.
 *
 * The strength is the distance dragged *along the surface normal*, measured
 * on screen, so dragging sideways does nothing.
 */

import * as THREE from 'three'
import type {SurfacePush} from '../../assets/shared/component-types'
import {findComponent, type Scene} from '../../core/scene/scene-model'

export interface PushGesture {
    readonly componentId: string
    /** Local to the part. */
    readonly point: readonly [number, number, number]
    readonly direction: readonly [number, number, number]
    /** The normal as it points across the screen, for measuring the drag. */
    readonly screenNormal: THREE.Vector2
    readonly metresPerPixel: number
    /** The pushes the part already had, so a drag shows one and not a trail. */
    readonly base: readonly SurfacePush[]
    readonly origin: {x: number; y: number}
    /** Pushing out is positive; pulling in is negative. */
    readonly sign: 1 | -1
    readonly reach: number
    readonly before: Scene
}

interface BeginOptions {
    readonly scene: Scene
    readonly componentId: string
    /** In world space. */
    readonly point: THREE.Vector3
    readonly normal: THREE.Vector3
    readonly reach: number
    readonly tool: 'push' | 'pull'
    readonly camera: THREE.Camera
    /** The canvas size in CSS pixels. */
    readonly width: number
    readonly height: number
    readonly pointer: {x: number; y: number}
}

function matrixOf(component: {transform: {position: readonly number[]; rotation: readonly number[]; scale: readonly number[]}}): THREE.Matrix4 {
    const {position, rotation, scale} = component.transform

    return new THREE.Matrix4().compose(
        new THREE.Vector3(...(position as [number, number, number])),
        new THREE.Quaternion().setFromEuler(
            new THREE.Euler(...(rotation as [number, number, number])),
        ),
        new THREE.Vector3(...(scale as [number, number, number])),
    )
}

/** Sets up a push at a surface hit, or `null` if the part has gone. */
export function beginPush(options: BeginOptions): PushGesture | null {
    const {scene, componentId, point, normal, reach, tool, camera, width, height, pointer} =
        options

    const component = findComponent(scene, componentId)
    if (!component || width <= 0 || height <= 0) {
        return null
    }

    // Only a part whose generator knows about pushes can carry one. A leaf
    // clump is a clump: it is shaped by its size and shape, not by sculpting.
    // Selecting it and doing nothing would look broken, so the gesture simply
    // does not start and the part is selected as usual.
    if (!Array.isArray(component.parameters.pushes)) {
        return null
    }

    const matrix = matrixOf(component)
    const inverse = matrix.clone().invert()

    const local = point.clone().applyMatrix4(inverse)
    const localNormal = normal
        .clone()
        .applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix))
        .normalize()

    // The normal across the screen: project the point and a point a little
    // way along the normal, and use the difference.
    const start = point.clone().project(camera)
    const end = point
        .clone()
        .addScaledVector(normal, Math.max(point.distanceTo(camera.position) * 0.01, 0.01))
        .project(camera)

    const screenNormal = new THREE.Vector2(
        ((end.x - start.x) / 2) * width,
        (-(end.y - start.y) / 2) * height,
    )

    // A surface facing the camera has no direction on screen of its own, so
    // the drag would measure nothing and the tool would feel dead. Fall back
    // to up-is-out, which is predictable and always gives the user something
    // to work with.
    if (screenNormal.lengthSq() < 1e-6) {
        screenNormal.set(0, -1)
    } else {
        screenNormal.normalize()
    }

    const distance = point.distanceTo(camera.position)
    const fieldOfView =
        camera instanceof THREE.PerspectiveCamera ? camera.fov : 45
    const metresPerPixel =
        (2 * Math.tan(THREE.MathUtils.degToRad(fieldOfView) / 2) * distance) / height

    const existing = component.parameters.pushes

    return {
        componentId,
        point: [local.x, local.y, local.z],
        direction: [localNormal.x, localNormal.y, localNormal.z],
        screenNormal,
        metresPerPixel,
        base: Array.isArray(existing) ? (existing as SurfacePush[]) : [],
        origin: {x: pointer.x, y: pointer.y},
        sign: tool === 'push' ? 1 : -1,
        reach,
        before: scene,
    }
}

/** The push the pointer currently asks for, or `null` if it has not moved. */
export function pushFor(
    gesture: PushGesture,
    pointer: {x: number; y: number},
): SurfacePush | null {
    const along =
        (pointer.x - gesture.origin.x) * gesture.screenNormal.x +
        (pointer.y - gesture.origin.y) * gesture.screenNormal.y

    const strength = along * gesture.metresPerPixel * gesture.sign

    if (Math.abs(strength) < 0.002) {
        return null
    }

    return {
        point: gesture.point,
        direction: gesture.direction,
        strength,
        radius: gesture.reach,
    }
}

/**
 * How many screen pixels one metre covers at a given distance.
 *
 * Used to size the brush ring to the push's actual reach.
 */
export function pixelsPerMetre(
    camera: THREE.Camera,
    distance: number,
    viewportHeight: number,
): number {
    if (viewportHeight <= 0) {
        return 1
    }

    const fieldOfView = camera instanceof THREE.PerspectiveCamera ? camera.fov : 45
    const metresPerPixel =
        (2 * Math.tan(THREE.MathUtils.degToRad(fieldOfView) / 2) * distance) / viewportHeight

    return metresPerPixel > 0 ? 1 / metresPerPixel : 1
}
