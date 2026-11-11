/**
 * Ready-made trees.
 *
 * A preset is a parameter set and a seed. Nothing more, so a preset stays
 * editable: picking one fills the tree's parameters, and every control
 * remains the user's to change afterwards.
 */

import {bushDefaults} from '../../bushes/bush-generator'
import {cactusDefaults} from '../../cacti/cactus-generator'
import {grassDefaults} from '../../grass/grass-generator'
import {plantDefaults} from '../../plants/plant-generator'
import {cutRockDefaults} from '../../rocks/cut-rock-generator'
import {paintedTreeDefaults} from '../painted'

export interface TreePreset {
    readonly id: string
    readonly name: string
    readonly sub: string
    readonly generatorId: string
    readonly parameters: Readonly<Record<string, number | string>>
    readonly seed: number
    /** The heading it is listed under. */
    readonly category?: PresetCategory
}

export const PRESET_CATEGORIES = [
    'Broadleaf',
    'Blossom & fruit',
    'Palms & tropical',
    'Conifers',
    'Weeping',
    'Old & bare',
    'Shrubs & saplings',
    'Fantasy',
    'Bushes',
    'Ferns',
    'Flowers',
    'Grass',
    'Cacti',
    'Boulders',
    'Outcrops',
    'Stones',
    'Cliffs',
] as const

export type PresetCategory = (typeof PRESET_CATEGORIES)[number]

/** The kind of prop a preset is listed under. */
export type PropFamily = 'tree' | 'palm' | 'bush' | 'flower' | 'grass' | 'cactus' | 'rock'

/** Every kind, in the order Home shows them. Each is named alone, and as a heading. */
export const PROP_FAMILIES: readonly {readonly id: PropFamily; readonly label: string; readonly plural: string}[] = [
    {id: 'tree', label: 'Tree', plural: 'Trees'},
    {id: 'palm', label: 'Palm', plural: 'Palms'},
    {id: 'bush', label: 'Bush', plural: 'Bushes'},
    {id: 'flower', label: 'Flower', plural: 'Flowers'},
    {id: 'grass', label: 'Grass', plural: 'Grass'},
    {id: 'cactus', label: 'Cactus', plural: 'Cacti'},
    {id: 'rock', label: 'Rock', plural: 'Rocks'},
]

const familyOfCategory = (category: PresetCategory | undefined): PropFamily => {
    switch (category) {
        case 'Palms & tropical':
            return 'palm'
        case 'Bushes':
        case 'Ferns':
            return 'bush'
        case 'Flowers':
            return 'flower'
        case 'Grass':
            return 'grass'
        case 'Cacti':
            return 'cactus'
        case 'Boulders':
        case 'Outcrops':
        case 'Stones':
        case 'Cliffs':
            return 'rock'
        default:
            return 'tree'
    }
}

/** One painted tree: only what differs from the defaults. */
const painted = (
    category: PresetCategory,
    id: string,
    name: string,
    sub: string,
    seed: number,
    parameters: Readonly<Record<string, number | string>>,
): TreePreset => ({
    id,
    name,
    sub,
    category,
    seed,
    generatorId: 'painted-tree',
    parameters: {...paintedTreeDefaults, ...parameters},
})

/** One rock: only what differs from the defaults. */
const rock = (
    category: PresetCategory,
    id: string,
    name: string,
    sub: string,
    seed: number,
    parameters: Readonly<Record<string, number | string>>,
): TreePreset => ({id, name, sub, category, seed, generatorId: 'cut-rock', parameters: {...cutRockDefaults, ...parameters}})

/** One bush: only what differs from the defaults. */
const bush = (
    id: string,
    name: string,
    sub: string,
    seed: number,
    parameters: Readonly<Record<string, number | string>>,
): TreePreset => ({id, name, sub, category: 'Bushes', seed, generatorId: 'bush', parameters: {...bushDefaults, ...parameters}})

/** One flowering plant: only what differs from the defaults. */
const plant = (
    id: string,
    name: string,
    sub: string,
    seed: number,
    parameters: Readonly<Record<string, number | string>>,
): TreePreset => ({id, name, sub, category: 'Flowers', seed, generatorId: 'plant', parameters: {...plantDefaults, ...parameters}})

/** One cactus: only what differs from the defaults. */
const cactus = (
    id: string,
    name: string,
    sub: string,
    seed: number,
    parameters: Readonly<Record<string, number | string>>,
): TreePreset => ({id, name, sub, category: 'Cacti', seed, generatorId: 'cactus', parameters: {...cactusDefaults, ...parameters}})

/** One patch of grass: only what differs from the defaults. */
const grass = (
    id: string,
    name: string,
    sub: string,
    seed: number,
    parameters: Readonly<Record<string, number | string>>,
): TreePreset => ({id, name, sub, category: 'Grass', seed, generatorId: 'grass', parameters: {...grassDefaults, ...parameters}})

const PALM_BASE = {
    form: 'palm',
    palette: 'tropical',
    barkTone: 'palm',
    barkPattern: 'ringed',
    patternDepth: 0.7,
    ridgeDepth: 0,
    flare: 0.25,
    rootCount: 0,
    gnarl: 0.3,
    fullness: 0.75,
} as const

const CONIFER_BASE = {
    form: 'conifer',
    palette: 'pine',
    barkTone: 'pine',
    barkPattern: 'plated',
    ridgeDepth: 0,
    trunkBend: 0.02,
    lean: 0.02,
    flare: 0.3,
    rootCount: 4,
    rootLength: 0.7,
    clumpCount: 8,
    clumpFlatten: 0.92,
    clumpSize: 1,
    forkHeight: 0.3,
    spread: 6,
} as const

const BIRCH_BARK = {barkTone: 'birch', barkPattern: 'banded', patternDepth: 0.9, ridgeDepth: 0.02} as const

