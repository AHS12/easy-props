/**
 * A ramp of colours, read by a value from 0 to 1.
 *
 * It hands back the same colour object each time, so read it before the next call.
 */

import * as THREE from 'three'

export function colourRamp(stops: readonly string[]): (value: number) => THREE.Color {
    const colours = stops.map((stop) => new THREE.Color(stop))
    const paint = new THREE.Color()

    return (value) => {
        const at = Math.min(1, Math.max(0, value)) * (colours.length - 1)
        const below = Math.min(Math.floor(at), colours.length - 2)

        return paint.copy(colours[below]).lerp(colours[below + 1], at - below)
    }
}
