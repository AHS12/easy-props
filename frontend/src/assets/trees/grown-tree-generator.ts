/**
 * A tree grown branch by branch.
 *
 * Unlike the assembled trees, this one has a skeleton: the branching is grown
 * by space colonization, the radii come from the pipe model, and the bark is
 * one welded surface. Leaves attach to its nodes, which is why it is grown as
 * data first and drawn second.
 */

import {IDENTITY_TRANSFORM} from '../shared/component-types'
import type {TreeGenerator} from '../shared/generator-types'
import {
    growthDefaults,
    growthParameterSpecs,
    validateGrowthParameters,
    type GrowthParameters,
} from './growth'

export const grownTreeGenerator: TreeGenerator<GrowthParameters> = {
    id: 'grown-tree',
    version: 1,
    label: 'Grown tree',
    parameters: growthParameterSpecs,

    createDefaultParameters(): GrowthParameters {
        return growthDefaults
    },

    validate(parameters: unknown) {
        return validateGrowthParameters(parameters)
    },

    generate(parameters, context) {
        return [
            {
                id: 'cmp-bark-0',
                type: 'bark',
                generatorId: 'grown-bark',
                generatorVersion: 1,
                parentId: null,
                transform: IDENTITY_TRANSFORM,
                parameters: {growth: parameters, seed: context.seed},
                seed: context.seed,
                slot: 'bark',
            },
        ]
    },
}
