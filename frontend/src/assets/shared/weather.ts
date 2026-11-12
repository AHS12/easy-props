/**
 * Snow, wet and where moss grows, the same on every kind of prop.
 *
 * All of it is colour on the points a prop already has, so leaves still sway, a
 * lighter level keeps it, and none of it costs a face. Every setting starts at
 * nothing, which leaves a prop exactly as it was.
 */

import * as THREE from 'three'
import type {PaintedSurface} from './generator-types'
import type {ChoiceParameter, NumberParameter} from './parameters'
import {choiceSchema, numberSchema} from './parameters'

export const WEATHER = 'Weather'

/** On top, as moss settles where rain sits, or on the side in shade, as it grows in damp places. */
export type MossFrom = 'sky' | 'shade'

/** Snow and wet, which every kind of prop has. */
export interface SnowAndWet {
    readonly snow: number
    readonly wet: number
}

/** And where moss grows, on the props that grow moss. */
export interface Weather extends SnowAndWet {
    readonly mossFrom: MossFrom
}

export const SNOW: NumberParameter = {
    kind: 'number',
    group: WEATHER,
    key: 'snow',
    label: 'Snow',
    help: 'White on whatever faces up, thickest on flat tops.',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0,
}

export const WET: NumberParameter = {
    kind: 'number',
    group: WEATHER,
    key: 'wet',
    label: 'Wet',
    help: 'Darker and shinier, as after rain or in a swamp.',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0,
}

export const MOSS_FROM: ChoiceParameter<MossFrom> = {
    kind: 'choice',
    group: WEATHER,
    key: 'mossFrom',
    label: 'Moss grows',
    help: 'On top, or on one side, as moss grows in damp shade. That side faces away from the sun when the view opens.',
    options: [
        {value: 'sky', label: 'On top'},
        {value: 'shade', label: 'On one side'},
    ],
    default: 'sky',
}

export const weatherDefaults: Weather = {snow: SNOW.default, wet: WET.default, mossFrom: MOSS_FROM.default}

export const weatherSchema = {
    snow: numberSchema(SNOW),
    wet: numberSchema(WET),
    mossFrom: choiceSchema(MOSS_FROM),
}

/** Snow and wet alone, for a kind of prop that grows no moss. */
export const snowAndWetDefaults: SnowAndWet = {snow: SNOW.default, wet: WET.default}

export const snowAndWetSchema = {
    snow: numberSchema(SNOW),
    wet: numberSchema(WET),
}

/**
 * The side in shade: away from the view's first sun, and a little up, so moss
 * still sits on ledges on that side rather than hanging under them.
 */
const SHADE: readonly [number, number, number] = (() => {
    const v = new THREE.Vector3(-0.788, 0.35, -0.616).normalize()

    return [v.x, v.y, v.z]
})()

/** How much a surface facing this way gets moss, as the up part of its facing does for moss on top. */
export const mossFacing = (nx: number, ny: number, nz: number, from: MossFrom): number =>
    from === 'shade' ? (nx * SHADE[0] + ny * SHADE[1] + nz * SHADE[2]) * 1.15 : ny

/** Snow, shadow to highlight. A little blue in its shade, as snow is. */
export const SNOW_RAMP: readonly string[] = ['#9fb3cc', '#dde7f2', '#ffffff']

const SNOW_SHADOW = new THREE.Color(SNOW_RAMP[0])
const SNOW_MIDDLE = new THREE.Color(SNOW_RAMP[1])
const SNOW_LIGHT = new THREE.Color(SNOW_RAMP[2])
const snowPaint = new THREE.Color()

/** How dark full Wet makes a colour, and how much richer. */
const WET_DARKEN = 0.42
const WET_RICHER = 0.25
const hsl = {h: 0, s: 0, l: 0}

/** Snow starts on the flattest tops and creeps down the sides as it deepens. */
const SNOW_REACH = 0.85
/** How soft the snow's edge is, in how far the facing turns. */
const SNOW_EDGE = 0.22

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * How much snow lies on a surface facing this far up, 0 to 1.
 *
 * `ny` is the up part of its facing. `blotch`, about -1 to 1, breaks the edge up so
 * it isn't a straight line round the prop.
 */
