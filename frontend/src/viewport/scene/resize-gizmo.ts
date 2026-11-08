/**
 * The resize gizmo: one ring around the part's base, facing the camera.
 *
 * Grab it and drag out from the middle to grow the part, or in to shrink it.
 * Small squares on the ring show it pulls outward rather than round, unlike
 * Turn's rings. Like them, it stays the same size on screen.
 */

import * as THREE from 'three'

const COLOUR = 0xe8c066
const HOVER = 0xffe2a3

/** The ring's radius, in pixels: a little wider than Turn's, so the two never look alike. */
const RING_RADIUS_PX = 54
const TUBE_PX = 3
const KNOB_PX = 7
const SAMPLES = 64

export interface ResizeGizmo {
    readonly group: THREE.Group
    /** Where the ring can be grabbed, in world space, as one ring. Empty when hidden. */
    rings(): readonly (readonly THREE.Vector3[])[]
    /** Puts the gizmo at a part's base, or hides it with `null`. */
    setOrigin(position: THREE.Vector3 | null): void
    /** Keeps it the same size on screen and facing the camera. */
    update(camera: THREE.Camera, viewportHeight: number): void
    setHovered(hovered: boolean): void
    dispose(): void
}

export function createResizeGizmo(): ResizeGizmo {
    const group = new THREE.Group()
    group.name = 'resize-gizmo'
    group.visible = false

    const material = new THREE.MeshBasicMaterial({color: COLOUR, depthTest: false, transparent: true})
    const ringGeometry = new THREE.TorusGeometry(1, TUBE_PX / RING_RADIUS_PX, 6, SAMPLES * 2)
    const knobGeometry = new THREE.PlaneGeometry(KNOB_PX / RING_RADIUS_PX, KNOB_PX / RING_RADIUS_PX)
    const face = new THREE.Group()
    const ring = new THREE.Mesh(ringGeometry, material)

    ring.renderOrder = 999
    ring.userData.isHelper = true
    face.add(ring)

    // At the four diagonals, turned to stand on a corner, so they read as handles to pull.
    for (let corner = 0; corner < 4; corner++) {
        const angle = Math.PI / 4 + (corner * Math.PI) / 2
        const knob = new THREE.Mesh(knobGeometry, material)

        knob.position.set(Math.cos(angle), Math.sin(angle), 0)
        knob.rotation.z = Math.PI / 4
        knob.renderOrder = 999
        knob.userData.isHelper = true
        face.add(knob)
    }

    group.add(face)

    const origin = new THREE.Vector3()
    const towardCamera = new THREE.Vector3(0, 0, 1)
    const viewUp = new THREE.Vector3(0, 1, 0)
    let radius = 1
    let shown = false

    return {
        group,

        rings() {
            if (!shown) {
                return []
            }

            const v = new THREE.Vector3().crossVectors(towardCamera, viewUp)

            return [
                Array.from({length: SAMPLES}, (_, step) => {
                    const angle = (step / SAMPLES) * Math.PI * 2

                    return origin.clone().addScaledVector(viewUp, Math.cos(angle) * radius).addScaledVector(v, Math.sin(angle) * radius)
                }),
            ]
        },

        setOrigin(position) {
            shown = position !== null

            if (position) {
                origin.copy(position)
                group.position.copy(position)
            }

            group.visible = shown
        },

        update(camera, viewportHeight) {
            if (viewportHeight <= 0) {
                return
            }

            const fieldOfView = camera instanceof THREE.PerspectiveCamera ? camera.fov : 45
            const unit = (2 * Math.tan(THREE.MathUtils.degToRad(fieldOfView) / 2) * camera.position.distanceTo(origin)) / viewportHeight

            radius = RING_RADIUS_PX * unit
            group.scale.setScalar(radius)
            towardCamera.copy(camera.position).sub(origin).normalize()
            viewUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
            face.quaternion.copy(camera.quaternion)
        },

        setHovered(hovered) {
            material.color.setHex(hovered ? HOVER : COLOUR)
        },

        dispose() {
            group.clear()
            ringGeometry.dispose()
            knobGeometry.dispose()
            material.dispose()
        },
    }
}