const paintedPresets: readonly TreePreset[] = [
    // Broadleaf
    painted('Broadleaf', 'oak', 'Old oak', 'Broad, heavy and gnarled', 301, {palette: 'forest', barkTone: 'oak', barkPattern: 'plated', barkDetail: 2, roughness: 0.2, height: 9, spread: 12, trunkRadius: 0.85, limbCount: 6, gnarl: 0.8, clumpCount: 14, forkHeight: 0.32, limbAngle: 28, burls: 2, ridgeDepth: 0.25}),
    painted('Broadleaf', 'beech', 'Beech', 'Tall, smooth and grey', 302, {palette: 'forest', barkTone: 'ash', height: 12, spread: 8, trunkRadius: 0.5, ridgeDepth: 0.02, forkHeight: 0.42, gnarl: 0.3, limbAngle: 48, clumpMerge: 0.5}),
    painted('Broadleaf', 'birch', 'Silver birch', 'Slim with white bark', 303, {...BIRCH_BARK, palette: 'spring', height: 10, spread: 5, trunkRadius: 0.24, forkHeight: 0.45, limbAngle: 55, limbCount: 5, gnarl: 0.3, clumpCount: 12, clumpSize: 0.85, leafSize: 0.8, rootCount: 3, flare: 0.15}),
    painted('Broadleaf', 'aspen', 'Golden aspen', 'A narrow yellow flame', 304, {...BIRCH_BARK, patternDepth: 0.5, palette: 'golden', height: 10, spread: 4, trunkRadius: 0.22, forkHeight: 0.4, limbAngle: 62, clumpCount: 13, clumpSize: 0.8, rootCount: 2, flare: 0.1}),
    painted('Broadleaf', 'maple', 'Red maple', 'A round autumn crown', 305, {palette: 'maple', barkTone: 'ash', height: 8, spread: 8, trunkRadius: 0.42, gnarl: 0.4, clumpMerge: 0.55, clumpCount: 12, forkHeight: 0.34, limbAngle: 44}),
    painted('Broadleaf', 'plane', 'Plane tree', 'Patchy bark, big shade', 306, {palette: 'forest', barkTone: 'ash', barkPattern: 'peeling', patternDepth: 0.9, height: 11, spread: 10, trunkRadius: 0.55, ridgeDepth: 0.02, clumpCount: 14, forkHeight: 0.38}),
    painted('Broadleaf', 'poplar', 'Poplar', 'A tall column', 307, {palette: 'forest', barkTone: 'charcoal', crownShape: 'column', height: 14, spread: 6, trunkRadius: 0.4, forkHeight: 0.3, limbAngle: 60, limbCount: 7, gnarl: 0.15, clumpCount: 14, clumpSize: 0.8, clumpMerge: 0.6, clumpFlatten: 0, ridgeDepth: 0.25}),
    painted('Broadleaf', 'acacia', 'Savanna acacia', 'A flat top on dry plains', 308, {palette: 'olive', barkTone: 'oak', crownShape: 'umbrella', height: 7, spread: 13, trunkRadius: 0.32, forkHeight: 0.5, limbAngle: 42, limbCount: 5, gnarl: 0.65, clumpCount: 9, clumpFlatten: 1, clumpMerge: 0.7, clumpSize: 1.05, rootCount: 3, flare: 0.18}),
    painted('Broadleaf', 'olive', 'Olive', 'Short, twisted and silver', 309, {palette: 'olive', barkTone: 'ash', height: 5.5, spread: 7, trunkRadius: 0.5, corkscrew: 0.75, ridgeDepth: 0.22, ridgeTwist: 1.6, hollow: 0.35, gnarl: 0.9, leafSize: 0.75, clumpCount: 12, forkHeight: 0.3}),
    painted('Broadleaf', 'redwood', 'Giant redwood', 'A huge fibrous trunk', 310, {palette: 'pine', barkTone: 'redwood', barkPattern: 'fibrous', patternDepth: 0.8, height: 18, spread: 7, trunkRadius: 1.1, forkHeight: 0.62, limbAngle: 30, limbCount: 7, gnarl: 0.2, clumpCount: 13, clumpSize: 0.75, flare: 0.55, ridgeDepth: 0.04}),

    // Blossom & fruit
    painted('Blossom & fruit', 'cherry-blossom', 'Cherry blossom', 'Pink and in full flower', 311, {palette: 'blossom', barkTone: 'redwood', barkPattern: 'ringed', patternDepth: 0.3, ridgeDepth: 0.02, height: 6.5, spread: 8, trunkRadius: 0.36, corkscrew: 0.3, gnarl: 0.7, clumpCount: 14, clumpSize: 0.9, leafSize: 0.75, forkHeight: 0.35}),
    painted('Blossom & fruit', 'white-blossom', 'White blossom', 'Pale, soft and early', 312, {palette: 'pale-blossom', barkTone: 'ash', height: 6, spread: 7, trunkRadius: 0.3, gnarl: 0.5, clumpCount: 13, clumpSize: 0.85, leafSize: 0.75}),
    painted('Blossom & fruit', 'apple', 'Apple tree', 'Low and full of fruit', 313, {palette: 'forest', barkTone: 'oak', barkPattern: 'plated', patternDepth: 0.3, patternScale: 0.7, height: 5, spread: 6, trunkRadius: 0.28, forkHeight: 0.35, gnarl: 0.65, clumpCount: 10, fruitCount: 7, fruitKind: 'apple', fruitSize: 1.4, rootCount: 3}),
    painted('Blossom & fruit', 'orange', 'Orange tree', 'A neat green ball', 314, {palette: 'tropical', barkTone: 'oak', ridgeDepth: 0.03, height: 4.5, spread: 4.5, trunkRadius: 0.2, forkHeight: 0.3, gnarl: 0.3, clumpMerge: 0.8, clumpCount: 9, fruitCount: 8, fruitKind: 'orange', fruitSize: 1.3, rootCount: 2}),
    painted('Blossom & fruit', 'lemon', 'Lemon tree', 'Small and bright', 315, {palette: 'spring', barkTone: 'ash', ridgeDepth: 0.03, height: 3.8, spread: 4, trunkRadius: 0.17, forkHeight: 0.3, clumpMerge: 0.7, clumpCount: 8, fruitCount: 7, fruitKind: 'lemon', fruitSize: 1.3, rootCount: 2}),
    painted('Blossom & fruit', 'plum', 'Plum tree', 'Dark fruit, dark leaves', 316, {palette: 'olive', barkTone: 'charcoal', height: 5, spread: 6, trunkRadius: 0.24, gnarl: 0.55, clumpCount: 10, fruitCount: 6, fruitKind: 'plum', fruitSize: 1.3, rootCount: 3}),
    painted('Blossom & fruit', 'pear', 'Pear tree', 'Upright, with heavy pears', 317, {palette: 'forest', barkTone: 'charcoal', barkPattern: 'plated', patternDepth: 0.4, patternScale: 0.6, height: 6, spread: 4.5, trunkRadius: 0.24, forkHeight: 0.32, limbAngle: 35, gnarl: 0.4, crownShape: 'teardrop', clumpCount: 10, fruitCount: 6, fruitKind: 'pear', fruitSize: 1.3, rootCount: 2}),
    painted('Blossom & fruit', 'cherry', 'Cherry tree', 'Red pairs on long stalks', 318, {palette: 'spring', barkTone: 'redwood', barkPattern: 'ringed', patternDepth: 0.3, ridgeDepth: 0.02, height: 6, spread: 7, trunkRadius: 0.3, gnarl: 0.5, clumpCount: 10, fruitCount: 6, fruitKind: 'cherry', fruitSize: 1.8, fruitHang: 0.12}),
    painted('Blossom & fruit', 'fig', 'Fig tree', 'Low, wide and leafy', 319, {palette: 'olive', barkTone: 'ash', height: 4.5, spread: 7, trunkRadius: 0.3, forkHeight: 0.25, gnarl: 0.6, clumpCount: 9, clumpMerge: 0.6, leafSize: 1.2, fruitCount: 6, fruitKind: 'fig', fruitSize: 1.7, rootCount: 3}),
    painted('Blossom & fruit', 'pomegranate', 'Pomegranate', 'A bushy shrub of red fruit', 320, {palette: 'forest', barkTone: 'ash', height: 3.5, spread: 4, trunkRadius: 0.14, forkHeight: 0.2, limbCount: 6, gnarl: 0.6, clumpCount: 10, clumpSize: 0.8, leafSize: 0.7, fruitCount: 5, fruitKind: 'pomegranate', fruitSize: 1.4, rootCount: 2}),
    painted('Blossom & fruit', 'mango', 'Mango tree', 'Dense, dark and glossy', 329, {palette: 'forest', barkTone: 'charcoal', barkPattern: 'plated', patternDepth: 0.3, height: 7, spread: 8, trunkRadius: 0.4, forkHeight: 0.3, gnarl: 0.45, crownShape: 'round', clumpCount: 10, clumpMerge: 0.75, leafStyle: 'broad', fullness: 0.6, fruitCount: 4, fruitKind: 'mango', fruitSize: 1.2, fruitHang: 0.6, rootCount: 3}),

    // Palms & tropical
    painted('Palms & tropical', 'coconut-palm-painted', 'Coconut palm', 'Tall, curved, with coconuts', 321, {...PALM_BASE, height: 11, trunkRadius: 0.24, lean: 0.34, trunkBend: 0.08, clumpCount: 14, droop: 0.45, fruitCount: 7, fruitKind: 'coconut', fruitSize: 1.1}),
    painted('Palms & tropical', 'beach-palm', 'Beach palm', 'Leaning out over the sand', 322, {...PALM_BASE, height: 8, trunkRadius: 0.2, lean: 0.55, trunkBend: 0.14, clumpCount: 12, droop: 0.65, clumpSize: 1.05}),
    painted('Palms & tropical', 'royal-palm', 'Royal palm', 'Straight and stately', 323, {...PALM_BASE, palette: 'tropical', barkTone: 'ash', height: 15, trunkRadius: 0.32, lean: 0.03, trunkBend: 0.02, clumpCount: 16, droop: 0.3, clumpSize: 0.85, patternDepth: 0.4}),
    painted('Palms & tropical', 'date-palm', 'Date palm', 'Thick, rough and dusty', 324, {...PALM_BASE, barkPattern: 'plated', palette: 'olive', height: 9, trunkRadius: 0.38, lean: 0.06, trunkBend: 0.04, clumpCount: 22, droop: 0.4, clumpSize: 0.9, patternDepth: 1, patternScale: 0.8, fruitCount: 5, fruitKind: 'date', fruitSize: 1.6, fruitHang: 0.9}),
    painted('Palms & tropical', 'fan-palm', 'Fan palm', 'Round hands on stalks', 325, {...PALM_BASE, frondStyle: 'fan', height: 7, trunkRadius: 0.22, lean: 0.08, trunkBend: 0.05, clumpCount: 16, droop: 0.2, clumpSize: 0.8}),
    painted('Palms & tropical', 'banana', 'Banana plant', 'Broad torn blades', 326, {...PALM_BASE, frondStyle: 'blade', height: 3.6, trunkRadius: 0.17, lean: 0.03, trunkBend: 0.02, barkPattern: 'fibrous', clumpCount: 9, droop: 0.35, clumpSize: 1.05, leafSize: 1.1, palette: 'spring'}),
    painted('Palms & tropical', 'pygmy-palm', 'Pygmy palm', 'Short and bushy', 327, {...PALM_BASE, barkPattern: 'plated', height: 2.8, trunkRadius: 0.13, lean: 0.1, trunkBend: 0.04, clumpCount: 16, droop: 0.5, clumpSize: 1.05}),
    painted('Palms & tropical', 'tree-fern', 'Tree fern', 'Prehistoric and lacy', 328, {...PALM_BASE, palette: 'pine', barkTone: 'redwood', barkPattern: 'fibrous', height: 4.5, trunkRadius: 0.2, lean: 0.08, clumpCount: 18, droop: 0.55, clumpSize: 0.95, fullness: 1.2, leafSize: 0.7}),

    // Conifers
    painted('Conifers', 'spruce', 'Spruce', 'A dark, classic cone', 331, {...CONIFER_BASE, patternDepth: 0.35, patternScale: 0.7, height: 11, trunkRadius: 0.3, clumpCount: 9, spread: 6.5, droop: 0.35}),
    painted('Conifers', 'fir', 'Slim fir', 'Narrow mountain tree', 332, {...CONIFER_BASE, barkTone: 'ash', barkPattern: 'none', ridgeDepth: 0.03, height: 14, trunkRadius: 0.28, clumpCount: 11, spread: 4.5, droop: 0.2, clumpSize: 0.95}),
    painted('Conifers', 'snow-pine', 'Snowy pine', 'Winter on every tier', 333, {...CONIFER_BASE, palette: 'frost', barkTone: 'charcoal', height: 10, trunkRadius: 0.28, clumpCount: 8, spread: 6, droop: 0.45, colourVariation: 0.1}),
    painted('Conifers', 'christmas', 'Festive fir', 'Round, with baubles', 334, {...CONIFER_BASE, barkPattern: 'none', ridgeDepth: 0.03, palette: 'pine', height: 6, trunkRadius: 0.17, clumpCount: 7, spread: 5, droop: 0.3, fruitCount: 5, fruitKind: 'apple', fruitSize: 0.8}),
    painted('Conifers', 'larch', 'Autumn larch', 'A gold conifer', 335, {...CONIFER_BASE, palette: 'golden', height: 12, trunkRadius: 0.27, clumpCount: 9, spread: 5.5, droop: 0.55, fullness: 0.6}),
    painted('Conifers', 'scots-pine', 'Scots pine', 'A bare stem, a high flat top', 336, {palette: 'pine', barkTone: 'pine', barkPattern: 'plated', height: 12, spread: 7, trunkRadius: 0.36, forkHeight: 0.68, limbAngle: 22, limbCount: 6, gnarl: 0.6, clumpCount: 9, clumpFlatten: 0.95, clumpMerge: 0.5, leafSize: 0.75, ridgeDepth: 0.02}),
    painted('Conifers', 'cypress', 'Cypress', 'A dark flame', 337, {...CONIFER_BASE, barkPattern: 'fibrous', height: 11, trunkRadius: 0.22, clumpCount: 12, spread: 2.5, clumpFlatten: 0.75, droop: 0, clumpSize: 1.05}),
    painted('Conifers', 'pine-cones', 'Cone pine', 'Hung with brown cones', 338, {...CONIFER_BASE, patternDepth: 0.35, patternScale: 0.7, height: 10, trunkRadius: 0.28, clumpCount: 8, spread: 6, droop: 0.4, fruitCount: 4, fruitKind: 'cone', fruitSize: 1.1, fruitHang: 0.2}),

    // Weeping
    painted('Weeping', 'willow', 'Weeping willow', 'Long curtains to the ground', 341, {palette: 'spring', barkTone: 'ash', ridgeDepth: 0.25, height: 8, spread: 11, trunkRadius: 0.55, droop: 0.65, forkHeight: 0.42, limbAngle: 50, clumpCount: 12, clumpSize: 0.8, clumpMerge: 0.5, strands: 0.8, strandLength: 0.85, leafSize: 0.7, fullness: 0.45}),
    painted('Weeping', 'weeping-cherry', 'Weeping cherry', 'Pink falling strands', 342, {palette: 'blossom', barkTone: 'redwood', barkPattern: 'ringed', patternDepth: 0.3, ridgeDepth: 0.02, height: 6, spread: 8, trunkRadius: 0.3, droop: 0.7, gnarl: 0.65, clumpCount: 9, clumpSize: 0.8, strands: 0.7, strandLength: 0.65, leafSize: 0.65, fullness: 0.5}),
    painted('Weeping', 'wisteria', 'Wisteria', 'Violet hanging flowers', 343, {palette: 'violet', barkTone: 'oak', corkscrew: 0.75, ridgeTwist: 1.8, height: 6, spread: 9, trunkRadius: 0.35, droop: 0.5, clumpCount: 10, clumpFlatten: 0.8, strands: 0.6, strandLength: 0.45, leafSize: 0.7, fullness: 0.5}),
    painted('Weeping', 'golden-willow', 'Golden willow', 'Autumn curtains', 344, {palette: 'golden', barkTone: 'ash', ridgeDepth: 0.25, height: 8, spread: 10, trunkRadius: 0.48, droop: 0.65, clumpCount: 12, clumpMerge: 0.5, clumpSize: 0.8, strands: 0.75, strandLength: 0.75, leafSize: 0.7, fullness: 0.45}),

    // Old & bare
    painted('Old & bare', 'dead-oak', 'Dead oak', 'Bare, grey and split', 351, {palette: 'spring', barkTone: 'ash', barkPattern: 'peeling', patternDepth: 0.3, height: 8, spread: 10, trunkRadius: 0.7, clumpCount: 0, gnarl: 1, limbCount: 6, hollow: 0.55, burls: 3, moss: 0.15, ridgeDepth: 0.15}),
    painted('Old & bare', 'bleached', 'Bleached snag', 'Desert bones', 352, {palette: 'olive', barkTone: 'bone', height: 6, spread: 5, trunkRadius: 0.32, clumpCount: 0, gnarl: 0.9, limbCount: 3, branchCount: 2, twigCount: 1, corkscrew: 0.5, ridgeTwist: 2, rootCount: 4, rootLength: 1.4}),
    painted('Old & bare', 'burnt', 'Burnt stump tree', 'After the fire', 353, {palette: 'ember', barkTone: 'charcoal', barkPattern: 'plated', patternDepth: 0.6, height: 5.5, spread: 4, trunkRadius: 0.45, clumpCount: 0, limbCount: 3, branchCount: 2, twigCount: 0, hollow: 0.6, roughness: 0.7}),
    painted('Old & bare', 'winter', 'Winter tree', 'Asleep and full of twigs', 354, {palette: 'spring', barkTone: 'oak', height: 9, spread: 9, trunkRadius: 0.42, clumpCount: 0, branchCount: 5, twigCount: 4, gnarl: 0.55, limbCount: 6}),
    painted('Old & bare', 'snowy-winter', 'Snowy winter tree', 'Bare, with snow along its limbs', 354, {palette: 'spring', barkTone: 'oak', height: 9, spread: 9, trunkRadius: 0.42, clumpCount: 0, branchCount: 5, twigCount: 4, gnarl: 0.55, limbCount: 6, snow: 0.85}),
    painted('Old & bare', 'ancient', 'Ancient giant', 'Roots, burls and moss', 355, {palette: 'spring', barkTone: 'oak', height: 11, spread: 14, trunkRadius: 1.15, flare: 0.8, rootCount: 11, rootLength: 1.7, burls: 6, hollow: 0.45, moss: 0.65, ridgeDepth: 0.28, ridgeTwist: 1.3, gnarl: 0.8, limbCount: 7, clumpCount: 15, forkHeight: 0.3}),
    painted('Old & bare', 'twisted', 'Twisted old tree', 'Wound around itself', 356, {palette: 'autumn', barkTone: 'oak', height: 7, spread: 8, trunkRadius: 0.55, corkscrew: 1, ridgeDepth: 0.3, ridgeTwist: 2.6, ridgeCount: 4, gnarl: 0.9, clumpCount: 9, forkHeight: 0.42}),

    // Shrubs & saplings
    bush('round-bush', 'Round bush', 'A soft dome that fills any gap', 361, {}),
    bush('small-bush', 'Small bush', 'Knee high and dense', 364, {width: 1.2, height: 0.9, depth: 1.1, lobes: 4, leafSize: 0.11}),
    bush('spreading-bush', 'Spreading bush', 'Low and wide', 365, {kind: 'spreading', width: 4, height: 1.3, depth: 3.4, lobes: 9, leafSize: 0.22, palette: 'lush'}),
    bush('tall-shrub', 'Tall shrub', 'Upright and full', 366, {kind: 'tall', width: 2, height: 3, depth: 2, lobes: 8, leafSize: 0.2, palette: 'pine'}),
    bush('open-bush', 'Airy bush', 'Twigs and sky show through', 369, {inside: 'open', fullness: 1.3, leafSize: 0.16}),
    bush('wild-shrub', 'Wild shrub', 'Tall, loose and thin', 370, {kind: 'tall', width: 2, height: 2.6, depth: 2, lobes: 7, inside: 'open', fullness: 1.1, leafSize: 0.15, palette: 'olive'}),
    bush('young-bush', 'Young bush', 'Low, with bare twigs inside', 371, {kind: 'spreading', width: 2.4, height: 1.3, depth: 2.2, lobes: 6, inside: 'open', fullness: 1.4, leafSize: 0.12, palette: 'spring'}),
    bush('wild-rose', 'Wild rose', 'Open, with scattered pink', 372, {width: 2.2, height: 1.6, depth: 2, lobes: 6, inside: 'open', fullness: 1.3, leafSize: 0.13, palette: 'lush', flowers: 0.6, flowerSize: 0.06}),
    bush('flower-bush', 'Flowering bush', 'Drifts of pink on green', 362, {width: 2.6, height: 1.7, depth: 2.3, lobes: 6, leafSize: 0.18, palette: 'lush', flowers: 0.8, flowerSize: 0.075}),
    bush('white-bush', 'White blossom', 'Pale flowers over dark leaves', 367, {width: 2.2, height: 1.5, depth: 2, lobes: 5, leafSize: 0.16, palette: 'pine', flowers: 0.7, flowerSize: 0.065, flowerColour: 'white'}),
    bush('gold-bush', 'Golden shrub', 'Low, with yellow flowers', 368, {kind: 'spreading', width: 3, height: 1.2, depth: 2.6, lobes: 7, leafSize: 0.18, flowers: 0.6, flowerSize: 0.06, flowerColour: 'gold'}),
    bush('autumn-bush', 'Autumn bush', 'Low and red', 363, {width: 2.4, height: 1.5, depth: 2.2, lobes: 5, leafSize: 0.17, palette: 'maple'}),
    bush('snowy-bush', 'Snowy bush', 'Evergreen under fresh snow', 377, {width: 2.2, height: 1.5, depth: 2, lobes: 6, leafSize: 0.17, palette: 'pine', snow: 0.7}),
    bush('box-hedge', 'Box hedge', 'Tiny leaves, clipped square', 378, {kind: 'hedge', width: 4, height: 1, depth: 0.9, lobes: 5, lumps: 0.15, leafSize: 0.13, leafStyle: 'tiny', variation: 0.15, palette: 'pine'}),
    bush('holly', 'Holly', 'Spiky and glossy, with red berries', 379, {kind: 'tall', width: 2, height: 2.6, depth: 1.9, lobes: 7, leafSize: 0.17, leafStyle: 'spiky', palette: 'pine', flowers: 0.55, bloom: 'berries', flowerSize: 0.05, flowerColour: 'red'}),
    bush('juniper', 'Juniper', 'A low, dark carpet of scales', 380, {kind: 'spreading', width: 3.4, height: 0.9, depth: 3, lobes: 8, lumps: 0.6, leafSize: 0.15, leafStyle: 'scales', palette: 'pine', variation: 0.3}),
    bush('laurel', 'Laurel', 'Long glossy leaves', 399, {kind: 'tall', width: 2.6, height: 2.8, depth: 2.4, lobes: 8, leafSize: 0.24, leafStyle: 'narrow', palette: 'lush'}),
    bush('hydrangea', 'Hydrangea', 'Big leaves and blue balls of flowers', 359, {width: 2.2, height: 1.9, depth: 2, lobes: 5, leafSize: 0.22, leafStyle: 'glossy', palette: 'lush', flowers: 1, bloom: 'ball', flowerSize: 0.11, flowerColour: 'blue'}),
    bush('heather', 'Heather', 'Low, with pink bells', 360, {kind: 'spreading', width: 1.6, height: 0.6, depth: 1.4, lobes: 6, lumps: 0.6, leafSize: 0.09, leafStyle: 'scales', palette: 'olive', flowers: 0.85, bloom: 'bell', flowerSize: 0.04, flowerColour: 'pink'}),
    painted('Shrubs & saplings', 'sapling', 'Young sapling', 'Thin and just started', 364, {palette: 'spring', height: 3.2, spread: 2.6, trunkRadius: 0.1, forkHeight: 0.5, limbAngle: 55, limbCount: 3, branchCount: 2, twigCount: 1, clumpCount: 5, clumpSize: 0.9, rootCount: 0, flare: 0.1, ridgeDepth: 0}),
    painted('Shrubs & saplings', 'topiary', 'Topiary ball', 'A clipped garden ball', 365, {palette: 'pine', height: 3, spread: 2, trunkRadius: 0.1, forkHeight: 0.55, limbAngle: 60, limbCount: 3, branchCount: 1, twigCount: 0, clumpCount: 3, clumpMerge: 1, clumpSize: 1.3, clumpFlatten: 0, lumpiness: 0, gnarl: 0, trunkBend: 0, lean: 0, rootCount: 0, flare: 0.05, ridgeDepth: 0}),

    // Fantasy
    painted('Fantasy', 'spirit-tree', 'Spirit tree', 'Glowing teal', 371, {palette: 'teal', barkTone: 'charcoal', corkscrew: 0.6, ridgeTwist: 2, height: 9, spread: 11, trunkRadius: 0.6, gnarl: 0.9, clumpCount: 13}),
    painted('Fantasy', 'witch-tree', 'Witch tree', 'Violet and crooked', 372, {palette: 'violet', barkTone: 'charcoal', corkscrew: 1, ridgeDepth: 0.3, ridgeTwist: 2.8, hollow: 0.6, gnarl: 1, height: 8, spread: 9, trunkRadius: 0.6, clumpCount: 8, droop: 0.3}),
    painted('Fantasy', 'ember-tree', 'Ember tree', 'Burning leaves, black wood', 373, {palette: 'ember', barkTone: 'charcoal', barkPattern: 'peeling', patternDepth: 0.6, height: 8, spread: 9, trunkRadius: 0.55, gnarl: 0.8, clumpCount: 11}),
    painted('Fantasy', 'glow-willow', 'Glow willow', 'Teal curtains', 374, {palette: 'teal', barkTone: 'ash', height: 8, spread: 10, trunkRadius: 0.5, droop: 0.7, clumpCount: 12, clumpMerge: 0.5, clumpSize: 0.8, strands: 0.85, strandLength: 0.85, leafSize: 0.7, fullness: 0.45}),
    painted('Fantasy', 'frost-tree', 'Frost tree', 'White, without a season', 375, {palette: 'frost', barkTone: 'bone', height: 8, spread: 9, trunkRadius: 0.5, gnarl: 0.7, clumpCount: 12, colourVariation: 0.1}),
    painted('Fantasy', 'alien-palm', 'Alien palm', 'From another shore', 376, {...PALM_BASE, palette: 'violet', barkTone: 'charcoal', height: 9, trunkRadius: 0.24, lean: 0.4, corkscrew: 0.7, clumpCount: 12, frondStyle: 'fan', droop: 0.5}),
]

