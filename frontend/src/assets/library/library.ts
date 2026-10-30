/**
 * The shape library.
 *
 * A catalogue of ready-made parts. Each one is a parameter set for a
 * generator, so a library part and a hand-built part are the same thing.
 */

import type {ComponentType} from '../shared/component-types'

export type LibraryCategory =
    | 'trunks'
    | 'branches'
    | 'roots'
    | 'foliage'
    | 'fronds'
    | 'coconuts'

export const LIBRARY_CATEGORIES: readonly LibraryCategory[] = [
    'trunks',
    'branches',
    'roots',
    'foliage',
    'fronds',
    'coconuts',
]

export const CATEGORY_LABELS: Readonly<Record<LibraryCategory, string>> = {
    trunks: 'Trunks',
    branches: 'Branches',
    roots: 'Roots',
    foliage: 'Leaves',
    fronds: 'Fronds',
    coconuts: 'Coconuts',
}

/**
 * What a part can be attached to.
 *
 * The attachment is chosen so a new part never floats in mid-air.
 */
export type AttachmentRule =
    | 'at the base'
    | 'along the trunk'
    | 'on a branch'
    | 'at a branch tip'
    | 'on the crown'

export interface LibraryPart {
    readonly id: string
    readonly name: string
    readonly category: LibraryCategory
    /** One line, in the user's words. */
    readonly description: string
    readonly generatorId: string
    readonly type: ComponentType
    readonly parameters: Readonly<Record<string, unknown>>
    readonly attachment: AttachmentRule
}

