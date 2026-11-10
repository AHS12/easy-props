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
    type ChoiceParameter,
    type NumberParameter,
    type ParameterSpec,
    type ValidationResult,
} from '../../shared/parameters'
import {BARK_TONES, PALETTES, type BarkToneId, type Palette, type PaletteId} from '../../style/palettes'
import {MOSS_FROM, SNOW, WEATHER, WET, type MossFrom} from '../../shared/weather'

export {BARK_TONES, PALETTES}
export type {BarkToneId, Palette, PaletteId}


/** Which rules lay the tree out: a branching crown, a palm's fronds, or a conifer's tiers. */
export type FruitKind = 'coconut' | 'apple' | 'orange' | 'lemon' | 'plum'
export type TreeForm = 'crown' | 'palm' | 'conifer'
export type FrondStyle = 'feather' | 'fan' | 'blade'
export type BarkPattern = 'none' | 'ringed' | 'plated' | 'banded' | 'peeling' | 'fibrous'
export type CrownShape = 'natural' | 'round' | 'wide' | 'umbrella' | 'column' | 'cone' | 'teardrop'
/** Painted is soft leaf cards and sculpted bark. Low-poly is the same tree in a few hard-edged blocks. */
export type TreeBuild = 'painted' | 'low-poly'
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
const FRUIT = 'Fruit'
const DAMAGE = 'Damage'

