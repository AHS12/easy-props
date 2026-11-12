/**
 * The colours props are painted in.
 *
 * Shared, so a rock and an oak on the same palette belong to the same game.
 */

export type PaletteId =
    | 'blossom'
    | 'pale-blossom'
    | 'spring'
    | 'autumn'
    | 'forest'
    | 'tropical'
    | 'pine'
    | 'olive'
    | 'maple'
    | 'golden'
    | 'frost'
    | 'teal'
    | 'violet'
    | 'ember'
    | 'custom'

export type BarkToneId =
    | 'palette'
    | 'oak'
    | 'birch'
    | 'pine'
    | 'palm'
    | 'redwood'
    | 'ash'
    | 'charcoal'
    | 'bone'

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
    forest: {
        barkDeep: '#2d2523',
        barkLight: '#7d6a58',
        leafDeep: '#173f35',
        leafMid: '#3c7f3d',
        leafLight: '#a5c95a',
    },
    tropical: {
        barkDeep: '#3a2f25',
        barkLight: '#a58f6c',
        leafDeep: '#0f5f4a',
        leafMid: '#2fa34a',
        leafLight: '#c7e85c',
    },
    pine: {
        barkDeep: '#2d2220',
        barkLight: '#86604a',
        leafDeep: '#10403f',
        leafMid: '#26705a',
        leafLight: '#86b97a',
    },
    olive: {
        barkDeep: '#332c26',
        barkLight: '#8f8370',
        leafDeep: '#3f5a45',
        leafMid: '#7f9a62',
        leafLight: '#d3d59a',
    },
    maple: {
        barkDeep: '#2e2426',
        barkLight: '#7f6a64',
        leafDeep: '#7a1730',
        leafMid: '#cc2f33',
        leafLight: '#f98a4d',
    },
    golden: {
        barkDeep: '#352a24',
        barkLight: '#938069',
        leafDeep: '#a8701b',
        leafMid: '#e9b42f',
        leafLight: '#fff0a0',
    },
    frost: {
        barkDeep: '#2c2a30',
        barkLight: '#807a7e',
        leafDeep: '#1c4a55',
        leafMid: '#8fb8bf',
        leafLight: '#ffffff',
    },
    teal: {
        barkDeep: '#1f2a3d',
        barkLight: '#6b7fa0',
        leafDeep: '#0f5c78',
        leafMid: '#25b6b0',
        leafLight: '#c5fbdc',
    },
    violet: {
        barkDeep: '#241d38',
        barkLight: '#6d5f94',
        leafDeep: '#3d2a96',
        leafMid: '#7f58e0',
        leafLight: '#e2c8ff',
    },
    ember: {
        barkDeep: '#19151a',
        barkLight: '#56474a',
        leafDeep: '#8a1b1b',
        leafMid: '#f0581f',
        leafLight: '#ffd35c',
    },
}

/** Wood colours, for a tree whose bark should not follow its palette. */
export const BARK_TONES: Readonly<
    Record<Exclude<BarkToneId, 'palette'>, Pick<Palette, 'barkDeep' | 'barkLight'>>
> = {
    oak: {barkDeep: '#2f2420', barkLight: '#8f7257'},
    birch: {barkDeep: '#2a2726', barkLight: '#f1ece0'},
    pine: {barkDeep: '#3a1f18', barkLight: '#b0694a'},
    palm: {barkDeep: '#4a3a2b', barkLight: '#c2a77f'},
    redwood: {barkDeep: '#3b1711', barkLight: '#b2502f'},
    ash: {barkDeep: '#34343a', barkLight: '#a7a6a4'},
    charcoal: {barkDeep: '#141216', barkLight: '#4c474c'},
    bone: {barkDeep: '#6b6358', barkLight: '#e8e0cf'},
}

export type RockPaletteId = 'greystone' | 'lavender' | 'slate' | 'granite' | 'sandstone' | 'redrock' | 'basalt' | 'frost'

