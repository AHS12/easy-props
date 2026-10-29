/**
 * Raycast picking.
 *
 * Turns a screen position into the id of the component underneath it.
 */

import * as THREE from 'three'

export interface Picker {
    /** Returns the component id under the pointer, or `null`. */
    pick(clientX: number, clientY: number): string | null
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
            const rect = domElement.getBoundingClientRect()

            if (rect.width === 0 || rect.height === 0) {
                return null
            }

            pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
            pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1

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