/** Low plants on a slim stem, where the fronds and clumps are the whole prop. */
const LOW_PLANT = {...PALM_BASE, stem: 0.05, height: 0.8, trunkRadius: 0.02, lean: 0.02, trunkBend: 0, flare: 0, barkPattern: 'none', fruitCount: 0} as const

const foliagePresets: readonly TreePreset[] = [
    painted('Ferns', 'forest-fern', 'Forest fern', 'Arching and lacy', 381, {...LOW_PLANT, palette: 'forest', stem: 0.2, height: 0.7, clumpCount: 9, droop: 0.2, clumpSize: 0.8, leafSize: 0.7}),
    painted('Ferns', 'bracken', 'Bracken', 'Tall and open', 382, {...LOW_PLANT, palette: 'spring', stem: 0.25, height: 1.1, clumpCount: 7, droop: 0.15, clumpSize: 0.8, leafSize: 0.8}),
    grass('grass-tuft', 'Grass tuft', 'A single dense clump', 383, {width: 0.5, height: 0.6, blades: 70, clumps: 3, smoothness: 4, gather: 0.3, scatter: 0.45, bladeWidth: 0.024, dryness: 0}),
    grass('meadow-patch', 'Meadow patch', 'Long grass combed by wind', 387, {}),
    grass('short-lawn', 'Short lawn', 'Low, even and green', 388, {width: 1.5, height: 0.25, blades: 480, lean: 0.35, bladeWidth: 0.018, tall: 0.02, dryness: 0, palette: 'lush'}),
    grass('long-grass', 'Long grass', 'Waist high and bending', 389, {width: 2, height: 1.1, blades: 400, clumps: 7, lean: 0.75, bladeWidth: 0.036, tall: 0.12}),
    grass('broad-tuft', 'Broad tuft', 'Few wide blades up close', 390, {width: 0.8, height: 0.7, blades: 36, clumps: 3, smoothness: 4, bladeWidth: 0.06, scatter: 0.5, tall: 0.2, dryness: 0, palette: 'lush'}),
    grass('dry-tuft', 'Dry tuft', 'Pale and past its season', 391, {width: 0.7, height: 0.8, blades: 110, clumps: 3, scatter: 0.4, bladeWidth: 0.022, dryness: 1}),
    grass('reeds', 'Reeds', 'Tall thin blades', 384, {width: 0.7, height: 1.4, blades: 60, clumps: 3, lean: 0.2, scatter: 0.4, bladeWidth: 0.026, tall: 0.1, dryness: 0, palette: 'reed'}),
    plant('flower-clump', 'Pink blooms', 'Open flowers on tall stems', 385, {width: 0.7, height: 0.6, stems: 8, headSize: 0.13, leaves: 3, palette: 'pink'}),
    plant('daisies', 'Daisies', 'A low white drift', 392, {width: 1, height: 0.32, stems: 24, headSize: 0.07, leaves: 1}),
    plant('flame-flowers', 'Flame flowers', 'Closed and bright', 393, {kind: 'cup', width: 0.6, height: 0.65, stems: 7, headSize: 0.09, lean: 0.12, leaves: 3, palette: 'flame'}),
    plant('red-spikes', 'Red spikes', 'Tall towers of small flowers', 394, {kind: 'spike', width: 0.7, height: 0.9, stems: 9, headSize: 0.2, lean: 0.1, leaves: 2, palette: 'flame'}),
    plant('violet-spikes', 'Violet spikes', 'Cool colour for a meadow', 395, {kind: 'spike', width: 0.8, height: 0.7, stems: 12, headSize: 0.15, lean: 0.12, leaves: 2, palette: 'violet'}),
    plant('pampas', 'Pampas plumes', 'Pale feathers on long stems', 396, {kind: 'plume', width: 0.8, height: 1.7, stems: 7, headSize: 0.55, lean: 0.45, leaves: 2, palette: 'cream'}),
    grass('flower-meadow', 'Flower meadow', 'Long grass with daisies through it', 397, {blades: 340, flowers: 30}),
    grass('far-meadow', 'Far meadow', 'A light patch for the distance', 398, {blades: 70, clumps: 5, bladeWidth: 0.1, smoothness: 2, dryness: 0.08}),
    bush('low-hedge', 'Low hedge', 'Dense and neat', 386, {kind: 'hedge', width: 5, height: 1.2, depth: 1.1, lobes: 6, lumps: 0.3, leafSize: 0.16, variation: 0.25, palette: 'lush'}),
    cactus('saguaro', 'Saguaro', 'A tall column with arms', 601, {}),
    cactus('young-saguaro', 'Young saguaro', 'Before the arms come', 602, {height: 1.8, thickness: 0.3, arms: 0, ribs: 11}),
    cactus('organ-pipe', 'Organ pipe', 'Stems rising from the ground', 603, {height: 3.2, thickness: 0.22, arms: 5, armHeight: 0.05, ribs: 8, ribDepth: 0.45, spines: 0.5, palette: 'sage'}),
    cactus('golden-barrel', 'Golden barrel', 'Round, with gold spines', 604, {kind: 'barrel', height: 0.5, thickness: 0.75, ribs: 22, ribDepth: 0.7, spines: 1, palette: 'golden'}),
    cactus('flowering-barrel', 'Flowering barrel', 'A crown of pink flowers', 605, {kind: 'barrel', height: 0.45, thickness: 0.4, ribs: 16, ribDepth: 0.5, spines: 0.7, flowers: 8, palette: 'blue'}),
    cactus('prickly-pear', 'Prickly pear', 'Flat pads with yellow flowers', 606, {kind: 'paddle', height: 1.6, thickness: 0.24, pads: 14, spines: 0.5, flowers: 5, flowerColour: 'gold', palette: 'olive'}),
]

