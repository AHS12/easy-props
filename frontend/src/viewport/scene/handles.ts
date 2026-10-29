/**
 * Drag handles.
 *
 * Handles sit on the control points of the selected part. They are drawn at a
 * fixed screen size so they stay grabbable at any camera distance.
 */

import * as THREE from 'three'
import {VIEWPORT_COLORS} from './materials'

/** The on-screen radius of a handle, in pixels. */
const HANDLE_PIXEL_RADIUS = 6.5

/** Used when the camera is not a perspective camera. */
const DEFAULT_FIELD_OF_VIEW = 45

export interface HandleSet {
    readonly group: THREE.Group
    /** The handle meshes, in order. */
    readonly meshes: readonly THREE.Mesh[]
    /** Moves the handles to the given positions. */
    setPositions(positions: readonly THREE.Vector3[]): void
    /**
     * Keeps the handles a constant size on screen.
     *
     * A handle that shrinks with distance cannot be grabbed.
     */
    updateScale(camera: THREE.Camera, viewportHeight: number): void
    set visible(visible: boolean)
    dispose(): void
}

export function createHandles(): HandleSet {
    const group = new THREE.Group()
    group.name = 'handles'
    group.visible = false

    const meshes: THREE.Mesh[] = []

    // Unit spheres. The scale is set per frame so the handle keeps a
    // constant size on screen.
    const geometry = new THREE.SphereGeometry(1, 14, 10)

    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        // The handles sit on the spine, which is inside the geometry. They
        // have to draw on top to be reachable.
        depthTest: false,
    })

    const ringGeometry = new THREE.SphereGeometry(1.28, 14, 10)
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(VIEWPORT_COLORS.selection),
        side: THREE.BackSide,
        depthTest: false,
    })

    const worldPosition = new THREE.Vector3()

    return {
        group,
        meshes,

        setPositions(positions) {
            while (meshes.length > positions.length) {
                const mesh = meshes.pop()
                if (mesh) {
                    group.remove(mesh)
                }
            }

            while (meshes.length < positions.length) {
                const mesh = new THREE.Mesh(geometry, material)
                mesh.userData.isHelper = true
                mesh.renderOrder = 998

                const ring = new THREE.Mesh(ringGeometry, ringMaterial)
                ring.userData.isHelper = true
                ring.renderOrder = 997
                mesh.add(ring)

                group.add(mesh)
                meshes.push(mesh)
            }

            positions.forEach((position, index) => {
                meshes[index].position.copy(position)
            })
        },

        updateScale(camera, viewportHeight) {
            if (viewportHeight <= 0) {
                return
            }

            const fieldOfView =
                camera instanceof THREE.PerspectiveCamera ? camera.fov : DEFAULT_FIELD_OF_VIEW

            const perspective =
                (2 * Math.tan(THREE.MathUtils.degToRad(fieldOfView) / 2)) / viewportHeight

            for (const mesh of meshes) {
                mesh.getWorldPosition(worldPosition)
                const distance = camera.position.distanceTo(worldPosition)
                mesh.scale.setScalar(HANDLE_PIXEL_RADIUS * distance * perspective)
            }
        },

        set visible(visible: boolean) {
            group.visible = visible
        },

        dispose() {
            group.clear()
            meshes.length = 0
            geometry.dispose()
            material.dispose()
            ringGeometry.dispose()
            ringMaterial.dispose()
        },
    }
}
