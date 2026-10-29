/**
 * The move gizmo.
 *
 * Three arrows from the part's own origin, one per world axis, in the colours
 * a 3D package uses: X red, Y green, Z blue. Grab an arrow and the part moves
 * along that axis only, which is the whole point of a gizmo: one drag, one
 * constraint, no guessing.
 *
 * Drawn at a fixed size on screen, like the spine handles, so it is the same
 * thing to grab whether the part is near or far.
 */

import * as THREE from 'three'

const AXES: readonly {direction: THREE.Vector3; colour: number}[] = [
    {direction: new THREE.Vector3(1, 0, 0), colour: 0xe0776a},
    {direction: new THREE.Vector3(0, 1, 0), colour: 0x9ed070},
    {direction: new THREE.Vector3(0, 0, 1), colour: 0x6f9ee0},
]

/** How long an arrow is, in pixels. */
export const GIZMO_LENGTH_PX = 88

const HEAD_PX = 26
const SHAFT_RADIUS_PX = 2.4
const HEAD_RADIUS_PX = 7.5

export interface ArrowSegment {
    readonly start: THREE.Vector3
    readonly end: THREE.Vector3
}

export interface MoveGizmo {
    readonly group: THREE.Group
    /** Where each arrow runs, in world space. Empty when it is hidden. */
    segments(): readonly ArrowSegment[]
    /** Puts the gizmo at a part's origin, or hides it with `null`. */
    setOrigin(position: THREE.Vector3 | null): void
    updateScale(camera: THREE.Camera, viewportHeight: number): void
    /** Brightens one arrow; -1 for none. */
    setHovered(index: number): void
    dispose(): void
}

function arrowFor(index: number, colour: number): THREE.Group {
    const arrow = new THREE.Group()
    arrow.name = `gizmo-${index}`

    const material = new THREE.MeshBasicMaterial({
        color: colour,
        depthTest: false,
        transparent: true,
    })

    const shaftLength = GIZMO_LENGTH_PX - HEAD_PX

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), material)
    shaft.scale.set(SHAFT_RADIUS_PX, shaftLength, SHAFT_RADIUS_PX)
    shaft.position.y = shaftLength / 2
    shaft.renderOrder = 999
    shaft.userData.isHelper = true
    arrow.add(shaft)

    const head = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 14), material)
    head.scale.set(HEAD_RADIUS_PX, HEAD_PX, HEAD_RADIUS_PX)
    head.position.y = GIZMO_LENGTH_PX - HEAD_PX / 2
    head.renderOrder = 999
    head.userData.isHelper = true
    arrow.add(head)

    // A cylinder and a cone are both built along Y, so each arrow is turned
    // until its own up points down its axis.
    if (index === 0) {
        arrow.rotation.z = -Math.PI / 2
    } else if (index === 2) {
        arrow.rotation.x = Math.PI / 2
    }

    return arrow
}

export function createMoveGizmo(): MoveGizmo {
    const group = new THREE.Group()
    group.name = 'move-gizmo'
    group.visible = false

    const materials: THREE.MeshBasicMaterial[] = []
    const arrows = AXES.map((axis, index) => {
        const arrow = arrowFor(index, axis.colour)
        group.add(arrow)

        arrow.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                materials.push(child.material as THREE.MeshBasicMaterial)
            }
        })

        return arrow
    })

    const origin = new THREE.Vector3()
    let unit = 0.01
    let shown = false

    return {
        group,

        segments() {
            if (!shown) {
                return []
            }

            return AXES.map((axis) => ({
                start: origin.clone(),
                end: origin
                    .clone()
                    .addScaledVector(axis.direction, GIZMO_LENGTH_PX * unit),
            }))
        },

        setOrigin(position) {
            shown = position !== null

            if (position) {
                origin.copy(position)
                group.position.copy(position)
            }

            group.visible = shown
        },

        updateScale(camera, viewportHeight) {
            if (viewportHeight <= 0) {
                return
            }

            const fieldOfView =
                camera instanceof THREE.PerspectiveCamera ? camera.fov : 45

            // World units per pixel at the gizmo's distance.
            unit =
                (2 * Math.tan(THREE.MathUtils.degToRad(fieldOfView) / 2) *
                    camera.position.distanceTo(origin)) /
                viewportHeight

            for (const arrow of arrows) {
                arrow.scale.setScalar(unit)
            }
        },

        setHovered(index) {
            for (let i = 0; i < arrows.length; i++) {
                const active = i === index

                arrows[i].traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        const material = child.material as THREE.MeshBasicMaterial
                        material.opacity = active ? 1 : 0.78
                    }
                })
            }
        },

        dispose() {
            group.clear()

            for (const material of materials) {
                material.dispose()
            }

            for (const arrow of arrows) {
                arrow.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.geometry.dispose()
                    }
                })
            }
        },
    }
}