const NUMBERS = {
    height: number(TRUNK, 'height', 'Height', 'How tall the whole tree is, up to the top of the leaves.', 0.3, 20, 0.1, 8, 'm'),
    trunkRadius: number(TRUNK, 'trunkRadius', 'Thickness', 'How heavy the trunk is. A thick trunk makes a tree look old.', 0.02, 1.2, 0.01, 0.72, 'm'),
    stem: number(TRUNK, 'stem', 'Stem height', 'How much of the height is bare stem. Low, the fronds spring from near the ground, as on grass and ferns.', 0.03, 1, 0.01, 1),
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
    spread: number(BRANCHES, 'spread', 'Spread', 'How wide the branches reach.', 0.5, 16, 0.1, 9, 'm'),
    limbAngle: number(BRANCHES, 'limbAngle', 'Angle', 'How steeply the big branches climb, in degrees.', 5, 70, 1, 36),
    droop: number(BRANCHES, 'droop', 'Droop', 'How much the branches sag under their weight.', 0, 1, 0.05, 0),
    gnarl: number(BRANCHES, 'gnarl', 'Gnarl', 'How much the branches wander.', 0, 1, 0.05, 0.55),
    branchCount: number(BRANCHES, 'branchCount', 'Side branches', 'How many smaller branches each big one carries.', 1, 6, 1, 4, 'count'),
    twigCount: number(BRANCHES, 'twigCount', 'Twigs', 'How many thin twigs each side branch carries.', 0, 4, 1, 2, 'count'),

    clumpCount: number(LEAVES, 'clumpCount', 'Clumps', 'How many big masses of leaves make up the crown. None leaves a bare tree.', 0, 24, 1, 11, 'count'),
    clumpSize: number(LEAVES, 'clumpSize', 'Clump size', 'How big each mass of leaves is.', 0.5, 1.6, 0.05, 1),
    clumpMerge: number(LEAVES, 'clumpMerge', 'Merge', 'Pulls the clumps together into one big crown.', 0, 1, 0.05, 0.25),
    clumpFlatten: number(LEAVES, 'clumpFlatten', 'Flatness', 'How squashed the clumps are.', 0, 1, 0.05, 0.4),
    lumpiness: number(LEAVES, 'lumpiness', 'Lumpiness', 'How broken up each clump is, from one round shape to several.', 0, 1, 0.05, 0.6),
    fullness: number(LEAVES, 'fullness', 'Leaf density', 'How many leaves cover each clump. Higher hides the inside and costs more to draw.', 0.2, 1.5, 0.05, 0.75),
    leafSize: number(LEAVES, 'leafSize', 'Leaf size', 'How big each patch of leaves is.', 0.5, 1.6, 0.05, 1),
    strands: number(LEAVES, 'strands', 'Hanging strands', 'Curtains of leaves falling from each clump, as on a willow.', 0, 1, 0.05, 0),
    strandLength: number(LEAVES, 'strandLength', 'Strand length', 'How far the strands fall, as a share of the way to the ground.', 0.2, 1, 0.05, 0.7),

    fruitCount: number(FRUIT, 'fruitCount', 'Fruit', 'How much fruit each clump carries. On a palm, how many in the whole crown.', 0, 12, 1, 0, 'count'),
    fruitSize: number(FRUIT, 'fruitSize', 'Fruit size', 'How big each fruit is.', 0.5, 2, 0.05, 1),

    colourVariation: number('Colours', 'colourVariation', 'Variation', 'How much the colour changes from clump to clump.', 0, 1, 0.05, 0.35),

    barkDetail: number(BARK, 'barkDetail', 'Wood detail', 'How fine the trunk and big branches are. Higher costs more to draw.', 0.5, 2, 0.05, 1),
    brushStrokes: number(BARK, 'brushStrokes', 'Brush strokes', 'How strongly brush strokes show on the wood. 0 leaves it smooth.', 0, 2, 0.25, 1),
    roughness: number(BARK, 'roughness', 'Roughness', 'Uneven bumps across the wood.', 0, 1, 0.05, 0.2),
    burls: number(BARK, 'burls', 'Burls', 'Round knots growing out of the trunk.', 0, 8, 1, 0, 'count'),
    hollow: number(BARK, 'hollow', 'Hollow', 'Carves an opening into the trunk.', 0, 1, 0.05, 0),
    moss: number(WEATHER, 'moss', 'Moss', 'Green growth on the wood.', 0, 1, 0.05, 0),
    snow: SNOW,
    wet: WET,

    snapped: number(DAMAGE, 'snapped', 'Snapped top', 'Breaks the trunk off in a splintered stump, from near the top to low down. Everything above it goes.', 0, 1, 0.05, 0),
    brokenLimbs: number(DAMAGE, 'brokenLimbs', 'Broken limbs', 'How many of the big branches end in a jagged break, and lose what grew past it.', 0, 1, 0.05, 0),
    split: number(DAMAGE, 'split', 'Split trunk', 'A charred crack down one side of the trunk, as from lightning.', 0, 1, 0.05, 0),
    patternDepth: number(BARK, 'patternDepth', 'Pattern depth', 'How strongly the bark pattern shows.', 0, 1, 0.05, 0.5),
    patternScale: number(BARK, 'patternScale', 'Bark size', 'How big each plate or mark on the wood is.', 0.6, 2, 0.05, 1),
} as const

const BUILD = {
    kind: 'choice',
    group: TRUNK,
    key: 'build',
    label: 'Style',
    help: 'Normal is soft and leafy. Low-poly is the same tree in a few flat-sided blocks, lighter to draw.',
    options: [
        {value: 'painted', label: 'Normal'},
        {value: 'low-poly', label: 'Low-poly'},
    ],
    default: 'painted',
} as const satisfies ChoiceParameter<TreeBuild>

const FORM = {
    kind: 'choice',
    group: TRUNK,
    key: 'form',
    label: 'Kind of tree',
    help: 'Which rules lay the tree out.',
    options: [
        {value: 'crown', label: 'Branching'},
        {value: 'palm', label: 'Palm'},
        {value: 'conifer', label: 'Conifer'},
    ],
    default: 'crown',
} as const satisfies ChoiceParameter<TreeForm>

