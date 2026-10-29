/**
 * Scene lighting.
 *
 * The sun is a single directional light. Its direction comes from an azimuth
 * (where it is around the tree) and an elevation (how high it is), which is
 * how a person describes where the sun is without knowing what a light rig
 * is.
 */

import * as THREE from 'three'

export type SceneLighting = {
    /** Degrees around the tree. 0 is behind it, 90 is to the right. */
    readonly azimuth: number
    /** Degrees above the horizon. */
    readonly elevation: number
    /** 0 is cool white, 1 is deep golden. */
    readonly warmth: number
    /** 0 turns shadows off, 1 is a full shadow. */
    readonly shadowStrength: number
}

export type TimeOfDay = 'morning' | 'midday' | 'golden' | 'dusk'

export const DEFAULT_LIGHTING: SceneLighting = {
    azimuth: 52,
    elevation: 46,
    warmth: 0.55,
    shadowStrength: 0.8,
}

/** The sun's position for each time of day. */
export const TIME_OF_DAY: Readonly<Record<TimeOfDay, SceneLighting>> = {
    morning: {azimuth: 48, elevation: 30, warmth: 0.72, shadowStrength: 0.85},
    midday: {azimuth: 165, elevation: 68, warmth: 0.2, shadowStrength: 0.5},
    golden: {azimuth: 232, elevation: 18, warmth: 1, shadowStrength: 0.8},
    dusk: {azimuth: 268, elevation: 11, warmth: 0.5, shadowStrength: 0.4},
}

export const TIME_OF_DAY_LABELS: Readonly<Record<TimeOfDay, string>> = {
    morning: 'Morning',
    midday: 'Midday',
    golden: 'Golden',
    dusk: 'Dusk',
}

/** The unit vector pointing from the tree toward the sun. */
export function sunDirection(lighting: SceneLighting): THREE.Vector3 {
    const azimuth = THREE.MathUtils.degToRad(lighting.azimuth)
    const elevation = THREE.MathUtils.degToRad(lighting.elevation)

    return new THREE.Vector3(
        Math.cos(elevation) * Math.sin(azimuth),
        Math.sin(elevation),
        Math.cos(elevation) * Math.cos(azimuth),
    ).normalize()
}

/** The colour of the sunlight. Cool white through to deep golden. */
export function sunColor(warmth: number): THREE.Color {
    return new THREE.Color().lerpColors(
        new THREE.Color('#fff4e2'),
        new THREE.Color('#ffb35c'),
        THREE.MathUtils.clamp(warmth, 0, 1),
    )
}

/** The colour of the sky and ground bounce. */
export function ambientColor(warmth: number): THREE.Color {
    return new THREE.Color().lerpColors(
        new THREE.Color('#c6dcea'),
        new THREE.Color('#d9c9a8'),
        THREE.MathUtils.clamp(warmth, 0, 1),
    )
}

/**
 * The sun's place in the sky, as a position in a compass dial.
 *
 * `x` and `y` are in the range -1 to 1. The sun is drawn nearer the centre
 * as it gets higher, which is how the sky looks from the ground.
 */
export function sunDialPosition(lighting: SceneLighting): {x: number; y: number} {
    const azimuth = THREE.MathUtils.degToRad(lighting.azimuth)
    const height = THREE.MathUtils.clamp(lighting.elevation, 0, 90) / 90
    const radius = 1 - height * 0.72

    return {
        x: Math.sin(azimuth) * radius,
        y: -Math.cos(azimuth) * radius,
    }
}

/**
 * Turns a point on the compass dial back into a sun position.
 */
export function sunDialToAngles(x: number, y: number): {azimuth: number; elevation: number} {
    const radius = Math.min(Math.sqrt(x * x + y * y), 1)
    const azimuth = (Math.atan2(x, -y) * 180) / Math.PI

    return {
        azimuth: (azimuth + 360) % 360,
        elevation: (1 - radius) * (90 / 0.72),
    }
}
