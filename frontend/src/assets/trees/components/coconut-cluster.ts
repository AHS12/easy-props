/**
 * A bunch of coconuts.
 *
 * Low-poly shells hanging under the crown. They sit below the origin, which
 * is where the crown's stem is, and their own parameters are all a bunch of
 * coconuts ever needs.
 */

import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {z} from 'zod'
import type {PartGenerator} from '../../shared/generator-types'
import {
    numberSchema,
    validateParameters,
    type ParameterSpec,
    type ValidationResult,
} from '../../shared/parameters'
import {createSeededRandom, hashSeed} from '../../shared/random'

export type CoconutClusterParameters = {
    readonly count: number
    readonly size: number
    readonly spread: number
}

const COCONUT_SALT = 7331

const COUNT = {
    kind: 'number',
    key: 'count',
    label: 'Coconuts',
    help: 'How many coconuts hang in the bunch.',
    min: 1,
    max: 8,
    step: 1,
    unit: 'count',
    default: 4,
} as const satisfies ParameterSpec

const SIZE = {
    kind: 'number',
    key: 'size',
    label: 'Size',
    help: 'How wide each coconut is.',
    min: 0.06,
    max: 0.4,
    step: 0.01,
    unit: 'm',
    default: 0.16,
} as const satisfies ParameterSpec

const SPREAD = {
    kind: 'number',
    key: 'spread',
    label: 'Spread',
    help: 'How far apart the coconuts hang.',
    min: 0,
    max: 0.5,
    step: 0.01,
    unit: 'm',
    default: 0.18,
} as const satisfies ParameterSpec

export const coconutClusterParameterSpecs: readonly ParameterSpec[] = [COUNT, SIZE, SPREAD]

const coconutClusterSchema = z.object({
    count: numberSchema(COUNT),
    size: numberSchema(SIZE),
    spread: numberSchema(SPREAD),
})

export const coconutClusterGenerator: PartGenerator<CoconutClusterParameters> = {
    id: 'coconut-cluster',
    version: 1,
    type: 'coconut-cluster',
    label: 'Coconut',
    parameters: coconutClusterParameterSpecs,

    createDefaultParameters(): CoconutClusterParameters {
        return {
            count: COUNT.default,
            size: SIZE.default,
            spread: SPREAD.default,
        }
    },

    validate(parameters: unknown): ValidationResult<CoconutClusterParameters> {
        return validateParameters(
            coconutClusterSchema,
            parameters,
            this.createDefaultParameters(),
        )
    },

    generate(parameters, context) {
        const count = Math.max(1, Math.round(parameters.count))
        const radius = parameters.size / 2

        // Seeded from the component rather than taken from the context's
        // source, so the bunch still spreads out when that source is flat.
        const random = createSeededRandom(hashSeed(context.seed, COCONUT_SALT))

        const shells = Array.from({length: count}, () => {
            const angle = random() * Math.PI * 2
            const distance = Math.sqrt(random()) * parameters.spread
            const depth = parameters.size * (0.7 + random() * 1.0)
            const shell = new THREE.IcosahedronGeometry(radius * (0.85 + random() * 0.3), 1)

            shell.translate(Math.cos(angle) * distance, -depth, Math.sin(angle) * distance)

            return shell
        })

        const geometry = mergeGeometries(shells, false) ?? shells[0]

        if (context.style.flatShading) {
            geometry.deleteAttribute('normal')
            geometry.computeVertexNormals()
        }

        return {geometry, material: 'coconut'}
    },
}