const CROWN_SHAPE = {
    kind: 'choice',
    group: BRANCHES,
    key: 'crownShape',
    label: 'Crown shape',
    help: 'The outline the branches grow to fill. The other branch controls still adjust it.',
    options: [
        {value: 'natural', label: 'Natural'},
        {value: 'round', label: 'Round'},
        {value: 'wide', label: 'Wide'},
        {value: 'umbrella', label: 'Umbrella'},
        {value: 'column', label: 'Column'},
        {value: 'cone', label: 'Cone'},
        {value: 'teardrop', label: 'Teardrop'},
    ],
    default: 'natural',
} as const satisfies ChoiceParameter<CrownShape>

const FROND_STYLE = {
    kind: 'choice',
    group: LEAVES,
    key: 'frondStyle',
    label: 'Frond',
    help: 'A feather of leaflets, a fan at the end of a stalk, or one broad blade.',
    options: [
        {value: 'feather', label: 'Feather'},
        {value: 'fan', label: 'Fan'},
        {value: 'blade', label: 'Blade'},
    ],
    default: 'feather',
} as const satisfies ChoiceParameter<FrondStyle>

const FRUIT_KIND = {
    kind: 'choice',
    group: FRUIT,
    key: 'fruitKind',
    label: 'Kind of fruit',
    help: 'What the tree carries.',
    options: [
        {value: 'coconut', label: 'Coconut'},
        {value: 'apple', label: 'Apple'},
        {value: 'orange', label: 'Orange'},
        {value: 'lemon', label: 'Lemon'},
        {value: 'plum', label: 'Plum'},
    ],
    default: 'apple',
} as const satisfies ChoiceParameter<FruitKind>

const BARK_PATTERN = {
    kind: 'choice',
    group: BARK,
    key: 'barkPattern',
    label: 'Bark pattern',
    help: 'The pattern on all the heavy wood, carved and painted.',
    options: [
        {value: 'none', label: 'Plain'},
        {value: 'ringed', label: 'Rings'},
        {value: 'plated', label: 'Plates'},
        {value: 'banded', label: 'Birch marks'},
        {value: 'peeling', label: 'Peeling'},
        {value: 'fibrous', label: 'Fibres'},
    ],
    default: 'none',
} as const satisfies ChoiceParameter<BarkPattern>

const BARK_TONE = {
    kind: 'choice',
    group: 'Colours',
    key: 'barkTone',
    label: 'Bark colour',
    help: 'The colour of the wood, separate from the leaves.',
    options: [
        {value: 'palette', label: 'Match the palette'},
        {value: 'oak', label: 'Oak brown'},
        {value: 'birch', label: 'Birch white'},
        {value: 'pine', label: 'Pine red-brown'},
        {value: 'palm', label: 'Palm tan'},
        {value: 'redwood', label: 'Redwood'},
        {value: 'ash', label: 'Ash grey'},
        {value: 'charcoal', label: 'Charcoal'},
        {value: 'bone', label: 'Bleached'},
    ],
    default: 'palette',
} as const satisfies ChoiceParameter<BarkToneId>

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
        {value: 'forest', label: 'Forest green'},
        {value: 'tropical', label: 'Tropical'},
        {value: 'pine', label: 'Deep pine'},
        {value: 'olive', label: 'Dry olive'},
        {value: 'maple', label: 'Red maple'},
        {value: 'golden', label: 'Golden'},
        {value: 'frost', label: 'Snow'},
        {value: 'teal', label: 'Teal fantasy'},
        {value: 'violet', label: 'Violet fantasy'},
        {value: 'ember', label: 'Ember'},
        {value: 'custom', label: 'My own colours'},
    ],
    default: 'blossom',
} as const satisfies ChoiceParameter<PaletteId>