/** Stone for cut rocks, shadow to highlight. The shadow shifts hue, as a palette's does. */
export const ROCK_RAMPS: Readonly<Record<RockPaletteId, readonly string[]>> = {
    lavender: ['#3f4180', '#6467a8', '#9598d4', '#d9daf6'],
    slate: ['#27354f', '#4f6585', '#83a0bd', '#cfe0ee'],
    granite: ['#35364a', '#676a7c', '#9fa2ad', '#dfdfe2'],
    sandstone: ['#5a3f4a', '#a0785f', '#d2ad80', '#f6e3bd'],
    redrock: ['#4a2438', '#94483f', '#cb7c58', '#f2c49a'],
    basalt: ['#14162a', '#30334e', '#565a78', '#9599b4'],
    frost: ['#3c5583', '#7c9fc9', '#bcd6ec', '#f4fbff'],
    // A warm grey, the commonest stone in a stylised forest, and the one new rocks start with.
    // Last, so own colours saved with a row missing still fill it from Lavender.
    greystone: ['#363738', '#5f6162', '#8a8c8c', '#b9baba'],
}

/** Moss on any stone, shadow to highlight. */
export const MOSS_RAMP: readonly string[] = ['#3a7a12', '#68a820', '#a2d63e']

/** Moss on a carved rock: calmer greens, with the bright lime kept for its lightest touches. */
export const CALM_MOSS_RAMP: readonly string[] = ['#284618', '#3f6624', '#5d8a30', '#a2d63e']

export type PetalPaletteId = 'white' | 'pink' | 'flame' | 'gold' | 'violet' | 'cream' | 'red' | 'blue'

/** Petals, deep to light. */
export const PETAL_RAMPS: Readonly<Record<PetalPaletteId, readonly string[]>> = {
    white: ['#cfd4c8', '#f0f0ea', '#ffffff'],
    pink: ['#c8407c', '#ec7cb0', '#ffd6ea'],
    flame: ['#b82a10', '#ec5c18', '#ffae3c'],
    gold: ['#c47c10', '#eeb420', '#ffe670'],
    violet: ['#5c2ca0', '#9460d8', '#d8bcf8'],
    cream: ['#a8945c', '#dccb92', '#fbf3d0'],
    red: ['#6a0610', '#c41424', '#ff6a5a'],
    blue: ['#2c4a9c', '#5c86d8', '#bcd2f8'],
}

/** Stems and the leaves at their foot, root to tip. */
export const STEM_RAMP: readonly string[] = ['#2f6410', '#5c9a18', '#a4d030']

/** The twigs inside an open bush, base to tip. */
export const TWIG_RAMP: readonly string[] = ['#33261e', '#5a4632', '#7c6848']

/** The middle of a daisy. */
export const FLOWER_CENTRE = '#f4c430'

export type BushPaletteId = 'summer' | 'lush' | 'spring' | 'olive' | 'pine' | 'autumn' | 'maple'

/** A bush, shadow to highlight: near black under it, yellow where the sun lands. */
export const BUSH_RAMPS: Readonly<Record<BushPaletteId, readonly string[]>> = {
    summer: ['#1c3f08', '#3d7410', '#7fb31a', '#d3e85c'],
    lush: ['#123a14', '#27681c', '#57a02a', '#a8d85a'],
    spring: ['#2c5a0e', '#5c9a14', '#a0d024', '#e8f47c'],
    olive: ['#2c3a14', '#556a22', '#8a9a3c', '#c8cf7c'],
    pine: ['#0f2c20', '#1f5236', '#3f8450', '#8cc084'],
    autumn: ['#5a2c0c', '#a0601a', '#d89c24', '#f6dc6c'],
    maple: ['#4a1414', '#982a1a', '#d85a24', '#f6a84c'],
}

export type GrassPaletteId = 'meadow' | 'lush' | 'spring' | 'reed' | 'autumn' | 'frost'

