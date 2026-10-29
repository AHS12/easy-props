/**
 * The trunk.
 *
 * A tapered form swept along a spine. The spine is the editable part: the
 * inspector drives Height, Thickness, Taper, Bend, and Twist, and the
 * handles in the viewport move the spine points directly.
 */

import * as THREE from 'three'
import {z} from 'zod'
import type {PartGenerator} from '../../shared/generator-types'
import {
    buildSpineCurve,
    buildSpinePoints,
    buildTaperedTube,
    taperedRadius,
    type SpinePoint,
} from '../../shared/geometry-utils'
import {
    choiceSchema,
    numberSchema,
    validateParameters,
    type ParameterSpec,
    type ValidationResult,
} from '../../shared/parameters'

export const SPINE_POINT_COUNT = 5

export type BendAmount = 'straight' | 'curved' | 'very-curved'

export type TrunkParameters = {
    readonly height: number
    readonly baseRadius: number
    readonly taper: number
    readonly bend: BendAmount
    readonly twist: number
    readonly spine: readonly SpinePoint[]
    /** Which way the seed made the trunk lean, in radians. */
    readonly leanAzimuth: number
    /** How much wobble the seed added on top of the steady lean. */
    readonly leanWobble: number
}

const HEIGHT = {
    kind: 'number',
    key: 'height',
    label: 'Height',
    help: 'How tall the trunk is.',
    min: 1,
    max: 12,
    step: 0.1,
    unit: 'm',
    default: 4.2,
} as const satisfies ParameterSpec

const THICKNESS = {
    kind: 'number',
    key: 'baseRadius',
    label: 'Thickness',
    help: 'How thick the trunk is at the base.',
    min: 0.05,
    max: 1.2,
    step: 0.01,
    unit: 'm',
    default: 0.32,
} as const satisfies ParameterSpec

const TAPER = {
    kind: 'number',
    key: 'taper',
    label: 'Taper',
    help: 'How much the trunk narrows toward the top.',
    min: 0.2,
    max: 1,
    step: 0.05,
    default: 0.55,
} as const satisfies ParameterSpec

const BEND = {
    kind: 'choice',
    key: 'bend',
    label: 'Bend',
    help: 'How much the trunk curves.',
    options: [
        {value: 'straight', label: 'Straight'},
        {value: 'curved', label: 'Curved'},
        {value: 'very-curved', label: 'Very curved'},
    ],
    default: 'curved',
} as const satisfies ParameterSpec

const TWIST = {
    kind: 'number',
    key: 'twist',
    label: 'Twist',
    help: 'How much the trunk spirals as it rises.',
    min: -180,
    max: 180,
    step: 5,
    unit: 'deg',
    default: 0,
} as const satisfies ParameterSpec

export const trunkParameterSpecs: readonly ParameterSpec[] = [
    HEIGHT,
    THICKNESS,
    TAPER,
    BEND,
    TWIST,
]

const spinePointSchema = z.object({
    t: z.number().min(0).max(1),
    x: z.number(),
    z: z.number(),
})

const trunkSchema = z.object({
    height: numberSchema(HEIGHT),
    baseRadius: numberSchema(THICKNESS),
    taper: numberSchema(TAPER),
    bend: choiceSchema(BEND),
    twist: numberSchema(TWIST),
    spine: z.array(spinePointSchema).min(2).catch([]),
    leanAzimuth: z.number().catch(0),
    leanWobble: z.number().catch(0),
})

/** How far the trunk leans, as a fraction of its height. */
const BEND_AMOUNTS: Readonly<Record<BendAmount, number>> = {
    straight: 0,
    curved: 0.12,
    'very-curved': 0.3,
}

/**
 * Builds a default spine for a trunk.
 *
 * The lean direction and the wobble come from the seed, so a tree keeps its
 * shape between sessions.
 */
export function buildTrunkSpine(
    bend: BendAmount,
    height: number,
    azimuth: number,
    wobble: number,
): SpinePoint[] {
    const amount = BEND_AMOUNTS[bend] * height
    const points: SpinePoint[] = []

    for (let i = 0; i < SPINE_POINT_COUNT; i++) {
        const t = i / (SPINE_POINT_COUNT - 1)
        const offset = amount * Math.pow(t, 1.6) + wobble * Math.sin(t * Math.PI * 2) * t

        points.push({
            t,
            x: Math.cos(azimuth) * offset,
            z: Math.sin(azimuth) * offset,
        })
    }

    return points
}

/**
 * Re-derives the spine for a different Bend amount.
 *
 * The lean direction and the wobble came from the seed, so they are kept:
 * only the size of the lean changes. Changing Bend therefore replaces a
 * dragged spine, which is the rule that keeps the control from going dead
 * once a handle has been moved.
 */
export function respineForBend(
    bend: BendAmount,
    height: number,
    leanAzimuth: number,
    leanWobble: number,
): SpinePoint[] {
    return buildTrunkSpine(bend, height, leanAzimuth, leanWobble)
}

/** The default spine for a straight trunk. */
export function defaultSpine(): SpinePoint[] {
    return buildTrunkSpine('curved', 4.2, 0, 0)
}

export const trunkGenerator: PartGenerator<TrunkParameters> = {
    id: 'trunk',
    version: 1,
    type: 'trunk',
    label: 'Trunk',
    parameters: trunkParameterSpecs,

    createDefaultParameters(): TrunkParameters {
        return {
            height: HEIGHT.default,
            baseRadius: THICKNESS.default,
            taper: TAPER.default,
            bend: BEND.default,
            twist: TWIST.default,
            spine: defaultSpine(),
            leanAzimuth: 0,
            leanWobble: 0,
        }
    },

    validate(parameters: unknown): ValidationResult<TrunkParameters> {
        const result = validateParameters(trunkSchema, parameters, this.createDefaultParameters())

        // A validated trunk must always come out with a spine the handles can
        // find, derived from its own Bend when it has never been shaped.
        if (result.parameters.spine.length >= 2) {
            return result
        }

        return {
            ...result,
            parameters: {
                ...result.parameters,
                spine: defaultSpine(),
            },
        }
    },

    generate(parameters: TrunkParameters, context) {
        const spine = parameters.spine.length >= 2 ? parameters.spine : defaultSpine()

        const controlPoints = buildSpinePoints(spine, parameters.height, parameters.twist)
        const curve = buildSpineCurve(controlPoints)

        const rings = Math.max(context.style.heightSegments * 2, 6)
        const points: THREE.Vector3[] = []
        const radii: number[] = []

        const tipRadius = parameters.baseRadius * parameters.taper

        for (let i = 0; i <= rings; i++) {
            const t = i / rings
            points.push(curve.getPoint(t))
            radii.push(taperedRadius(parameters.baseRadius, tipRadius, t))
        }

        const geometry = buildTaperedTube({
            points,
            radii,
            radialSegments: context.style.radialSegments,
            capBase: true,
            capTip: true,
        })

        if (context.style.flatShading) {
            geometry.deleteAttribute('normal')
            geometry.computeVertexNormals()
        }

        return {geometry, material: 'bark'}
    },
}
