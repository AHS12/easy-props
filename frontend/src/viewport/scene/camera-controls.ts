/**
 * Camera controls.
 *
 * By default, orbit with the left button, pan with the right button or Shift +
 * left, and zoom with the wheel. Settings can match Blender or Unreal instead. The camera is clamped so it can never flip under the
 * ground plane or wander away from the tree.
 */

import * as THREE from 'three'
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js'

const MIN_POLAR_ANGLE = 0.05
const MAX_POLAR_ANGLE = 1.52
const MIN_DISTANCE = 1.2
const MAX_DISTANCE = 40
const DAMPING_FACTOR = 0.08

export type ViewportControls = OrbitControls

export type CameraScheme = 'easy-props' | 'blender' | 'unreal'

/** Which buttons move the camera, given the modifier keys held at the press. */
function buttonsFor(scheme: CameraScheme, event?: {shiftKey: boolean; altKey: boolean}) {
    switch (scheme) {
        case 'blender':
            return {
                LEFT: null,
                MIDDLE: event?.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
                RIGHT: null,
            }
        case 'unreal':
            return {
                LEFT: event?.altKey ? THREE.MOUSE.ROTATE : null,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: event?.altKey ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE,
            }
        default:
            return {
                LEFT: event?.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN,
            }
    }
}

/** Follows a camera scheme until the returned function is called. */
export function applyCameraScheme(
    controls: OrbitControls,
    element: HTMLElement,
    scheme: CameraScheme,
): () => void {
    const update = (event: PointerEvent) => {
        // OrbitControls reads the buttons on this same event, so this runs first
        // by listening in the capture phase.
        controls.mouseButtons = buttonsFor(scheme, event) as OrbitControls['mouseButtons']
    }

    controls.mouseButtons = buttonsFor(scheme) as OrbitControls['mouseButtons']
    element.addEventListener('pointerdown', update, true)

    return () => element.removeEventListener('pointerdown', update, true)
}

export function attachCameraControls(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
): ViewportControls {
    const controls = new OrbitControls(camera, domElement)

    controls.enableDamping = true
    controls.dampingFactor = DAMPING_FACTOR
    controls.target.set(0, 1.5, 0)

    controls.minPolarAngle = MIN_POLAR_ANGLE
    controls.maxPolarAngle = MAX_POLAR_ANGLE
    controls.minDistance = MIN_DISTANCE
    controls.maxDistance = MAX_DISTANCE

    controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
    }

    controls.update()

    return controls
}