/** Grass, root to tip. A root near the colour of the ground makes a blade grow out of it. */
export const GRASS_RAMPS: Readonly<Record<GrassPaletteId, readonly string[]>> = {
    meadow: ['#3f6e06', '#6da208', '#9ccb1c', '#d6e85e'],
    lush: ['#1f5a18', '#3f8c1c', '#74b82a', '#b4dc58'],
    spring: ['#4d8a12', '#88c220', '#bfe040', '#ecf48a'],
    reed: ['#4c5e1c', '#7f8c2c', '#afb04a', '#dfd688'],
    autumn: ['#6a5212', '#a58a1e', '#d6b23a', '#f2dc84'],
    frost: ['#4e7a78', '#84ae9e', '#b8d2bc', '#ecf4e4'],
}

export type CactusPaletteId = 'desert' | 'sage' | 'olive' | 'golden' | 'blue' | 'purple'

/** A cactus, shadow to highlight, and the colour of its spines. */
export const CACTUS_COLOURS: Readonly<Record<CactusPaletteId, {readonly ramp: readonly string[]; readonly spines: string}>> = {
    desert: {ramp: ['#173a24', '#2f6a3a', '#5e9a4c', '#a8cf78'], spines: '#f2ead0'},
    sage: {ramp: ['#24403a', '#4a7562', '#80a888', '#c4dcb4'], spines: '#f6f0dc'},
    olive: {ramp: ['#2c3414', '#56662a', '#8c9a44', '#cdd28a'], spines: '#efe0b4'},
    golden: {ramp: ['#24401a', '#4c7a2a', '#86ac3c', '#c8dc74'], spines: '#f6c84a'},
    blue: {ramp: ['#1c3644', '#3f6a78', '#76a2a8', '#bcd8d2'], spines: '#f4eedc'},
    purple: {ramp: ['#2e2440', '#58466e', '#8c74a0', '#c8b4d4'], spines: '#f2e4d0'},
}

/** A cactus's colours in one list, shadow to highlight and then its spines. */
export const CACTUS_RAMPS = Object.fromEntries(
    Object.entries(CACTUS_COLOURS).map(([id, {ramp, spines}]) => [id, [...ramp, spines]]),
) as unknown as Readonly<Record<CactusPaletteId, readonly string[]>>

/** A clump gone pale, root to tip. */
export const DRY_RAMP: readonly string[] = ['#7c8a2a', '#b2b048', '#d8cf78', '#f0e8ac']

/** The colours of stone, shadow to highlight. */
export interface StoneColours {
    readonly stoneDeep: string
    readonly stoneLight: string
}

/** The stone that goes with each palette. */
export const STONE_COLOURS: Readonly<Record<Exclude<PaletteId, 'custom'>, StoneColours>> = {
    blossom: {stoneDeep: '#37324a', stoneLight: '#a79fb8'},
    'pale-blossom': {stoneDeep: '#4b4654', stoneLight: '#c9c3cc'},
    spring: {stoneDeep: '#3d4a3f', stoneLight: '#a8b09a'},
    autumn: {stoneDeep: '#4a3a2e', stoneLight: '#b5a18a'},
    forest: {stoneDeep: '#2f3a35', stoneLight: '#8e9a8c'},
    tropical: {stoneDeep: '#3c3a33', stoneLight: '#b5ad92'},
    pine: {stoneDeep: '#2c3438', stoneLight: '#8a959a'},
    olive: {stoneDeep: '#45402f', stoneLight: '#b3a98a'},
    maple: {stoneDeep: '#46302c', stoneLight: '#ab8f84'},
    golden: {stoneDeep: '#4a3f2a', stoneLight: '#bcaa82'},
    frost: {stoneDeep: '#4a5668', stoneLight: '#d5deea'},
    teal: {stoneDeep: '#23403f', stoneLight: '#7fa8a2'},
    violet: {stoneDeep: '#2f2845', stoneLight: '#8f85ad'},
    ember: {stoneDeep: '#231c1c', stoneLight: '#6f5c56'},
}
