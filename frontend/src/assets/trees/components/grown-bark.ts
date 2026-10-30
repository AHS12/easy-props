/**
 * The bark of a grown tree.
 *
 * The whole tree is one surface: every limb is swept over the same skeleton
 * and a child shares its parent's joint ring, so there is nothing to come
 * apart. That is the difference from the assembled trees, where each limb is
 * a separate capped tube placed by a second, analytic curve.
 *
 * The parameters hold the growth settings and the seed rather than the
 * skeleton itself: the skeleton is a pure function of those two, so the saved
 * document stays small and the tree stays editable.
 */

import type {PartGenerator} from '../../shared/generator-types'
import type {ParameterSpec, ValidationResult} from '../../shared/parameters'
import {
    growSkeleton,
    skeletonToBark,
    validateGrowthParameters,
    type GrowthParameters,
} from '../growth'

export type GrownBarkParameters = {
    readonly growth: GrowthParameters
    readonly seed: number
}

export const grownBarkGenerator: PartGenerator<GrownBarkParameters> = {
    id: 'grown-bark',
    version: 1,
    type: 'bark',
    label: 'Bark',
    // The tree's own controls live on the asset, not on this part: the whole
    // tree is one part.
    parameters: [] as readonly ParameterSpec[],

    createDefaultParameters(): GrownBarkParameters {
        return {growth: validateGrowthParameters(undefined).parameters, seed: 0}
    },

    validate(parameters: unknown): ValidationResult<GrownBarkParameters> {
        const raw = (parameters ?? {}) as {growth?: unknown; seed?: unknown}
        const growth = validateGrowthParameters(raw.growth)
        const seed =
            typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? Math.trunc(raw.seed) : 0

        return {...growth, parameters: {growth: growth.parameters, seed}}
    },

    generate(parameters, context) {
        const skeleton = growSkeleton(parameters.growth, parameters.seed)
        const geometry = skeletonToBark(skeleton, {
            radialSegments: context.style.radialSegments,
        })

        if (context.style.flatShading) {
            geometry.deleteAttribute('normal')
            geometry.computeVertexNormals()
        }

        return {geometry, material: 'bark'}
    },
}