export function snowCover(ny: number, snow: number, blotch = 0): number {
    if (snow <= 0) {
        return 0
    }

    const from = 1 - snow * SNOW_REACH
    const t = clamp01((ny + blotch * 0.12 - from) / SNOW_EDGE)

    return t * t * (3 - 2 * t)
}

/**
 * The colour of snow at a point. `light`, 0 to 1, is how much the surface below
 * was lit, so snow keeps the shape the paint gave it.
 */
export function snowColour(light: number): THREE.Color {
    const value = clamp01(light)

    return value < 0.5
        ? snowPaint.copy(SNOW_SHADOW).lerp(SNOW_MIDDLE, value * 2)
        : snowPaint.copy(SNOW_MIDDLE).lerp(SNOW_LIGHT, (value - 0.5) * 2)
}

/** Darkens and deepens a colour in place, as water does. */
export function wetten(colour: THREE.Color, wet: number): THREE.Color {
    if (wet <= 0) {
        return colour
    }

    colour.getHSL(hsl)
    colour.setHSL(hsl.h, clamp01(hsl.s * (1 + WET_RICHER * wet)), hsl.l)

    return colour.multiplyScalar(1 - WET_DARKEN * wet)
}

/**
 * Snow, then wet, on a colour in place: wet first darkens what's below, and snow
 * covers it. Snow stays white on a wet prop, since it sits on top.
 */
export function weatherPaint(colour: THREE.Color, ny: number, weather: SnowAndWet, blotch = 0): THREE.Color {
    wetten(colour, weather.wet)

    const cover = snowCover(ny, weather.snow, blotch)

    if (cover > 0) {
        const light = (colour.r * 0.3 + colour.g * 0.59 + colour.b * 0.11) / Math.max(1 - WET_DARKEN * weather.wet, 0.1)

        colour.lerp(snowColour(0.55 + light * 0.6 + ny * 0.15), cover)
    }

    return colour
}

/** True when any of this changes a prop. */
export const hasWeather = (weather: SnowAndWet): boolean => weather.snow > 0 || weather.wet > 0

/** How rough a wet surface is, from the dry roughness. Water on a surface is shiny. */
export const wetRoughness = (dry: number, wet: number): number => dry * (1 - 0.55 * clamp01(wet))

const scratch = new THREE.Color()

/**
 * Weather on colours already laid down, by the facing stored beside them. For
 * parts whose painting has nothing finer to say about where snow sits.
 */
export function weatherColours(colors: ArrayLike<number> & {[index: number]: number}, normals: ArrayLike<number>, weather: SnowAndWet, from = 0): void {
    if (!hasWeather(weather)) {
        return
    }

    for (let i = from * 3; i + 2 < colors.length; i += 3) {
        scratch.setRGB(colors[i], colors[i + 1], colors[i + 2])
        weatherPaint(scratch, normals[i + 1], weather, Math.sin(Math.floor(i / 9) * 12.9898) * 0.6)
        colors[i] = scratch.r
        colors[i + 1] = scratch.g
        colors[i + 2] = scratch.b
    }
}

/** The same, on a finished geometry's colour attribute. */
export function weatherGeometry(geometry: THREE.BufferGeometry, weather: SnowAndWet): THREE.BufferGeometry {
    const colour = geometry.getAttribute('color')
    const normal = geometry.getAttribute('normal')

    if (!colour || !normal || !hasWeather(weather)) {
        return geometry
    }

    weatherColours(colour.array as Float32Array, normal.array as Float32Array, weather)
    colour.needsUpdate = true

    return geometry
}

/** A painted surface made shinier by Wet. Unchanged when dry, so a dry prop's file is as it was. */
export function wetSurface(surface: PaintedSurface, wet: number): PaintedSurface {
    return wet > 0 ? {...surface, roughness: wetRoughness(surface.roughness ?? 1, wet)} : surface
}