const rockPresets: readonly TreePreset[] = [
    rock('Boulders', 'boulder', 'Boulder', 'Heavy, with stones at its feet', 401, {}),
    rock('Boulders', 'mossy-boulder', 'Mossy boulder', 'Old, with a green cap', 421, {width: 3.4, depth: 3, moss: 0.7, chunks: 3, faces: 0.8}),
    rock('Boulders', 'snowy-boulder', 'Snowy boulder', 'A cap of fresh snow', 422, {width: 3, height: 1.9, depth: 2.6, chunks: 3, faces: 0.7, moss: 0, snow: 0.7, palette: 'basalt'}),
    rock('Boulders', 'split-boulder', 'Sharp boulder', 'Cut into hard faces', 403, {width: 2.8, height: 2.2, depth: 2.4, chunks: 2, faces: 0.8, cuts: 1, edges: 0.35, moss: 0, palette: 'granite'}),
    rock('Outcrops', 'grassy-outcrop', 'Grassy outcrop', 'Stepping up a slope', 410, {kind: 'outcrop', width: 6, height: 2.6, depth: 3.5, chunks: 5, moss: 0.85}),
    rock('Outcrops', 'low-ledge', 'Low ledge', 'A long shelf of stone', 411, {kind: 'outcrop', width: 8, height: 1.3, depth: 3, chunks: 7, moss: 0.7, palette: 'slate'}),
    rock('Stones', 'field-stone', 'Field stone', 'Knee high and blunt', 404, {width: 0.9, height: 0.5, depth: 0.7, chunks: 1, faces: 0.45, cuts: 0.5, moss: 0.3}),
    rock('Stones', 'damp-stone', 'Damp stone', 'Wet, with moss on its shady side', 413, {width: 1.1, height: 0.7, depth: 0.9, chunks: 2, faces: 0.5, cuts: 0.45, moss: 0.75, mossFrom: 'shade', wet: 0.5, palette: 'slate'}),
    rock('Stones', 'river-stone', 'River stone', 'Worn nearly round', 405, {width: 0.7, height: 0.25, depth: 0.5, chunks: 1, faces: 0.7, cuts: 0.2, edges: 1, moss: 0, palette: 'slate'}),
    rock('Stones', 'step-stone', 'Stepping stone', 'A flat slab for a path', 412, {width: 1, height: 0.14, depth: 0.8, chunks: 1, faces: 0.35, cuts: 0.45, moss: 0, variation: 0.3}),
    rock('Stones', 'standing-stone', 'Standing stone', 'Tall and old', 406, {kind: 'pillar', width: 1, height: 3, depth: 0.7, chunks: 1, moss: 0.35}),
    rock('Cliffs', 'cliff-face', 'Cliff face', 'A wall of wedged stone', 407, {kind: 'cliff', width: 14, height: 10, depth: 6, chunks: 18, faces: 0.45, moss: 0.25}),
    rock('Cliffs', 'sea-stack', 'Sea stack', 'A lone tall pillar', 408, {kind: 'pillar', width: 5, height: 11, depth: 4.5, chunks: 5, palette: 'slate'}),
    rock('Cliffs', 'red-mesa', 'Red mesa', 'Flat topped and warm', 409, {kind: 'cliff', width: 16, height: 6, depth: 11, chunks: 14, moss: 0, palette: 'redrock'}),
]

