/**
 * Raycast picking and pointer projection.
 */

import * as THREE from 'three'

export interface Picker {
    /** Returns the component id under the pointer, or `null`. */
    pick(clientX: number, clientY: number): string | null
}

function toPointer(
    clientX: number,
    clientY: number,
    domElement: HTMLElement,
    pointer: THREE.Vector2,
): boolean {
    const rect = domElement.getBoundingClientRect()

    if (rect.width === 0 || rect.height === 0) {
        return false
    }

    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1

    return true
}

export function createPicker(
    camera: THREE.Camera,
    domElement: HTMLElement,
    getTargets: () => readonly THREE.Object3D[],
): Picker {
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    return {
        pick(clientX, clientY) {
            if (!toPointer(clientX, clientY, domElement, pointer)) {
                return null
            }

            raycaster.setFromCamera(pointer, camera)

            // The hidden selection outline is still in the scene, and a raycast
            // does not care that it is hidden. Leaf cards face both ways, so
            // their outline would otherwise be what every click lands on.
            const hit = raycaster
                .intersectObjects([...getTargets()], true)
                .find((candidate) => !candidate.object.userData.isHelper)

            if (!hit) {
                return null
            }

            let object: THREE.Object3D | null = hit.object
            while (object) {
                const componentId = object.userData.componentId
                if (typeof componentId === 'string') {
                    return componentId
                }
                object = object.parent
            }

            return null
        },
    }
}

/**
 * The index of the target under the pointer, or -1.
 *
 * Used for the drag handles, which are picked by position rather than by
 * component id.
 */
export function pickIndex(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    domElement: HTMLElement,
    targets: readonly THREE.Object3D[],
): number {
    const rect = domElement.getBoundingClientRect()

    if (rect.width === 0 || rect.height === 0 || targets.length === 0) {
        return -1
    }

    const pointer = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
    )

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, camera)

    const hits = raycaster.intersectObjects([...targets], false)

    if (hits.length === 0) {
        return -1
    }

    return targets.indexOf(hits[0].object)
}

/**
 * The index of the handle nearest the pointer, or -1.
 *
 * Handles are drawn at a fixed size on screen, so they are picked on screen
 * too. Raycasting against a sphere that is only a few pixels across misses
 * often enough to feel broken; a screen distance does not, and it gives the
 * user a slightly generous target without changing what they see.
 */
export function pickNearestHandle(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    domElement: HTMLElement,
    targets: readonly THREE.Object3D[],
    radiusPx = 14,
): number {
    const rect = domElement.getBoundingClientRect()

    if (rect.width === 0 || rect.height === 0 || targets.length === 0) {
        return -1
    }

    const world = new THREE.Vector3()
    let best = -1
    let bestDistance = radiusPx

    targets.forEach((target, index) => {
        target.getWorldPosition(world)
        world.project(camera)

        // Behind the camera, or outside the depth range.
        if (world.z > 1) {
            return
        }

        const x = rect.left + ((world.x + 1) / 2) * rect.width
        const y = rect.top + ((1 - world.y) / 2) * rect.height
        const distance = Math.hypot(clientX - x, clientY - y)

        if (distance <= bestDistance) {
            bestDistance = distance
            best = index
        }
    })

    return best
}

/** Where a surface was hit, and how much of the part a push there should reach. */
export interface SurfaceHit {
    readonly componentId: string
    /** In world space. */
    readonly point: THREE.Vector3
    /** The face normal, in world space. */
    readonly normal: THREE.Vector3
    /** A sensible push reach for a part this size, in metres. */
    readonly reach: number
}

/**
 * The surface of a component under the pointer.
 *
 * Used by the shape tool, which needs the point and the normal rather than
 * just which component was hit.
 */
