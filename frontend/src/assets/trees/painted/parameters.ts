/**
 * The controls of a painted tree.
 *
 * Grouped by what they change, and named for what the tree looks like. A new
 * kind of tree is a new set of these values, not a new generator.
 */

import {z} from 'zod'
import {
    choiceSchema,
    numberSchema,
    validateParameters,
    type NumberParameter,
    type ParameterSpec,
    type ValidationResult,
} from '../../shared/parameters'

export type PaletteId = 'blossom' | 'pale-blossom' | 'spring' | 'autumn' | 'custom'

const number = (
    group: string,
    key: string,
    label: string,
    help: string,
    min: number,
    max: number,
    step: number,
    fallback: number,
    unit?: string,
): NumberParameter => ({kind: 'number', group, key, label, help, min, max, step, default: fallback, unit})

const TRUNK = 'Trunk'
const BRANCHES = 'Branches'
const LEAVES = 'Leaves'
const BARK = 'Bark detail'

const NUMBERS = {
    height: number(TRUNK, 'height', 'Height', 'How tall the whole tree is, up to the top of the leaves.', 3, 16, 0.1, 8, 'm'),
    trunkRadius: number(TRUNK, 'trunkRadius', 'Thickness', 'How heavy the trunk is. A thick trunk makes a tree look old.', 0.15, 1.2, 0.01, 0.72, 'm'),
    lean: number(TRUNK, 'lean', 'Lean', 'How far the trunk tips over.', 0, 0.6, 0.01, 0.12),
    trunkBend: number(TRUNK, 'trunkBend', 'Bend', 'How much the trunk curves as it rises.', 0, 0.4, 0.01, 0.11),
    corkscrew: number(TRUNK, 'corkscrew', 'Corkscrew', 'Winds the whole trunk around itself.', 0, 1, 0.05, 0),
    ridgeTwist: number(TRUNK, 'ridgeTwist', 'Twist', 'How tightly the ridges spiral up the trunk.', -3, 3, 0.05, 0.75),
    ridgeDepth: number(TRUNK, 'ridgeDepth', 'Ridge depth', 'How deep the ridges in the trunk are.', 0, 0.4, 0.01, 0.15),
    ridgeCount: number(TRUNK, 'ridgeCount', 'Ridges', 'How many ridges run up the trunk.', 2, 9, 1, 5, 'count'),
    flare: number(TRUNK, 'flare', 'Base flare', 'How much the trunk spreads where it meets the ground.', 0, 1, 0.02, 0.34),
    rootCount: number(TRUNK, 'rootCount', 'Roots', 'How many roots run out from the base.', 0, 12, 1, 6, 'count'),
    rootLength: number(TRUNK, 'rootLength', 'Root length', 'How far the roots reach.', 0.4, 2.5, 0.05, 1),

    limbCount: number(BRANCHES, 'limbCount', 'Big branches', 'How many heavy branches leave the trunk.', 2, 8, 1, 5, 'count'),
    forkHeight: number(BRANCHES, 'forkHeight', 'Fork height', 'How far up the tree the big branches begin.', 0.2, 0.7, 0.01, 0.4),
    spread: number(BRANCHES, 'spread', 'Spread', 'How wide the branches reach.', 2, 16, 0.1, 9, 'm'),
    limbAngle: number(BRANCHES, 'limbAngle', 'Angle', 'How steeply the big branches climb, in degrees.', 5, 70, 1, 36),
    droop: number(BRANCHES, 'droop', 'Droop', 'How much the branches sag under their weight.', 0, 1, 0.05, 0),
    gnarl: number(BRANCHES, 'gnarl', 'Gnarl', 'How much the branches wander.', 0, 1, 0.05, 0.55),
    branchCount: number(BRANCHES, 'branchCount', 'Side branches', 'How many smaller branches each big one carries.', 1, 6, 1, 4, 'count'),
    twigCount: number(BRANCHES, 'twigCount', 'Twigs', 'How many thin twigs each side branch carries.', 0, 4, 1, 2, 'count'),

    clumpCount: number(LEAVES, 'clumpCount', 'Clumps', 'How many big masses of leaves make up the crown.', 3, 18, 1, 11, 'count'),
    clumpSize: number(LEAVES, 'clumpSize', 'Clump size', 'How big each mass of leaves is.', 0.5, 1.6, 0.05, 1),
    clumpMerge: number(LEAVES, 'clumpMerge', 'Merge', 'Pulls the clumps together into one big crown.', 0, 1, 0.05, 0.25),
    clumpFlatten: number(LEAVES, 'clumpFlatten', 'Flatness', 'How squashed the clumps are.', 0, 1, 0.05, 0.4),
    lumpiness: number(LEAVES, 'lumpiness', 'Lumpiness', 'How broken up each clump is, from one round shape to several.', 0, 1, 0.05, 0.6),
    fullness: number(LEAVES, 'fullness', 'Leaf density', 'How many leaves cover each clump. Higher hides the inside and costs more to draw.', 0.2, 1.5, 0.05, 0.75),
    leafSize: number(LEAVES, 'leafSize', 'Leaf size', 'How big each patch of leaves is.', 0.5, 1.6, 0.05, 1),

    colourVariation: number('Colours', 'colourVariation', 'Variation', 'How much the colour changes from clump to clump.', 0, 1, 0.05, 0.35),

    barkDetail: number(BARK, 'barkDetail', 'Mesh detail', 'How fine the trunk and big branches are. Higher costs more to draw.', 0.5, 2, 0.05, 1),
    roughness: number(BARK, 'roughness', 'Roughness', 'Uneven bumps across the wood.', 0, 1, 0.05, 0.2),
    burls: number(BARK, 'burls', 'Burls', 'Round knots growing out of the trunk.', 0, 8, 1, 0, 'count'),
    hollow: number(BARK, 'hollow', 'Hollow', 'Carves an opening into the trunk.', 0, 1, 0.05, 0),
    moss: number(BARK, 'moss', 'Moss', 'Green growth on the upper sides of the wood.', 0, 1, 0.05, 0),
} as const

