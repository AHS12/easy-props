/**
 * An exposed root.
 *
 * Built in local space, starting at the origin and extending along the
 * positive X axis while sloping down to the ground.
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

export type RootParameters = {
    readonly length: number
    readonly baseRadius: number
    readonly tipRadius: number
    readonly drop: number
    readonly curl: number
}

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

export const rootParameterSpecs: readonly ParameterSpec[] = [
    LENGTH,
    THICKNESS,
    TAPER,
    DROP,
    CURL,
]

const rootSchema = z.object({
    length: numberSchema(LENGTH),
    baseRadius: numberSchema(THICKNESS),
    tipRadius: numberSchema(TAPER),
    drop: numberSchema(DROP),
    curl: numberSchema(CURL),
})

const ROOT_POINTS = 4

export const rootGenerator: PartGenerator<RootParameters> = {
    id: 'root',
    version: 1,
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
        }
    },

    validate(parameters: unknown): ValidationResult<RootParameters> {
        return validateParameters(rootSchema, parameters, this.createDefaultParameters())
    },

    generate(parameters, context) {
        const points: THREE.Vector3[] = []
        const radii: number[] = []

        for (let i = 0; i < ROOT_POINTS; i++) {
            const t = i / (ROOT_POINTS - 1)

            points.push(
                new THREE.Vector3(
                    parameters.length * t,
                    -parameters.drop * t * t,
                    parameters.length * parameters.curl * t * t,
                ),
            )

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
