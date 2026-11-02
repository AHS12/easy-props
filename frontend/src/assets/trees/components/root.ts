/**
 * An exposed root.
 *
 * Built in local space, starting at the origin and extending along the
 * positive X axis while sloping down to the ground.
 */

import {z} from 'zod'
import type {LimbSpinePoint} from '../../shared/component-types'
import type {PartGenerator} from '../../shared/generator-types'
import {buildTaperedTube, taperedRadius} from '../../shared/geometry-utils'
import {
    numberSchema,
    validateParameters,
    type ParameterSpec,
    type ValidationResult,
} from '../../shared/parameters'
import {spinePointPosition, normaliseSpine} from '../../shared/spines'

export type RootParameters = {
    readonly length: number
    readonly baseRadius: number
    readonly tipRadius: number
    readonly drop: number
    readonly curl: number
    /** How many points the spine has, which is how many handles it shows. */
    readonly controlPoints: number
    /** The draggable spine. Empty means "build the default from drop and curl". */
    readonly spine: readonly LimbSpinePoint[]
}

/** How many points along a root by default. */
export const ROOT_POINTS = 4

const LENGTH = {
    kind: 'number',
    key: 'length',
    label: 'Length',
    help: 'How far the root reaches.',
    min: 0.2,
    max: 3,
    step: 0.1,
    unit: 'm',
    default: 1.1,
} as const satisfies ParameterSpec

const THICKNESS = {
    kind: 'number',
    key: 'baseRadius',
    label: 'Thickness',
    help: 'How thick the root is where it meets the trunk.',
    min: 0.01,
    max: 0.5,
    step: 0.01,
    unit: 'm',
    default: 0.12,
} as const satisfies ParameterSpec

const TAPER = {
    kind: 'number',
    key: 'tipRadius',
    label: 'Tip thickness',
    min: 0.005,
    max: 0.2,
    step: 0.005,
    unit: 'm',
    default: 0.02,
} as const satisfies ParameterSpec

const DROP = {
    kind: 'number',
    key: 'drop',
    label: 'Drop',
    help: 'How far the root sinks toward the ground.',
    min: 0,
    max: 1.5,
    step: 0.05,
    unit: 'm',
    default: 0.35,
} as const satisfies ParameterSpec

const CURL = {
    kind: 'number',
    key: 'curl',
    label: 'Curl',
    min: -0.6,
    max: 0.6,
    step: 0.05,
    default: 0.15,
} as const satisfies ParameterSpec

const CONTROL_POINTS = {
    kind: 'number',
    key: 'controlPoints',
    label: 'Control points',
    help: 'How many points you can drag. More points let the root bend in more places.',
    min: 3,
    max: 12,
    step: 1,
    unit: 'count',
    default: ROOT_POINTS,
} as const satisfies ParameterSpec

export const rootParameterSpecs: readonly ParameterSpec[] = [
    LENGTH,
    THICKNESS,
    TAPER,
    DROP,
    CURL,
    CONTROL_POINTS,
]

const limbSpinePointSchema = z.object({
    t: z.number().min(0).max(1),
    y: z.number(),
    z: z.number(),
})

const rootSchema = z.object({
    length: numberSchema(LENGTH),
    baseRadius: numberSchema(THICKNESS),
    tipRadius: numberSchema(TAPER),
    drop: numberSchema(DROP),
    curl: numberSchema(CURL),
    controlPoints: numberSchema(CONTROL_POINTS),
    spine: z.array(limbSpinePointSchema).min(2).catch([]),
})

/**
 * The default spine for a root.
 *
 * Drop sinks the root toward the ground and curl sweeps it sideways, so it
 * leaves the trunk level and disappears before it reaches open air.
 */
export function buildRootSpine(
    drop: number,
    curl: number,
    length: number,
    count = ROOT_POINTS,
): LimbSpinePoint[] {
    const points = Math.max(2, Math.round(count))

    return Array.from({length: points}, (_, index) => {
        const t = index / (points - 1)

        return {t, y: -drop * t * t, z: length * curl * t * t}
    })
}

export const rootGenerator: PartGenerator<RootParameters> = {
    id: 'root',
    version: 2,
    type: 'root',
    label: 'Root',
    parameters: rootParameterSpecs,

    createDefaultParameters(): RootParameters {
        return {
            length: LENGTH.default,
            baseRadius: THICKNESS.default,
            tipRadius: TAPER.default,
            drop: DROP.default,
            curl: CURL.default,
            controlPoints: CONTROL_POINTS.default,
            spine: buildRootSpine(DROP.default, CURL.default, LENGTH.default),
        }
    },

    validate(parameters: unknown): ValidationResult<RootParameters> {
        const result = validateParameters(rootSchema, parameters, this.createDefaultParameters())
        const {drop, curl, length, controlPoints, spine} = result.parameters

        return {
            ...result,
            parameters: {
                ...result.parameters,
                spine: normaliseSpine(spine, 'outward', controlPoints, () =>
                    buildRootSpine(drop, curl, length, controlPoints),
                ),
            },
        }
    },

    generate(parameters, context) {
        const spine =
            parameters.spine.length >= 2
                ? parameters.spine
                : buildRootSpine(
                      parameters.drop,
                      parameters.curl,
                      parameters.length,
                      parameters.controlPoints,
                  )

        const points = spine.map((point) =>
            spinePointPosition(point, 'outward', parameters.length),
        )

        const radii = spine.map((point) =>
            taperedRadius(parameters.baseRadius, parameters.tipRadius, point.t),
        )

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
