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

            const hits = raycaster.intersectObjects([...getTargets()], true)
            if (hits.length === 0) {
                return null
            }

            let object: THREE.Object3D | null = hits[0].object
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