export const paintedTreeParameterSpecs: readonly ParameterSpec[] = [
    BUILD,
    FORM,
    NUMBERS.height,
    NUMBERS.trunkRadius,
    NUMBERS.stem,
    NUMBERS.lean,
    NUMBERS.trunkBend,
    NUMBERS.corkscrew,
    NUMBERS.ridgeTwist,
    NUMBERS.ridgeDepth,
    NUMBERS.ridgeCount,
    NUMBERS.flare,
    NUMBERS.rootCount,
    NUMBERS.rootLength,
    CROWN_SHAPE,
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
    FROND_STYLE,
    NUMBERS.strands,
    NUMBERS.strandLength,
    NUMBERS.fruitCount,
    FRUIT_KIND,
    NUMBERS.fruitSize,
    PALETTE,
    BARK_TONE,
    NUMBERS.colourVariation,
    BARK_PATTERN,
    NUMBERS.patternDepth,
    NUMBERS.patternScale,
    NUMBERS.brushStrokes,
    NUMBERS.barkDetail,
    NUMBERS.roughness,
    NUMBERS.burls,
    NUMBERS.hollow,
    NUMBERS.snow,
    NUMBERS.moss,
    MOSS_FROM,
    NUMBERS.wet,
    NUMBERS.snapped,
    NUMBERS.brokenLimbs,
    NUMBERS.split,
]

/** Controls a form has no use for. */
const HIDDEN_BY_FORM: Readonly<Record<TreeForm, readonly string[]>> = {
    crown: ['stem', 'frondStyle'],
    palm: [
        'crownShape',
        'limbCount',
        'forkHeight',
        'spread',
        'limbAngle',
        'branchCount',
        'twigCount',
        'clumpMerge',
        'clumpFlatten',
        'lumpiness',
        'strands',
        'strandLength',
        // A palm has no branches to break, and its trunk is too slim to split.
        'brokenLimbs',
        'split',
    ],
    conifer: ['stem', 'crownShape', 'limbCount', 'limbAngle', 'gnarl', 'branchCount', 'twigCount', 'clumpMerge', 'lumpiness', 'frondStyle'],
}

/** Controls a low-poly tree has no use for: its bark is plain blocks and its leaves are not cards. */
const HIDDEN_WHEN_LOW_POLY: readonly string[] = [
    'ridgeTwist',
    'ridgeDepth',
    'ridgeCount',
    'fullness',
    'leafSize',
    'barkPattern',
    'patternDepth',
    'patternScale',
    'brushStrokes',
    'barkDetail',
    'roughness',
    'burls',
    'hollow',
    'moss',
    'mossFrom',
]

/** What a shared control means on a form that reuses it for something else. */
const LABELS_BY_FORM: Readonly<Record<TreeForm, Readonly<Record<string, string>>>> = {
    crown: {},
    palm: {
        clumpCount: 'Fronds',
        clumpSize: 'Frond length',
        droop: 'Frond arch',
        gnarl: 'Frond scatter',
        fullness: 'Leaflet density',
        leafSize: 'Leaflet width',
    },
    conifer: {
        clumpCount: 'Tiers',
        clumpSize: 'Tier size',
        clumpFlatten: 'Tier flatness',
        droop: 'Tier droop',
        spread: 'Width',
        forkHeight: 'Lowest tier',
    },
}

/** The controls that do something on this tree, under the names they go by on it. */
export function controlsForTree(
    specs: readonly ParameterSpec[],
    values: Readonly<Record<string, unknown>>,
): readonly ParameterSpec[] {
    const form = (values.form ?? FORM.default) as TreeForm
    // Style is a switch over the view, not a control in the panel.
    const hidden = ['build', ...(HIDDEN_BY_FORM[form] ?? []), ...(values.build === 'low-poly' ? HIDDEN_WHEN_LOW_POLY : [])]
    const labels = LABELS_BY_FORM[form] ?? {}
    const hasPattern = (values.barkPattern ?? BARK_PATTERN.default) !== 'none'
    const hasFruit = Number(values.fruitCount ?? 0) > 0

    return specs
        .filter(
            (spec) =>
                !hidden.includes(spec.key) &&
                (hasPattern || spec.key !== 'patternDepth') &&
                (Number(values.moss ?? 0) > 0 || spec.key !== 'mossFrom') &&
                (hasFruit || (spec.key !== 'fruitKind' && spec.key !== 'fruitSize')) &&
                (values.palette !== 'custom' || spec.key !== 'barkTone'),
        )
        .map((spec) => (labels[spec.key] ? {...spec, label: labels[spec.key]} : spec))
        // A palm has no branches: what is left of them shapes its fronds.
        .map((spec) => (form === 'palm' && spec.group === BRANCHES ? {...spec, group: LEAVES} : spec))
}