const PALETTE = {
    kind: 'choice',
    group: 'Colours',
    key: 'palette',
    label: 'Palette',
    help: 'The colours the whole tree is painted in.',
    options: [
        {value: 'blossom', label: 'Blossom'},
        {value: 'pale-blossom', label: 'Pale blossom'},
        {value: 'spring', label: 'Spring green'},
        {value: 'autumn', label: 'Autumn'},
        {value: 'custom', label: 'My own colours'},
    ],
    default: 'blossom',
} as const satisfies ParameterSpec

export const paintedTreeParameterSpecs: readonly ParameterSpec[] = [
    NUMBERS.height,
    NUMBERS.trunkRadius,
    NUMBERS.lean,
    NUMBERS.trunkBend,
    NUMBERS.corkscrew,
    NUMBERS.ridgeTwist,
    NUMBERS.ridgeDepth,
    NUMBERS.ridgeCount,
    NUMBERS.flare,
    NUMBERS.rootCount,
    NUMBERS.rootLength,
    NUMBERS.limbCount,
    NUMBERS.forkHeight,
    NUMBERS.spread,
    NUMBERS.limbAngle,
    NUMBERS.droop,
    NUMBERS.gnarl,
    NUMBERS.branchCount,
    NUMBERS.twigCount,
    NUMBERS.clumpCount,
    NUMBERS.clumpSize,
    NUMBERS.clumpMerge,
    NUMBERS.clumpFlatten,
    NUMBERS.lumpiness,
    NUMBERS.fullness,
    NUMBERS.leafSize,
    PALETTE,
    NUMBERS.colourVariation,
    NUMBERS.barkDetail,
    NUMBERS.roughness,
    NUMBERS.burls,
    NUMBERS.hollow,
    NUMBERS.moss,
]

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

export const PALETTES: Readonly<Record<Exclude<PaletteId, 'custom'>, Palette>> = {
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

/** The keys that hold the user's own colours, in the palette's order. */
export const COLOUR_KEYS = ['barkDeep', 'barkLight', 'leafDeep', 'leafMid', 'leafLight'] as const

export const COLOUR_LABELS: Readonly<Record<keyof Palette, string>> = {
    barkDeep: 'Bark shadow',
    barkLight: 'Bark light',
    leafDeep: 'Leaf shadow',
    leafMid: 'Leaf middle',
    leafLight: 'Leaf highlight',
}

export type PaintedTreeParameters = {
    readonly [K in keyof typeof NUMBERS]: number
} & Palette & {
        readonly palette: PaletteId
        /**
         * Hand edits to single parts, as JSON.
         *
         * Held here so every edit is a tree parameter: undo, save and rebuild
         * all treat it like a slider, and a rebuild can never lose one.
         */
        readonly edits: string
    }

const colour = (fallback: string) =>
    z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .catch(fallback)

const WHOLE_NUMBERS: ReadonlySet<string> = new Set(
    Object.values(NUMBERS)
        .filter((spec) => spec.unit === 'count')
        .map((spec) => spec.key),
)

const paintedTreeSchema = z.object({
    ...Object.fromEntries(
        Object.values(NUMBERS).map((spec) => [
            spec.key,
            WHOLE_NUMBERS.has(spec.key)
                ? numberSchema(spec).transform((value) => Math.round(value))
                : numberSchema(spec),
        ]),
    ),
    palette: choiceSchema(PALETTE),
    barkDeep: colour(PALETTES.blossom.barkDeep),
    barkLight: colour(PALETTES.blossom.barkLight),
    leafDeep: colour(PALETTES.blossom.leafDeep),
    leafMid: colour(PALETTES.blossom.leafMid),
    leafLight: colour(PALETTES.blossom.leafLight),
    edits: z.string().catch(''),
}) as unknown as z.ZodType<PaintedTreeParameters>

export const paintedTreeDefaults: PaintedTreeParameters = {
    ...(Object.fromEntries(Object.values(NUMBERS).map((spec) => [spec.key, spec.default])) as {
        readonly [K in keyof typeof NUMBERS]: number
    }),
    palette: PALETTE.default,
    ...PALETTES.blossom,
    edits: '',
}

export function validatePaintedTreeParameters(
    parameters: unknown,
): ValidationResult<PaintedTreeParameters> {
    return validateParameters(paintedTreeSchema, parameters, paintedTreeDefaults)
}

/** The colours a tree is painted in right now. */
export function resolvePalette(tree: PaintedTreeParameters): Palette {
    return tree.palette === 'custom' ? tree : PALETTES[tree.palette]
}