/**
 * Broken versions of presets above, as the same tree or rock with damage done, so
 * each stays recognisably the one it came from.
 */
function damagedPresets(): readonly TreePreset[] {
    const all = [...paintedPresets, ...foliagePresets, ...rockPresets]
    const from = (baseId: string, id: string, name: string, sub: string, category: PresetCategory, changes: Readonly<Record<string, number | string>>): TreePreset => {
        const base = all.find((preset) => preset.id === baseId)!

        return {...base, id, name, sub, category, parameters: {...base.parameters, ...changes}}
    }

    return [
        from('oak', 'lightning-oak', 'Lightning oak', 'Struck, split and burnt', 'Old & bare', {snapped: 0.3, split: 1}),
        from('scots-pine', 'snapped-pine', 'Snapped pine', 'Broken off in a storm', 'Old & bare', {snapped: 0.45}),
        from('date-palm', 'broken-palm', 'Broken palm', 'Its crown gone', 'Palms & tropical', {snapped: 0.35}),
        from('saguaro', 'fallen-saguaro', 'Fallen saguaro', 'An arm lying at its foot', 'Cacti', {fallenArms: 1}),
        from('mossy-boulder', 'cracked-boulder', 'Cracked boulder', 'Split, with rubble at its foot', 'Boulders', {cracks: 0.8, crumble: 0.5, moss: 0.4}),
    ]
}

