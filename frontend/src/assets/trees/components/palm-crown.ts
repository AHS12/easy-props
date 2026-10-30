/**
 * A palm crown.
 *
 * The stubby knob where the fronds leave the trunk. A squashed icosahedron
 * with a ring of small bulges round its rim, one for each frond base.
 */

import * as THREE from 'three'
import {z} from 'zod'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type {PartGenerator} from '../../shared/generator-types'
import {displaceGeometry} from '../../shared/geometry-utils'
import {hashSeed} from '../../shared/random'
import {
    numberSchema,
    validateParameters,
    type ParameterSpec,
    type ValidationResult,
} from '../../shared/parameters'

export type PalmCrownParameters = {
    readonly size: number
    readonly spread: number
    readonly lobes: number
}

const SIZE = {
    kind: 'number',
    key: 'size',
    label: 'Size',
    help: 'How big the knob where the fronds meet the trunk is.',
    min: 0.1,
    max: 1.2,
    step: 0.02,
    unit: 'm',
    default: 0.42,
} as const satisfies ParameterSpec

const SPREAD = {
    kind: 'number',
    key: 'spread',
    label: 'Spread',
    help: 'How far the frond bases sit out from the middle.',
    min: 0.05,
    max: 1,
    step: 0.02,
    unit: 'm',
    default: 0.3,
} as const satisfies ParameterSpec

const LOBES = {
    kind: 'number',
    key: 'lobes',
    label: 'Lobes',
    help: 'How many frond bases sit round the rim.',
    min: 0,
    max: 12,
    step: 1,
    unit: 'count',
    default: 6,
} as const satisfies ParameterSpec

export const palmCrownParameterSpecs: readonly ParameterSpec[] = [SIZE, SPREAD, LOBES]

const palmCrownSchema = z.object({
    size: numberSchema(SIZE),
    spread: numberSchema(SPREAD),
    lobes: numberSchema(LOBES),
})

/** Every share below is of the crown's size. */
const BODY_WIDTH = 0.95
const LOBE_WIDTH = 0.16
const LOBE_HEIGHT = 0.6
const RIM_SHARE = 0.8
const RIM_SPREAD = 0.5
const LOBE_SPREAD = 0.06
const IRREGULARITY = 0.04
/** The body stops short of the full half height by the room the noise takes. */
const BODY_HEIGHT = 0.5 - IRREGULARITY

export const palmCrownGenerator: PartGenerator<PalmCrownParameters> = {
    id: 'palm-crown',
    version: 1,
    type: 'palm-crown',
    label: 'Palm crown',
    parameters: palmCrownParameterSpecs,

    createDefaultParameters(): PalmCrownParameters {
        return {
            size: SIZE.default,
            spread: SPREAD.default,
            lobes: LOBES.default,
        }
    },

    validate(parameters: unknown): ValidationResult<PalmCrownParameters> {
        return validateParameters(palmCrownSchema, parameters, this.createDefaultParameters())
    },

    generate(parameters, context) {
        const {size, spread} = parameters
        const count = Math.max(0, Math.round(parameters.lobes))

        const body = new THREE.IcosahedronGeometry(1, 1)
        body.scale(size * BODY_WIDTH, size * BODY_HEIGHT, size * BODY_WIDTH)

        const pieces: THREE.BufferGeometry[] = [body]
        const lobeRadius = size * LOBE_WIDTH + spread * LOBE_SPREAD
        const rim = size * RIM_SHARE + spread * RIM_SPREAD

        for (let index = 0; index < count; index++) {
            const angle = ((index + (context.random() - 0.5) * 0.6) / count) * Math.PI * 2
            const reach = rim * (0.85 + context.random() * 0.3)
            const lift = (context.random() - 0.5) * size * 0.16

            const lobe = new THREE.IcosahedronGeometry(lobeRadius, 0)
            lobe.scale(1, LOBE_HEIGHT, 1)
            lobe.translate(Math.cos(angle) * reach, lift, Math.sin(angle) * reach)

            pieces.push(lobe)
        }

        const merged = mergeGeometries(pieces)
        const geometry = merged ?? new THREE.IcosahedronGeometry(size * BODY_WIDTH, 1)

        displaceGeometry(geometry, size * IRREGULARITY, 2.2, hashSeed(context.seed, 21))

        if (context.style.flatShading) {
            geometry.deleteAttribute('normal')
            geometry.computeVertexNormals()
        }

        geometry.computeBoundingSphere()

        return {geometry, material: 'bark-light'}
    },
}
