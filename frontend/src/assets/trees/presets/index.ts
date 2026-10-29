/**
 * Ready-made trees.
 *
 * A preset is a parameter set and a seed. Nothing more, so a preset stays
 * editable: picking one fills the tree's parameters, and every control
 * remains the user's to change afterwards.
 */

export interface TreePreset {
    readonly id: string
    readonly name: string
    readonly sub: string
    readonly generatorId: string
    readonly parameters: Readonly<Record<string, number | string>>
    readonly seed: number
}

export const treePresets: readonly TreePreset[] = [
    {
        id: 'round-canopy',
        name: 'Round canopy',
        sub: 'Classic starter',
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
]

export function findPreset(id: string): TreePreset | undefined {
    return treePresets.find((preset) => preset.id === id)
}
