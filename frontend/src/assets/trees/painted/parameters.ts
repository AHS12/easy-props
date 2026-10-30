/**
 * The controls of a painted tree.
 *
 * Deliberately few, and named for what the tree looks like. A new kind of
 * tree is a new set of these values, not a new generator.
 */

import {z} from 'zod'
import {
    choiceSchema,
    numberSchema,
    validateParameters,
    type ParameterSpec,
    type ValidationResult,
} from '../../shared/parameters'

export type PaletteId = 'blossom' | 'pale-blossom' | 'spring' | 'autumn'

export type PaintedTreeParameters = {
    /** Ground to the top of the crown, in metres. */
    readonly height: number
    /** The radius of the trunk above its flare, in metres. */
    readonly trunkRadius: number
    /** How wide the limbs reach, in metres. */
    readonly spread: number
    /** How far up the tree the limbs begin, as a share of its height. */
    readonly forkHeight: number
    /** How many heavy limbs leave the trunk. */
    readonly limbCount: number
    /** How much trunk and limbs twist and wander, 0 to 1. */
    readonly gnarl: number
    /** How many masses of leaves the crown is made of. */
    readonly clumpCount: number
    /** How big those masses are. */
    readonly clumpSize: number
    /** How densely each mass is covered, 0 to 1. */
    readonly fullness: number
    readonly palette: PaletteId
}

const HEIGHT = {
    kind: 'number',
    key: 'height',
    label: 'Height',
    help: 'How tall the trunk and branches reach.',
    min: 3,
    max: 16,
    step: 0.1,
    unit: 'm',
    default: 8,
} as const satisfies ParameterSpec

const TRUNK_RADIUS = {
    kind: 'number',
    key: 'trunkRadius',
    label: 'Trunk thickness',
    help: 'How heavy the trunk is. A thick trunk makes a tree look old.',
    min: 0.15,
    max: 1.2,
    step: 0.01,
    unit: 'm',
    default: 0.72,
} as const satisfies ParameterSpec

const SPREAD = {
    kind: 'number',
    key: 'spread',
    label: 'Spread',
    help: 'How wide the branches reach.',
    min: 2,
    max: 16,
    step: 0.1,
    unit: 'm',
    default: 9,
} as const satisfies ParameterSpec

const FORK_HEIGHT = {
    kind: 'number',
    key: 'forkHeight',
    label: 'Fork height',
    help: 'How far up the tree the big branches begin.',
    min: 0.2,
    max: 0.7,
    step: 0.01,
    default: 0.4,
} as const satisfies ParameterSpec

const LIMB_COUNT = {
    kind: 'number',
    key: 'limbCount',
    label: 'Big branches',
    help: 'How many heavy branches leave the trunk.',
    min: 2,
    max: 8,
    step: 1,
    unit: 'count',
    default: 5,
} as const satisfies ParameterSpec

const GNARL = {
    kind: 'number',
    key: 'gnarl',
    label: 'Gnarl',
    help: 'How much the trunk twists and the branches wander.',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.55,
} as const satisfies ParameterSpec

const CLUMP_COUNT = {
    kind: 'number',
    key: 'clumpCount',
    label: 'Leaf clumps',
    help: 'How many big masses of leaves make up the crown.',
    min: 3,
    max: 18,
    step: 1,
    unit: 'count',
    default: 11,
} as const satisfies ParameterSpec

const CLUMP_SIZE = {
    kind: 'number',
    key: 'clumpSize',
    label: 'Clump size',
    help: 'How big each mass of leaves is.',
    min: 0.5,
    max: 1.6,
    step: 0.05,
    default: 1,
} as const satisfies ParameterSpec

const FULLNESS = {
    kind: 'number',
    key: 'fullness',
    label: 'Fullness',
    help: 'How thickly each clump is covered. Lower is lighter to draw.',
    min: 0.2,
    max: 1,
    step: 0.05,
    default: 0.6,
} as const satisfies ParameterSpec

const PALETTE = {
    kind: 'choice',
    key: 'palette',
    label: 'Colours',
    help: 'The colours the whole tree is painted in.',
    options: [
        {value: 'blossom', label: 'Blossom'},
        {value: 'pale-blossom', label: 'Pale blossom'},
        {value: 'spring', label: 'Spring green'},
        {value: 'autumn', label: 'Autumn'},
    ],
    default: 'blossom',
} as const satisfies ParameterSpec

export const paintedTreeParameterSpecs: readonly ParameterSpec[] = [
    PALETTE,
    HEIGHT,
    SPREAD,
    TRUNK_RADIUS,
    FORK_HEIGHT,
    LIMB_COUNT,
    GNARL,
    CLUMP_COUNT,
    CLUMP_SIZE,
    FULLNESS,
]

const paintedTreeSchema = z.object({
    height: numberSchema(HEIGHT),
    trunkRadius: numberSchema(TRUNK_RADIUS),
    spread: numberSchema(SPREAD),
    forkHeight: numberSchema(FORK_HEIGHT),
    limbCount: numberSchema(LIMB_COUNT).transform((value) => Math.round(value)),
    gnarl: numberSchema(GNARL),
    clumpCount: numberSchema(CLUMP_COUNT).transform((value) => Math.round(value)),
    clumpSize: numberSchema(CLUMP_SIZE),
    fullness: numberSchema(FULLNESS),
    palette: choiceSchema(PALETTE),
})

export const paintedTreeDefaults: PaintedTreeParameters = {
    height: HEIGHT.default,
    trunkRadius: TRUNK_RADIUS.default,
    spread: SPREAD.default,
    forkHeight: FORK_HEIGHT.default,
    limbCount: LIMB_COUNT.default,
    gnarl: GNARL.default,
    clumpCount: CLUMP_COUNT.default,
    clumpSize: CLUMP_SIZE.default,
    fullness: FULLNESS.default,
    palette: PALETTE.default,
}

export function validatePaintedTreeParameters(
    parameters: unknown,
): ValidationResult<PaintedTreeParameters> {
    return validateParameters(paintedTreeSchema, parameters, paintedTreeDefaults)
}

/**
 * The colours of a palette, shadow to highlight.
 *
 * The shadow is a different hue from the highlight, not a darker copy of it.
 * That shift is most of what makes colour read as painted.
 */
export interface Palette {
    readonly barkDeep: string
    readonly barkLight: string
    readonly leafDeep: string
    readonly leafMid: string
    readonly leafLight: string
}

export const PALETTES: Readonly<Record<PaletteId, Palette>> = {
    blossom: {
        barkDeep: '#2b2739',
        barkLight: '#857c9c',
        leafDeep: '#a53cc4',
        leafMid: '#ea7fdc',
        leafLight: '#ffe6f4',
    },
    'pale-blossom': {
        barkDeep: '#332f3d',
        barkLight: '#8d8798',
        leafDeep: '#b795b2',
        leafMid: '#e6c9cf',
        leafLight: '#fff5ea',
    },
    spring: {
        barkDeep: '#332a2b',
        barkLight: '#96826f',
        leafDeep: '#1f6e4c',
        leafMid: '#5bb340',
        leafLight: '#d6ee78',
    },
    autumn: {
        barkDeep: '#33272a',
        barkLight: '#8c7265',
        leafDeep: '#a33423',
        leafMid: '#dd6a27',
        leafLight: '#fbcb57',
    },
}