export function pickSurface(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    domElement: HTMLElement,
    targets: readonly THREE.Object3D[],
): SurfaceHit | null {
    const rect = domElement.getBoundingClientRect()

    if (rect.width === 0 || rect.height === 0) {
        return null
    }

    const pointer = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
    )

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, camera)

    const hits = raycaster.intersectObjects([...targets], true)
    const hit = hits[0]

    if (!hit) {
        return null
    }

    let object: THREE.Object3D | null = hit.object
    let componentId: string | null = null

    while (object) {
        if (typeof object.userData.componentId === 'string') {
            componentId = object.userData.componentId
            break
        }
        object = object.parent
    }

    if (!componentId) {
        return null
    }

    const normal = hit.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        : new THREE.Vector3(0, 1, 0)

    const geometry = (hit.object as THREE.Mesh).geometry
    const size = geometry.boundingSphere?.radius ?? 1

    return {componentId, point: hit.point.clone(), normal, reach: Math.max(size * 0.4, 0.08)}
}

/**
 * The nearest axis arrow to the pointer, or -1.
 *
 * Picked by the distance from the pointer to the arrow's line on screen, not
 * to its tip: three arrows share an origin, and clicking the middle of a shaft
 * should grab that shaft.
 */
export function pickNearestAxis(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    domElement: HTMLElement,
    segments: readonly {start: THREE.Vector3; end: THREE.Vector3}[],
    radiusPx = 10,
): number {
    const rect = domElement.getBoundingClientRect()

    if (rect.width === 0 || rect.height === 0 || segments.length === 0) {
        return -1
    }

    const toScreen = (point: THREE.Vector3) => {
        const projected = point.clone().project(camera)
        return {
            x: rect.left + ((projected.x + 1) / 2) * rect.width,
            y: rect.top + ((1 - projected.y) / 2) * rect.height,
        }
    }

    let best = -1
    let bestDistance = radiusPx

    segments.forEach((segment, index) => {
        const a = toScreen(segment.start)
        const b = toScreen(segment.end)

        const dx = b.x - a.x
        const dy = b.y - a.y
        const lengthSquared = dx * dx + dy * dy

        // How far along the arrow the pointer projects, clamped to the shaft.
        const t =
            lengthSquared <= 1e-9
                ? 0
                : Math.min(
                      1,
                      Math.max(
                          0,
                          ((clientX - a.x) * dx + (clientY - a.y) * dy) / lengthSquared,
                      ),
                  )

        const distance = Math.hypot(clientX - (a.x + dx * t), clientY - (a.y + dy * t))

        if (distance <= bestDistance) {
            bestDistance = distance
            best = index
        }
    })

    return best
}

/**
 * Where the pointer ray comes closest to a line, as a distance along it.
 *
 * This is what keeps a move on one axis: the part follows the point on the
 * axis nearest the pointer, so dragging away from the axis does nothing.
 */
export function pointerOnAxis(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    domElement: HTMLElement,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
): number | null {
    const rect = domElement.getBoundingClientRect()

    if (rect.width === 0 || rect.height === 0) {
        return null
    }

    const pointer = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
    )

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, camera)

    const rayOrigin = raycaster.ray.origin
    const rayDirection = raycaster.ray.direction

    // Closest approach between the axis line and the pointer ray.
    const w0 = origin.clone().sub(rayOrigin)
    const a = direction.dot(direction)
    const b = direction.dot(rayDirection)
    const c = rayDirection.dot(rayDirection)
    const d = direction.dot(w0)
    const e = rayDirection.dot(w0)

    const denominator = a * c - b * b

    if (Math.abs(denominator) < 1e-8) {
        return null
    }

    return (b * e - c * d) / denominator
}

/**
 * Where the pointer ray meets a plane.
 *
 * Returns `null` when the ray runs parallel to the plane.
 */
export function pointerOnPlane(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    domElement: HTMLElement,
    plane: THREE.Plane,
    target: THREE.Vector3,
): THREE.Vector3 | null {
    const rect = domElement.getBoundingClientRect()

    if (rect.width === 0 || rect.height === 0) {
        return null
    }

    const pointer = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
    )

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, camera)

    return raycaster.ray.intersectPlane(plane, target)
}
