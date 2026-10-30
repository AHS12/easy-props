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
    type Limb,
    type PaintedTreeParameters,
} from './painted'

function typeOf(limb: Limb): GeneratedComponent['type'] {
    if (limb.level === 0) {
        return 'trunk'
    }

    return limb.key.startsWith('r') ? 'root' : 'branch'
}

export const paintedTreeGenerator: TreeGenerator<PaintedTreeParameters> = {
    id: 'painted-tree',
    version: 2,
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
            generatorVersion: 2,
            parentId: null,
            transform: IDENTITY_TRANSFORM,
            parameters: {tree: parameters, seed},
            seed,
            slot: 'bark',
        }

        const clumps = plan.clumps.map(
            (clump): GeneratedComponent => ({
                id: `cmp-clump-${clump.key}`,
                type: 'foliage-cluster',
                generatorId: 'painted-clump',
                generatorVersion: 2,
                parentId: bark.id,
                transform: {...IDENTITY_TRANSFORM, position: clump.centre},
                parameters: {
                    tree: parameters,
                    seed,
                    key: clump.key,
                    base: clump.base,
                    sizeScale: clump.edit.sizeScale ?? 1,
                    flattenScale: clump.edit.flattenScale ?? 1,
                    fullnessScale: clump.edit.fullnessScale ?? 1,
                    leafSizeScale: clump.edit.leafSizeScale ?? 1,
                    lumpinessScale: clump.edit.lumpinessScale ?? 1,
                    colour: clump.edit.colour ?? null,
                },
                seed: clump.seed,
                slot: `clump-${clump.key}`,
            }),
        )

        // Twigs are too fine to aim at, and too many to be worth a part each.
        const limbs = plan.limbs
            .filter((limb) => limb.level < 3)
            .map(
                (limb): GeneratedComponent => ({
                    id: `cmp-limb-${limb.key}`,
                    type: typeOf(limb),
                    generatorId: 'painted-limb',
                    generatorVersion: 1,
                    parentId: bark.id,
                    transform: IDENTITY_TRANSFORM,
                    parameters: {
                        tree: parameters,
                        seed,
                        key: limb.key,
                        base: limb.controlBase,
                        // World positions, which the 'world' spine layout reads
                        // directly: this limb's handles.
                        spine: limb.controls.map((point, index) => ({
                            t: limb.controlTs[index],
                            x: point[0],
                            y: point[1],
                            z: point[2],
                        })),
                        worldSpine: true,
                        lengthScale: limb.lengthScale,
                        thicknessScale: limb.thicknessScale,
                    },
                    seed,
                    slot: `limb-${limb.key}`,
                }),
            )

        return [bark, ...clumps, ...limbs]
    },
}
