/**
 * A stylized tree, painted rather than assembled.
 *
 * A heavy blended trunk, a few limbs that end in thin dark whips, and big soft
 * masses of leaves with a brush-stroke edge. Colour is stored per vertex and
 * the shading normals are part of the mesh, so the look travels with the
 * exported file instead of depending on a shader.
 */

import {IDENTITY_TRANSFORM} from '../shared/component-types'
import type {GeneratedComponent, TreeGenerator} from '../shared/generator-types'
import {
    paintedTreeDefaults,
    paintedTreeParameterSpecs,
    planPaintedTree,
    validatePaintedTreeParameters,
    type PaintedTreeParameters,
} from './painted'

export const paintedTreeGenerator: TreeGenerator<PaintedTreeParameters> = {
    id: 'painted-tree',
    version: 1,
    label: 'Painted tree',
    parameters: paintedTreeParameterSpecs,
    paintsOwnColours: true,

    createDefaultParameters() {
        return paintedTreeDefaults
    },

    validate(parameters) {
        return validatePaintedTreeParameters(parameters)
    },

    generate(parameters, context) {
        const {seed} = context
        const plan = planPaintedTree(parameters, seed)

        const bark: GeneratedComponent = {
            id: 'cmp-bark-0',
            type: 'bark',
            generatorId: 'painted-bark',
            generatorVersion: 1,
            parentId: null,
            transform: IDENTITY_TRANSFORM,
            parameters: {tree: parameters, seed},
            seed,
            slot: 'bark',
        }

        const clumps = plan.clumps.map(
            (clump, index): GeneratedComponent => ({
                id: `cmp-clump-${index}`,
                type: 'foliage-cluster',
                generatorId: 'painted-clump',
                generatorVersion: 1,
                parentId: bark.id,
                transform: {...IDENTITY_TRANSFORM, position: clump.centre},
                parameters: {tree: parameters, seed, index},
                seed: clump.seed,
                slot: `clump-${index}`,
            }),
        )

        return [bark, ...clumps]
    },
}