export const LIBRARY_PARTS: readonly LibraryPart[] = [
    // --- Trunks ---------------------------------------------------------
    {
        id: 'trunk-straight',
        name: 'Straight trunk',
        category: 'trunks',
        description: 'Tall and upright, with even taper.',
        generatorId: 'trunk',
        type: 'trunk',
        parameters: {height: 4.5, baseRadius: 0.34, taper: 0.6, bend: 'straight', twist: 0},
        attachment: 'at the base',
    },
    {
        id: 'trunk-lean',
        name: 'Leaning trunk',
        category: 'trunks',
        description: 'Curves to one side as it rises.',
        generatorId: 'trunk',
        type: 'trunk',
        parameters: {height: 4, baseRadius: 0.3, taper: 0.5, bend: 'very-curved', twist: 0},
        attachment: 'at the base',
    },

    // --- Branches -------------------------------------------------------
    {
        id: 'branch-straight',
        name: 'Straight branch',
        category: 'branches',
        description: 'A clean branch that grows outwards.',
        generatorId: 'branch',
        type: 'branch',
        parameters: {length: 1.8, baseRadius: 0.09, tipRadius: 0.025, bend: 0.2, curl: 0, twist: 0},
        attachment: 'along the trunk',
    },
    {
        id: 'branch-up',
        name: 'Upward branch',
        category: 'branches',
        description: 'Sweeps upwards like a young tree.',
        generatorId: 'branch',
        type: 'branch',
        parameters: {length: 2, baseRadius: 0.1, tipRadius: 0.03, bend: 0.75, curl: 0.05, twist: 0},
        attachment: 'along the trunk',
    },
    {
        id: 'branch-droop',
        name: 'Drooping branch',
        category: 'branches',
        description: 'Reaches out and then falls away.',
        generatorId: 'branch',
        type: 'branch',
        parameters: {length: 2.2, baseRadius: 0.1, tipRadius: 0.028, bend: -0.15, curl: 0, twist: 0},
        attachment: 'along the trunk',
    },
    {
        id: 'branch-thick',
        name: 'Heavy branch',
        category: 'branches',
        description: 'Thick and strong, like an old tree limb.',
        generatorId: 'branch',
        type: 'branch',
        parameters: {length: 2.4, baseRadius: 0.2, tipRadius: 0.06, bend: 0.4, curl: 0, twist: 0},
        attachment: 'along the trunk',
    },
    {
        id: 'branch-twig',
        name: 'Twig',
        category: 'branches',
        description: 'Thin and light, for filling the edges.',
        generatorId: 'branch',
        type: 'branch',
        parameters: {length: 1.1, baseRadius: 0.035, tipRadius: 0.01, bend: 0.5, curl: 0.2, twist: 0},
        attachment: 'on a branch',
    },

    // --- Roots ----------------------------------------------------------
    {
        id: 'root-spread',
        name: 'Spreading root',
        category: 'roots',
        description: 'Reaches out along the ground.',
        generatorId: 'root',
        type: 'root',
        parameters: {length: 1.3, baseRadius: 0.12, tipRadius: 0.02, drop: 0.3, curl: 0.1},
        attachment: 'at the base',
    },
    {
        id: 'root-deep',
        name: 'Deep root',
        category: 'roots',
        description: 'Dives down before it spreads.',
        generatorId: 'root',
        type: 'root',
        parameters: {length: 0.9, baseRadius: 0.1, tipRadius: 0.02, drop: 0.7, curl: 0.05},
        attachment: 'at the base',
    },

    // --- Foliage --------------------------------------------------------
    {
        id: 'leaf-round',
        name: 'Round leaves',
        category: 'foliage',
        description: 'Full and even, the classic shape.',
        generatorId: 'foliage-cluster',
        type: 'foliage-cluster',
        parameters: {shape: 'round', size: 0.7, roughness: 0.35},
        attachment: 'at a branch tip',
    },
    {
        id: 'leaf-flat',
        name: 'Flat leaves',
        category: 'foliage',
        description: 'Wide and low, good for spreading canopies.',
        generatorId: 'foliage-cluster',
        type: 'foliage-cluster',
        parameters: {shape: 'flat', size: 0.85, roughness: 0.3},
        attachment: 'at a branch tip',
    },
    {
        id: 'leaf-tall',
        name: 'Tall leaves',
        category: 'foliage',
        description: 'Narrow and upright.',
        generatorId: 'foliage-cluster',
        type: 'foliage-cluster',
        parameters: {shape: 'tall', size: 0.7, roughness: 0.35},
        attachment: 'at a branch tip',
    },
    {
        id: 'leaf-layered',
        name: 'Layered leaves',
        category: 'foliage',
        description: 'Banded, like a pine canopy.',
        generatorId: 'foliage-cluster',
        type: 'foliage-cluster',
        parameters: {shape: 'layered', size: 0.8, roughness: 0.5},
        attachment: 'at a branch tip',
    },
    {
        id: 'leaf-irregular',
        name: 'Rough leaves',
        category: 'foliage',
        description: 'Lumpy and uneven, for a wild look.',
        generatorId: 'foliage-cluster',
        type: 'foliage-cluster',
        parameters: {shape: 'irregular', size: 0.75, roughness: 0.8},
        attachment: 'at a branch tip',
    },

    // --- Fronds ---------------------------------------------------------
    {
        id: 'frond-arched',
        name: 'Arched frond',
        category: 'fronds',
        description: 'Curves up, then bows over at the tip.',
        generatorId: 'palm-frond',
        type: 'palm-frond',
        parameters: {length: 2.8, width: 0.32, leaflets: 16, arch: 'arched', archAmount: 0.55, twist: 0},
        attachment: 'on the crown',
    },
    {
        id: 'frond-drooping',
        name: 'Drooping frond',
        category: 'fronds',
        description: 'Hangs over and falls below where it started.',
        generatorId: 'palm-frond',
        type: 'palm-frond',
        parameters: {length: 2.6, width: 0.3, leaflets: 18, arch: 'drooping', archAmount: 0.6, twist: 0},
        attachment: 'on the crown',
    },
    {
        id: 'frond-upright',
        name: 'Upright frond',
        category: 'fronds',
        description: 'Reaches up and flattens out, like a young palm.',
        generatorId: 'palm-frond',
        type: 'palm-frond',
        parameters: {length: 2.2, width: 0.26, leaflets: 14, arch: 'upright', archAmount: 0.5, twist: 0},
        attachment: 'on the crown',
    },

    // --- Coconuts -------------------------------------------------------
    {
        id: 'coconuts-three',
        name: 'Three coconuts',
        category: 'coconuts',
        description: 'A small bunch hanging under the crown.',
        generatorId: 'coconut-cluster',
        type: 'coconut-cluster',
        parameters: {count: 3, size: 0.16, spread: 0.16},
        attachment: 'on the crown',
    },
    {
        id: 'coconuts-bunch',
        name: 'Heavy bunch',
        category: 'coconuts',
        description: 'A big cluster of ripe coconuts.',
        generatorId: 'coconut-cluster',
        type: 'coconut-cluster',
        parameters: {count: 6, size: 0.2, spread: 0.22},
        attachment: 'on the crown',
    },
]

export function findLibraryPart(id: string): LibraryPart | undefined {
    return LIBRARY_PARTS.find((part) => part.id === id)
}

export function libraryPartsInCategory(category: LibraryCategory): LibraryPart[] {
    return LIBRARY_PARTS.filter((part) => part.category === category)
}
