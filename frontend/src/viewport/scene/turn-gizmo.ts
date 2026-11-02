/**
 * The turn gizmo, drawn as Blender and Godot draw theirs.
 *
 * Three rings around the part's base, one per world axis, in the move gizmo's
 * colours: X red, Y green, Z blue. Only the half of each ring facing the camera
 * is drawn, as the back halves would cross the front ones into a tangle. Around
 * them, a white ring faces the camera and turns the part in the screen's plane.
 * Grab a ring and drag around it. Like the arrows, it stays the same size on screen.
 */

import * as THREE from 'three'

const AXES: readonly {direction: THREE.Vector3; colour: number; hover: number}[] = [
    {direction: new THREE.Vector3(1, 0, 0), colour: 0xe0776a, hover: 0xffb3a8},
    {direction: new THREE.Vector3(0, 1, 0), colour: 0x9ed070, hover: 0xd2f5ad},
    {direction: new THREE.Vector3(0, 0, 1), colour: 0x6f9ee0, hover: 0xb4d0ff},
]
const VIEW_COLOUR = 0xd8dadd
const VIEW_HOVER = 0xffffff

/** An axis ring's radius, in pixels: small, as it sits on the trunk and shouldn't hide the branch. */
const RING_RADIUS_PX = 46
/** The view ring sits just outside the others. */
const VIEW_RING_SCALE = 1.22
const TUBE_PX = 3.4
/** Where along a ring the pointer can grab it. */
const SAMPLES = 64
/** How near a ring the pointer must be, in pixels. */
const GRAB_PX = 10

/** The view ring's index, after the three axes. */
export const VIEW_RING = 3

export interface TurnGizmo {
    readonly group: THREE.Group
    /** Where each ring can be grabbed, in world space: the axes' front halves, then the view ring. Empty when hidden. */
    rings(): readonly (readonly THREE.Vector3[])[]
    /** Puts the gizmo at a part's base, or hides it with `null`. */
    setOrigin(position: THREE.Vector3 | null): void
    /** Keeps it the same size on screen, its back halves hidden and its view ring facing the camera. */
    update(camera: THREE.Camera, viewportHeight: number): void
    /** Brightens one ring; -1 for none. */
    setHovered(index: number): void
    dispose(): void
}

export const TURN_AXES = AXES.map(({direction}) => direction)

export function createTurnGizmo(): TurnGizmo {
    const group = new THREE.Group()
    group.name = 'turn-gizmo'
    group.visible = false

    // The plane through the centre, facing the camera: everything behind it is clipped.
    const front = new THREE.Plane()
    const geometry = new THREE.TorusGeometry(1, TUBE_PX / RING_RADIUS_PX, 6, SAMPLES * 2)
    const viewGeometry = new THREE.TorusGeometry(1, TUBE_PX / RING_RADIUS_PX / VIEW_RING_SCALE, 6, SAMPLES * 2)
    const material = (colour: number, clipped: boolean) =>
        new THREE.MeshBasicMaterial({
            color: colour,
            depthTest: false,
            transparent: true,
            clippingPlanes: clipped ? [front] : null,
        })
    const materials = [...AXES.map(({colour}) => material(colour, true)), material(VIEW_COLOUR, false)]
    const resting = [...AXES.map(({colour}) => colour), VIEW_COLOUR]
    const lit = [...AXES.map(({hover}) => hover), VIEW_HOVER]

    AXES.forEach((_, index) => {
        const ring = new THREE.Mesh(geometry, materials[index])

        // A torus lies across Z, so X's ring and Y's are turned to face their own axis.
        if (index === 0) {
            ring.rotation.y = Math.PI / 2
        } else if (index === 1) {
            ring.rotation.x = Math.PI / 2
        }

        ring.renderOrder = 999
        ring.userData.isHelper = true
        group.add(ring)
    })

    const viewRing = new THREE.Mesh(viewGeometry, materials[VIEW_RING])

    viewRing.scale.setScalar(VIEW_RING_SCALE)
    viewRing.renderOrder = 999
    viewRing.userData.isHelper = true
    group.add(viewRing)

    const origin = new THREE.Vector3()
    const towardCamera = new THREE.Vector3(0, 0, 1)
    const viewUp = new THREE.Vector3(0, 1, 0)
    let radius = 1
    let shown = false

    const circle = (axis: THREE.Vector3, u: THREE.Vector3, size: number) => {
        const v = new THREE.Vector3().crossVectors(axis, u)

        return Array.from({length: SAMPLES}, (_, step) => {
            const angle = (step / SAMPLES) * Math.PI * 2

            return origin.clone().addScaledVector(u, Math.cos(angle) * size).addScaledVector(v, Math.sin(angle) * size)
        })
    }

    return {
        group,

        rings() {
            if (!shown) {
                return []
            }

            const axes = AXES.map(({direction}) =>
                circle(direction, new THREE.Vector3(direction.y, direction.z, direction.x), radius).filter(
                    // Only the half that is drawn can be grabbed.
                    (point) => point.clone().sub(origin).dot(towardCamera) >= -radius * 0.05,
                ),
            )

            return [...axes, circle(towardCamera, viewUp, radius * VIEW_RING_SCALE)]
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
            front.setFromNormalAndCoplanarPoint(towardCamera, origin)
            // A torus faces Z, which the camera's own turn points back at it.
            viewRing.quaternion.copy(camera.quaternion)
        },

        setHovered(index) {
            materials.forEach((each, i) => each.color.setHex(i === index ? lit[i] : resting[i]))
        },

        dispose() {
            group.clear()
            geometry.dispose()
            viewGeometry.dispose()

            for (const each of materials) {
                each.dispose()
            }
        },
    }
}

/** Where a world point lands on the canvas, in client pixels. */
export function toScreen(point: THREE.Vector3, camera: THREE.Camera, canvas: HTMLElement): {x: number; y: number} {
    const rect = canvas.getBoundingClientRect()
    const ndc = point.clone().project(camera)

    return {x: rect.left + ((ndc.x + 1) / 2) * rect.width, y: rect.top + ((1 - ndc.y) / 2) * rect.height}
}

/** The ring nearest the pointer, or -1 when none is close enough to grab. */
export function pickNearestRing(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    canvas: HTMLElement,
    rings: readonly (readonly THREE.Vector3[])[],
): number {
    let best = -1
    let bestDistance = GRAB_PX

    rings.forEach((points, index) => {
        for (const point of points) {
            const {x, y} = toScreen(point, camera, canvas)
            const distance = Math.hypot(x - clientX, y - clientY)

            if (distance < bestDistance) {
                best = index
                bestDistance = distance
            }
        }
    })

    return best
}

/** The axis a ring turns about. The view ring's points at the camera. */
export function ringAxis(index: number, origin: THREE.Vector3, camera: THREE.Camera): THREE.Vector3 {
    return index === VIEW_RING ? camera.position.clone().sub(origin).normalize() : TURN_AXES[index].clone()
}

/**
 * The pointer's angle around the gizmo, in radians, counted the way a turn about
 * `axis` goes as seen from the camera: anticlockwise when the axis points at it.
 */
export function pointerAngle(
    clientX: number,
    clientY: number,
    centre: {x: number; y: number},
    axis: THREE.Vector3,
    origin: THREE.Vector3,
    camera: THREE.Camera,
): number {
    // Screen y runs down, so it is flipped to make anticlockwise positive.
    const angle = Math.atan2(centre.y - clientY, clientX - centre.x)
    const facing = camera.position.clone().sub(origin).dot(axis) >= 0 ? 1 : -1

    return angle * facing
}