export const treePresets: readonly TreePreset[] = [
    {
        id: 'round-canopy',
        name: 'Round canopy',
        sub: 'The old style, to compare',
        generatorId: 'branching-tree',
        seed: 12345,
        parameters: {
            height: 4.2,
            trunkRadius: 0.32,
            bend: 'curved',
            twist: 0,
            branchCount: 12,
            branchLength: 2.6,
            foliageCount: 20,
            foliageSize: 0.6,
            foliageShape: 'round',
            rootCount: 6,
        },
    },
    {
        id: 'blossom-tree',
        name: 'Blossom tree',
        category: 'Blossom & fruit',
        sub: 'Old, heavy and in flower',
        generatorId: 'painted-tree',
        seed: 77123,
        parameters: {...paintedTreeDefaults},
    },
    {
        id: 'spring-tree',
        name: 'Spring tree',
        category: 'Broadleaf',
        sub: 'Fresh, round and green',
        generatorId: 'painted-tree',
        seed: 5,
        parameters: {...paintedTreeDefaults, palette: 'spring', gnarl: 0.3, spread: 8},
    },
    {
        id: 'autumn-tree',
        name: 'Autumn tree',
        category: 'Broadleaf',
        sub: 'Tall, gold and slender',
        generatorId: 'painted-tree',
        seed: 9,
        parameters: {
            ...paintedTreeDefaults,
            palette: 'autumn',
            height: 11,
            spread: 6,
            forkHeight: 0.5,
            trunkRadius: 0.42,
        },
    },
    ...paintedPresets,
    ...foliagePresets,
    ...rockPresets,
    ...damagedPresets(),
]

