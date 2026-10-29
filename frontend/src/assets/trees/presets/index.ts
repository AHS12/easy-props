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
]

export function findPreset(id: string): TreePreset | undefined {
    return treePresets.find((preset) => preset.id === id)
}
