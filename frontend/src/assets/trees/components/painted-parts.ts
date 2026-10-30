/**
 * The parts of a painted tree: one surface of bark, and its clumps of leaves.
 *
 * A part stores the tree's settings and the seed, not its shape. The shape is
 * a pure function of those, so a saved tree stays small and stays editable.
 * Clumps are parts of their own, so one can be selected, moved or removed.
 */

import type {PartGenerator} from '../../shared/generator-types'
import type {ParameterSpec, ValidationResult} from '../../shared/parameters'
import type {StyleProfile} from '../../style/style-profiles'
import {
    buildBark,
    buildClump,
    getDabTexture,
    PALETTES,
    planPaintedTree,
    validatePaintedTreeParameters,
    type PaintedTreeParameters,
} from '../painted'

export type PaintedBarkParameters = {
    readonly tree: PaintedTreeParameters
    readonly seed: number
}

export type PaintedClumpParameters = PaintedBarkParameters & {
    readonly index: number
}

/** How much geometry a style asks for. Detailed is the full tree. */
const detailOf = (style: StyleProfile) => (style.id === 'detailed' ? 1 : 0.68)

function validateBase(parameters: unknown): ValidationResult<PaintedBarkParameters> {
    const raw = (parameters ?? {}) as {tree?: unknown; seed?: unknown}
    const tree = validatePaintedTreeParameters(raw.tree)
    const seed = typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? Math.trunc(raw.seed) : 0

    return {...tree, parameters: {tree: tree.parameters, seed}}
}

export const paintedBarkGenerator: PartGenerator<PaintedBarkParameters> = {
    id: 'painted-bark',
    version: 1,
    type: 'bark',
    label: 'Bark',
    // The tree's controls live on the tree: one rebuild, one undo step.
    parameters: [] as readonly ParameterSpec[],

    createDefaultParameters() {
        return validateBase(undefined).parameters
    },

    validate: validateBase,

    generate({tree, seed}, context) {
        return {
            geometry: buildBark(
                planPaintedTree(tree, seed),
                PALETTES[tree.palette],
                tree.gnarl,
                tree.trunkRadius,
                detailOf(context.style),
            ),
            material: 'painted',
            surface: {vertexColors: true},
        }
    },
}

export const paintedClumpGenerator: PartGenerator<PaintedClumpParameters> = {
    id: 'painted-clump',
    version: 1,
    type: 'foliage-cluster',
    label: 'Leaf clump',
    parameters: [] as readonly ParameterSpec[],

    createDefaultParameters() {
        return {...validateBase(undefined).parameters, index: 0}
    },

    validate(parameters) {
        const base = validateBase(parameters)
        const raw = (parameters ?? {}) as {index?: unknown}
        const index = typeof raw.index === 'number' && Number.isInteger(raw.index) ? raw.index : 0

        return {...base, parameters: {...base.parameters, index}}
    },

    generate({tree, seed, index}, context) {
        const plan = planPaintedTree(tree, seed)

        return {
            geometry: buildClump(
                plan,
                Math.min(Math.max(index, 0), Math.max(plan.clumps.length - 1, 0)),
                PALETTES[tree.palette],
                tree.fullness,
                detailOf(context.style),
            ),
            material: 'painted',
            surface: {vertexColors: true, map: getDabTexture(), alphaTest: 0.5, receiveShadow: false},
        }
    },
}
