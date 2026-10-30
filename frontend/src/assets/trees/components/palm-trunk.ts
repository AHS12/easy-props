/**
 * A palm trunk.
 *
 * The same tapered stem as the trunk, with rings of old leaf scars round it.
 * It keeps the trunk's spine, so the same handles shape it and the same
 * controls put it back.
 */

import * as THREE from 'three'
import {z} from 'zod'
import type {SurfacePush} from '../../shared/component-types'
import type {PartGenerator} from '../../shared/generator-types'
import {
    applySurfacePushes,
    buildSpineCurve,
    buildSpinePoints,
    buildTaperedTube,
    taperedRadius,
    type SpinePoint,
} from '../../shared/geometry-utils'
import {surfacePushSchema} from '../../shared/pushes'
import {normaliseSpine} from '../../shared/spines'
import {
    choiceSchema,
    numberSchema,
    validateParameters,
    type ParameterSpec,
    type ValidationResult,
} from '../../shared/parameters'
import {buildTrunkSpine, type BendAmount} from './trunk'

export const PALM_TRUNK_POINTS = 5

export type PalmTrunkParameters = {
    readonly height: number
    readonly baseRadius: number
    readonly taper: number
    readonly rings: number
    readonly ringDepth: number
    readonly twist: number
    readonly bend: BendAmount
    /** How many points the spine has, which is how many handles it shows. */
    readonly controlPoints: number
    readonly spine: readonly SpinePoint[]
    /** Which way the seed made the trunk lean, in radians. */
    readonly leanAzimuth: number
    /** How much wobble the seed added on top of the steady lean. */
    readonly leanWobble: number
    /** Pushes and pulls on the bark, applied to the built mesh. */
    readonly pushes: readonly SurfacePush[]
}

const HEIGHT = {
    kind: 'number',
    key: 'height',
    label: 'Height',
    help: 'How tall the palm is.',
    min: 1,
    max: 18,
    step: 0.1,
    unit: 'm',
    default: 5.5,
} as const satisfies ParameterSpec

const THICKNESS = {
    kind: 'number',
    key: 'baseRadius',
    label: 'Thickness',
    help: 'How thick the trunk is at the base.',
    min: 0.08,
    max: 1.2,
    step: 0.01,
    unit: 'm',
    default: 0.34,
} as const satisfies ParameterSpec

const TAPER = {
    kind: 'number',
    key: 'taper',
    label: 'Taper',
    help: 'How much the trunk narrows toward the top.',
    min: 0.2,
    max: 1,
    step: 0.01,
    default: 0.72,
} as const satisfies ParameterSpec

const RINGS = {
    kind: 'number',
    key: 'rings',
    label: 'Rings',
    help: 'How many leaf scars run round the trunk.',
    min: 0,
    max: 40,
    step: 1,
    unit: 'count',
    default: 14,
} as const satisfies ParameterSpec

const RING_DEPTH = {
    kind: 'number',
    key: 'ringDepth',
    label: 'Ring depth',
    help: 'How deeply the scars cut in. Zero leaves the trunk plain.',
    min: 0,
    max: 0.3,
    step: 0.01,
    default: 0.08,
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

const CONTROL_POINTS = {
    kind: 'number',
    key: 'controlPoints',
    label: 'Control points',
    help: 'How many points you can drag. More points let the trunk curve in more places.',
    min: 3,
    max: 12,
    step: 1,
    unit: 'count',
    default: PALM_TRUNK_POINTS,
} as const satisfies ParameterSpec

export const palmTrunkParameterSpecs: readonly ParameterSpec[] = [
    HEIGHT,
    THICKNESS,
    TAPER,
    RINGS,
    RING_DEPTH,
    TWIST,
    BEND,
    CONTROL_POINTS,
]

const spinePointSchema = z.object({
    t: z.number().min(0).max(1),
    x: z.number(),
    z: z.number(),
})

const palmTrunkSchema = z.object({
    height: numberSchema(HEIGHT),
    baseRadius: numberSchema(THICKNESS),
    taper: numberSchema(TAPER),
    rings: numberSchema(RINGS),
    ringDepth: numberSchema(RING_DEPTH),
    twist: numberSchema(TWIST),
    bend: choiceSchema(BEND),
    controlPoints: numberSchema(CONTROL_POINTS),
    spine: z.array(spinePointSchema).min(2).catch([]),
    leanAzimuth: z.number().catch(0),
    leanWobble: z.number().catch(0),
    pushes: z.array(surfacePushSchema).catch([]),
})

/** How far round the trunk the rings sit, between one and zero. */
function ringProfile(rings: number, t: number): number {
    return 0.5 + 0.5 * Math.cos(Math.PI * 2 * rings * t)
}

export const palmTrunkGenerator: PartGenerator<PalmTrunkParameters> = {
    id: 'palm-trunk',
    version: 1,
    type: 'trunk',
    label: 'Palm trunk',
    parameters: palmTrunkParameterSpecs,

    createDefaultParameters(): PalmTrunkParameters {
        const controlPoints = CONTROL_POINTS.default

        return {
            height: HEIGHT.default,
            baseRadius: THICKNESS.default,
            taper: TAPER.default,
            rings: RINGS.default,
            ringDepth: RING_DEPTH.default,
            twist: TWIST.default,
            bend: BEND.default,
            controlPoints,
            spine: buildTrunkSpine(BEND.default, HEIGHT.default, 0, 0, controlPoints),
            leanAzimuth: 0,
            leanWobble: 0,
            pushes: [],
        }
    },

    validate(parameters: unknown): ValidationResult<PalmTrunkParameters> {
        const result = validateParameters(
            palmTrunkSchema,
            parameters,
            this.createDefaultParameters(),
        )
        const {bend, height, leanAzimuth, leanWobble, controlPoints, spine} = result.parameters

        return {
            ...result,
            parameters: {
                ...result.parameters,
                spine: normaliseSpine(spine, 'vertical', controlPoints, () =>
                    buildTrunkSpine(bend, height, leanAzimuth, leanWobble, controlPoints),
                ),
            },
        }
    },

    generate(parameters, context) {
        const spine =
            parameters.spine.length >= 2
                ? parameters.spine
                : buildTrunkSpine(
                      parameters.bend,
                      parameters.height,
                      parameters.leanAzimuth,
                      parameters.leanWobble,
                      parameters.controlPoints,
                  )

        const curve = buildSpineCurve(
            buildSpinePoints(spine, parameters.height, parameters.twist),
        )

        const tipRadius = parameters.baseRadius * parameters.taper
        const samples = Math.max(12, Math.round(parameters.rings * 2 + 8))
        const radialSegments = Math.min(9, Math.max(7, context.style.radialSegments + 2))

        const points: THREE.Vector3[] = []
        const radii: number[] = []

        for (let i = 0; i <= samples; i++) {
            const t = i / samples
            const ring = ringProfile(parameters.rings, t)

            points.push(curve.getPoint(t))
            radii.push(
                taperedRadius(parameters.baseRadius, tipRadius, t) *
                    (1 - parameters.ringDepth * ring),
            )
        }

        const geometry = buildTaperedTube({
            points,
            radii,
            radialSegments,
            capBase: true,
            capTip: true,
        })

        // Pushes move the surface, then the shading follows the new shape.
        applySurfacePushes(geometry, parameters.pushes)

        if (context.style.flatShading) {
            geometry.deleteAttribute('normal')
            geometry.computeVertexNormals()
        }

        return {geometry, material: 'bark'}
    },
}