/**
 * Presets no longer offered.
 *
 * A saved tree remembers the preset it came from, and Restore goes back to it,
 * so these stay findable even though nobody can start from one now.
 */
const retiredPresets: readonly TreePreset[] = [
    {
        id: 'wide-canopy',
        name: 'Wide canopy',
        sub: 'Broad shade tree',
        generatorId: 'branching-tree',
        seed: 22468,
        parameters: {
            height: 3.6,
            trunkRadius: 0.38,
            bend: 'curved',
            twist: 0,
            branchCount: 16,
            branchLength: 3.1,
            foliageCount: 26,
            foliageSize: 0.75,
            foliageShape: 'layered',
            rootCount: 7,
        },
    },
    {
        id: 'tall-narrow',
        name: 'Tall narrow',
        sub: 'Alley and streets',
        generatorId: 'branching-tree',
        seed: 33912,
        parameters: {
            height: 6.4,
            trunkRadius: 0.24,
            bend: 'straight',
            twist: 0,
            branchCount: 9,
            branchLength: 1.9,
            foliageCount: 15,
            foliageSize: 0.5,
            foliageShape: 'oval',
            rootCount: 4,
        },
    },
    {
        id: 'twisted-fantasy',
        name: 'Twisted fantasy',
        sub: 'Old and gnarled',
        generatorId: 'branching-tree',
        seed: 48107,
        parameters: {
            height: 5.6,
            trunkRadius: 0.4,
            bend: 'very-curved',
            twist: 95,
            branchCount: 8,
            branchLength: 2.9,
            foliageCount: 12,
            foliageSize: 0.8,
            foliageShape: 'irregular',
            rootCount: 8,
        },
    },
    {
        id: 'exposed-root-ancient',
        name: 'Ancient tree',
        sub: 'Roots in the open',
        generatorId: 'branching-tree',
        seed: 55219,
        parameters: {
            height: 3.8,
            trunkRadius: 0.62,
            bend: 'curved',
            twist: 0,
            branchCount: 14,
            branchLength: 2.7,
            foliageCount: 24,
            foliageSize: 1,
            foliageShape: 'flat',
            rootCount: 12,
        },
    },
    {
        id: 'coconut-palm',
        name: 'Coconut palm',
        sub: 'Tall and curved',
        generatorId: 'palm-tree',
        seed: 9051,
        parameters: {
            height: 6.4,
            trunkRadius: 0.36,
            taper: 0.66,
            bend: 'curved',
            rings: 16,
            ringDepth: 0.09,
            crownSize: 0.46,
            frondCount: 10,
            frondLength: 3,
            frondArch: 'arched',
            leaflets: 18,
            coconutCount: 5,
            coconutSize: 0.17,
        },
    },
    {
        id: 'tropical-palm',
        name: 'Tropical palm',
        sub: 'Low and leafy',
        generatorId: 'palm-tree',
        seed: 3310,
        parameters: {
            height: 3.6,
            trunkRadius: 0.28,
            taper: 0.8,
            bend: 'curved',
            twist: 25,
            rings: 12,
            ringDepth: 0.06,
            crownSize: 0.5,
            frondCount: 14,
            frondLength: 2.4,
            frondArch: 'drooping',
            leaflets: 22,
            coconutCount: 0,
        },
    },
]

