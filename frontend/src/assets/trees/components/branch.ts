/**
 * A branch.
 *
 * Built in local space, starting at the origin and extending along the
 * positive X axis. The component's transform places and turns it, which is
 * what lets a branch attach to any parent at any angle.
 */

import * as THREE from 'three'
import {z} from 'zod'
import type {PartGenerator} from '../../shared/generator-types'
import {buildTaperedTube, taperedRadius} from '../../shared/geometry-utils'
import {
    numberSchema,
    validateParameters,
    type ParameterSpec,
    type ValidationResult,
} from '../../shared/parameters'

export type BranchParameters = {
    readonly length: number
    readonly baseRadius: number
    readonly tipRadius: number
    readonly bend: number
    readonly curl: number
    readonly twist: number
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

const branchSchema = z.object({
    length: numberSchema(LENGTH),
    baseRadius: numberSchema(THICKNESS),
    tipRadius: numberSchema(TAPER),
    bend: numberSchema(BEND),
    curl: numberSchema(CURL),
    twist: numberSchema(TWIST),
})

/** How many points along a branch. */
const BRANCH_POINTS = 5

export const branchGenerator: PartGenerator<BranchParameters> = {
    id: 'branch',
    version: 1,
    type: 'branch',
    label: 'Branch',
    parameters: branchParameterSpecs,

    createDefaultParameters(): BranchParameters {
        return {
            length: LENGTH.default,
            baseRadius: THICKNESS.default,
            tipRadius: TAPER.default,
            bend: BEND.default,
            curl: CURL.default,
            twist: TWIST.default,
        }
    },

    validate(parameters: unknown): ValidationResult<BranchParameters> {
        return validateParameters(branchSchema, parameters, this.createDefaultParameters())
    },

    generate(parameters, context) {
        const points: THREE.Vector3[] = []
        const radii: number[] = []

        const twist = THREE.MathUtils.degToRad(parameters.twist)

        for (let i = 0; i < BRANCH_POINTS; i++) {
            const t = i / (BRANCH_POINTS - 1)

            const point = new THREE.Vector3(
                parameters.length * t,
                parameters.length * parameters.bend * t * t,
                parameters.length * parameters.curl * t * t,
            )

            if (twist !== 0) {
                point.applyAxisAngle(new THREE.Vector3(1, 0, 0), twist * t)
            }

            points.push(point)
            radii.push(taperedRadius(parameters.baseRadius, parameters.tipRadius, t))
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
