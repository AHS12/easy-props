/**
 * Camera controls.
 *
 * Orbit with the left button, pan with the right button or Shift + left, and
 * zoom with the wheel. The camera is clamped so it can never flip under the
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

    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
    }

    controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
    }

    // Shift + left drag pans instead of orbiting.
    const setPanMode = (pan: boolean) => {
        controls.mouseButtons.LEFT = pan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
    }

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Shift') {
            setPanMode(true)
        }
    }

    const onKeyUp = (event: KeyboardEvent) => {
        if (event.key === 'Shift') {
            setPanMode(false)
        }
    }

    domElement.addEventListener('keydown', onKeyDown)
    domElement.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', () => setPanMode(false))

    const originalDispose = controls.dispose.bind(controls)
    controls.dispose = () => {
        domElement.removeEventListener('keydown', onKeyDown)
        domElement.removeEventListener('keyup', onKeyUp)
        originalDispose()
    }

    controls.update()

    return controls
}