export function findPreset(id: string): TreePreset | undefined {
    return [...treePresets, ...retiredPresets].find((preset) => preset.id === id)
}

/** The tab a preset belongs under. A preset nobody can find any more is a tree. */
export const familyOfPreset = (id: string | null | undefined): PropFamily =>
    familyOfCategory(id ? findPreset(id)?.category : undefined)

const GENERATOR_FAMILIES: Readonly<Record<string, PropFamily>> = {
    'palm-tree': 'palm',
    'cut-rock': 'rock',
    rock: 'rock',
    bush: 'bush',
    plant: 'flower',
    grass: 'grass',
    cactus: 'cactus',
}

/**
 * The tab a prop belongs under, from its preset when it names one, and otherwise
 * from the generator that made it, as files saved before 0.3.5 name no preset.
 */
export const familyOfProp = (presetId: string | null | undefined, generatorId: string | null | undefined): PropFamily =>
    presetId && findPreset(presetId) ? familyOfPreset(presetId) : (GENERATOR_FAMILIES[generatorId ?? ''] ?? 'tree')

/**
 * The presets under their headings. The old-style first preset has no heading,
 * so it's left out: any painted tree can be low-poly now.
 */
export const presetGroups: readonly {title: string; family: PropFamily; presets: readonly TreePreset[]}[] = PRESET_CATEGORIES.map((title) => ({
    title,
    family: familyOfCategory(title),
    presets: treePresets.filter((preset) => preset.category === title),
}))