/** A heading in a part's panel: tree controls that belong with that part. */
export interface ControlSection {
    readonly title: string
    readonly help: string
    readonly specs: readonly ParameterSpec[]
    readonly colours: readonly (keyof Palette)[]
}

const specsInGroup = (group: string) => paintedTreeParameterSpecs.filter((spec) => spec.group === group)

const section = (
    title: string,
    help: string,
    specs: readonly ParameterSpec[],
    colours: readonly (keyof Palette)[] = [],
): ControlSection => ({title, help, specs, colours})

const TRUNK_SECTIONS: readonly ControlSection[] = [
    section(
        'Trunk shape',
        'The shape of the trunk.',
        specsInGroup(TRUNK).filter((spec) => spec !== NUMBERS.rootCount && spec !== NUMBERS.rootLength),
    ),
    section('Bark detail', 'The surface of the wood.', specsInGroup(BARK)),
    section('Bark colours', 'The colours of the wood.', [], ['barkDeep', 'barkLight']),
    section('Weather', 'Snow, moss and wet on the whole tree.', specsInGroup(WEATHER)),
    section('Damage', 'Breaks and cracks in the wood.', specsInGroup(DAMAGE)),
]

/**
 * The tree controls to offer with a selected part.
 *
 * Only the trunk has any, because there is one trunk and no slider can take it
 * away. Roots, branches and clumps come and go with the tree's counts, so a
 * tree control under one could delete the very part being edited.
 */
export function sectionsForPart(generatorId: string, type: string): readonly ControlSection[] {
    return generatorId === 'painted-bark' || (generatorId === 'painted-limb' && type === 'trunk')
        ? TRUNK_SECTIONS
        : []
}



export const FRUIT_COLOURS: Readonly<Record<FruitKind, {deep: string; light: string}>> = {
    coconut: {deep: '#3c2a1a', light: '#8a6a3c'},
    apple: {deep: '#8f1420', light: '#ee4a3a'},
    orange: {deep: '#c05a10', light: '#ffb238'},
    lemon: {deep: '#b89a10', light: '#fff06a'},
    plum: {deep: '#2c1248', light: '#8a4ab8'},
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
        readonly build: TreeBuild
        readonly form: TreeForm
        readonly crownShape: CrownShape
        readonly frondStyle: FrondStyle
        readonly fruitKind: FruitKind
        readonly barkPattern: BarkPattern
        readonly barkTone: BarkToneId
        readonly mossFrom: MossFrom
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
    build: choiceSchema(BUILD),
    form: choiceSchema(FORM),
    crownShape: choiceSchema(CROWN_SHAPE),
    frondStyle: choiceSchema(FROND_STYLE),
    fruitKind: choiceSchema(FRUIT_KIND),
    barkPattern: choiceSchema(BARK_PATTERN),
    barkTone: choiceSchema(BARK_TONE),
    mossFrom: choiceSchema(MOSS_FROM),
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
    build: BUILD.default,
    form: FORM.default,
    crownShape: CROWN_SHAPE.default,
    frondStyle: FROND_STYLE.default,
    fruitKind: FRUIT_KIND.default,
    barkPattern: BARK_PATTERN.default,
    barkTone: BARK_TONE.default,
    mossFrom: MOSS_FROM.default,
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
    if (tree.palette === 'custom') {
        return tree
    }

    return tree.barkTone === 'palette'
        ? PALETTES[tree.palette]
        : {...PALETTES[tree.palette], ...BARK_TONES[tree.barkTone]}
}
