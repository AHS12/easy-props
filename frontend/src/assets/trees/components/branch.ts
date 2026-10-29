/**
 * A branch.
 *
 * Built in local space, starting at the origin and extending along the
 * positive X axis. The component's transform places and turns it, which is
 * what lets a branch attach to any parent at any angle.
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
import {spinePointPosition} from '../../shared/spines'

export type BranchParameters = {
    readonly length: number
    readonly baseRadius: number
    readonly tipRadius: number
    readonly bend: number
    readonly curl: number
    readonly twist: number
    /** The draggable spine. Empty means "build the default from bend and curl". */
    readonly spine: readonly LimbSpinePoint[]
}

const LENGTH = {
    kind: 'number',
    key: 'length',
    label: 'Length',
    help: 'How long the branch is.',
    min: 0.3,
    max: 6,
    step: 0.1,
    unit: 'm',
    default: 1.8,
} as const satisfies ParameterSpec

const THICKNESS = {
    kind: 'number',
    key: 'baseRadius',
    label: 'Thickness',
    help: 'How thick the branch is where it meets the trunk.',
    min: 0.01,
    max: 0.5,
    step: 0.01,
    unit: 'm',
    default: 0.1,
} as const satisfies ParameterSpec

const TAPER = {
    kind: 'number',
    key: 'tipRadius',
    label: 'Tip thickness',
    help: 'How thin the branch gets at its end.',
    min: 0.005,
    max: 0.3,
    step: 0.005,
    unit: 'm',
    default: 0.03,
} as const satisfies ParameterSpec

const BEND = {
    kind: 'number',
    key: 'bend',
    label: 'Bend',
    help: 'How much the branch curves upward.',
    min: -0.4,
    max: 1.2,
    step: 0.05,
    default: 0.45,
} as const satisfies ParameterSpec

const CURL = {
    kind: 'number',
    key: 'curl',
    label: 'Curl',
    help: 'How much the branch swings sideways.',
    min: -0.6,
    max: 0.6,
    step: 0.05,
    default: 0.1,
} as const satisfies ParameterSpec

const TWIST = {
    kind: 'number',
    key: 'twist',
    label: 'Twist',
    min: -180,
    max: 180,
    step: 5,
    unit: 'deg',
    default: 0,
} as const satisfies ParameterSpec

export const branchParameterSpecs: readonly ParameterSpec[] = [
    LENGTH,
    THICKNESS,
    TAPER,
    BEND,
    CURL,
    TWIST,
]

const limbSpinePointSchema = z.object({
    t: z.number().min(0).max(1),
    y: z.number(),
    z: z.number(),
})

const branchSchema = z.object({
    length: numberSchema(LENGTH),
    baseRadius: numberSchema(THICKNESS),
    tipRadius: numberSchema(TAPER),
    bend: numberSchema(BEND),
    curl: numberSchema(CURL),
    twist: numberSchema(TWIST),
    spine: z.array(limbSpinePointSchema).min(2).catch([]),
})

/** How many points along a branch. */
export const BRANCH_POINTS = 5

/**
 * The default spine for a branch.
 *
 * Bend lifts the branch and curl swings it sideways, both growing toward the
 * tip, so the end that attaches to its parent stays where it is.
 */
export function buildBranchSpine(
    bend: number,
    curl: number,
    length: number,
): LimbSpinePoint[] {
    return Array.from({length: BRANCH_POINTS}, (_, index) => {
        const t = index / (BRANCH_POINTS - 1)

        return {t, y: length * bend * t * t, z: length * curl * t * t}
    })
}

export const branchGenerator: PartGenerator<BranchParameters> = {
    id: 'branch',
    version: 1,
    type: 'branch',
    label: 'Branch',
    parameters: branchParameterSpecs,

    createDefaultParameters(): BranchParameters {
        const bend = BEND.default
        const curl = CURL.default

        return {
            length: LENGTH.default,
            baseRadius: THICKNESS.default,
            tipRadius: TAPER.default,
            bend,
            curl,
            twist: TWIST.default,
            spine: buildBranchSpine(bend, curl, LENGTH.default),
        }
    },

    validate(parameters: unknown): ValidationResult<BranchParameters> {
        const result = validateParameters(branchSchema, parameters, this.createDefaultParameters())

        // A library entry only names the values it cares about, so a validated
        // part must always come out with a spine the handles can find.
        if (result.parameters.spine.length >= 2) {
            return result
        }

        return {
            ...result,
            parameters: {
                ...result.parameters,
                spine: buildBranchSpine(
                    result.parameters.bend,
                    result.parameters.curl,
                    result.parameters.length,
                ),
            },
        }
    },

    generate(parameters, context) {
        const spine =
            parameters.spine.length >= 2
                ? parameters.spine
                : buildBranchSpine(parameters.bend, parameters.curl, parameters.length)

        const points = spine.map((point) =>
            spinePointPosition(point, 'outward', parameters.length, parameters.twist),
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
