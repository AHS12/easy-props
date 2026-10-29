/**
 * A clump of leaves.
 *
 * A deformed sphere. The shape decides the silhouette, and a little
 * deterministic noise keeps it from looking like a ball.
 */

import * as THREE from 'three'
import {z} from 'zod'
import type {PartGenerator} from '../../shared/generator-types'
import {valueNoise3} from '../../shared/geometry-utils'
import {hashSeed} from '../../shared/random'
import {
    choiceSchema,
    numberSchema,
    validateParameters,
    type ParameterSpec,
    type ValidationResult,
} from '../../shared/parameters'

export type FoliageShape = 'round' | 'oval' | 'flat' | 'tall' | 'irregular' | 'layered'

export type FoliageParameters = {
    readonly shape: FoliageShape
    readonly size: number
    readonly roughness: number
}

const SHAPE = {
    kind: 'choice',
    key: 'shape',
    label: 'Shape',
    help: 'The overall shape of the leaves.',
    options: [
        {value: 'round', label: 'Round'},
        {value: 'oval', label: 'Oval'},
        {value: 'flat', label: 'Flat'},
        {value: 'tall', label: 'Tall'},
        {value: 'irregular', label: 'Irregular'},
        {value: 'layered', label: 'Layered'},
    ],
    default: 'round',
} as const satisfies ParameterSpec

const SIZE = {
    kind: 'number',
    key: 'size',
    label: 'Size',
    help: 'How big the clump is.',
    min: 0.2,
    max: 3.5,
    step: 0.05,
    unit: 'm',
    default: 1.2,
} as const satisfies ParameterSpec

const ROUGHNESS = {
    kind: 'number',
    key: 'roughness',
    label: 'Roughness',
    help: 'How lumpy the leaves look.',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.35,
} as const satisfies ParameterSpec

export const foliageParameterSpecs: readonly ParameterSpec[] = [SHAPE, SIZE, ROUGHNESS]

const foliageSchema = z.object({
    shape: choiceSchema(SHAPE),
    size: numberSchema(SIZE),
    roughness: numberSchema(ROUGHNESS),
})

/** How each shape stretches the base sphere. */
const SHAPE_SCALES: Readonly<Record<FoliageShape, readonly [number, number, number]>> = {
    round: [1, 1, 1],
    oval: [0.85, 1.3, 0.85],
    flat: [1.3, 0.55, 1.3],
    tall: [0.8, 1.6, 0.8],
    irregular: [1, 0.95, 1],
    layered: [1.15, 0.85, 1.15],
}

export const foliageGenerator: PartGenerator<FoliageParameters> = {
    id: 'foliage-cluster',
    version: 1,
    type: 'foliage-cluster',
    label: 'Leaf clump',
    parameters: foliageParameterSpecs,

    createDefaultParameters(): FoliageParameters {
        return {
            shape: SHAPE.default,
            size: SIZE.default,
            roughness: ROUGHNESS.default,
        }
    },

    validate(parameters: unknown): ValidationResult<FoliageParameters> {
        return validateParameters(foliageSchema, parameters, this.createDefaultParameters())
    },

    generate(parameters, context) {
        const detail = context.style.foliageDetail === 'layered' ? 1 : 0
        const geometry = new THREE.IcosahedronGeometry(1, detail)

        const [sx, sy, sz] = SHAPE_SCALES[parameters.shape]
        const position = geometry.getAttribute('position')

        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i) * sx
            const y = position.getY(i) * sy
            const z = position.getZ(i) * sz

            const length = Math.sqrt(x * x + y * y + z * z) || 1
            const unit = {x: x / length, y: y / length, z: z / length}

            // Every clump gets a little wobble so it never reads as a ball.
            const base = valueNoise3(unit.x * 2.4, unit.y * 2.4, unit.z * 2.4, context.seed)
            let scale = 1 + base * parameters.roughness * 0.35

            if (parameters.shape === 'irregular') {
                const lumpy = valueNoise3(unit.x * 4.1, unit.y * 4.1, unit.z * 4.1, 991)
                scale += lumpy * parameters.roughness * 0.45
            }

            if (parameters.shape === 'layered') {
                const band = Math.sin(unit.y * Math.PI * 3)
                scale += band * parameters.roughness * 0.22
            }

            position.setXYZ(i, unit.x * length * scale, unit.y * length * scale, unit.z * length * scale)
        }

        position.needsUpdate = true
        geometry.scale(parameters.size, parameters.size, parameters.size)
        geometry.computeVertexNormals()

        if (context.style.flatShading) {
            geometry.deleteAttribute('normal')
            geometry.computeVertexNormals()
        }

        const material = hashSeed(context.seed, 7) % 3 === 0 ? 'leaves-dark' : 'leaves'

        return {geometry, material}
    },
}
