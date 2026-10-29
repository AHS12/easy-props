/**
 * The tree generator registry.
 *
 * Keeps the generator contract in one place so a new asset family plugs in
 * without touching the editor.
 */

import type {SceneComponent} from '../shared/component-types'
import type {TreeGenerator} from '../shared/generator-types'
import {createSeededRandom} from '../shared/random'
import type {StyleProfile} from '../style/style-profiles'
import {branchingTreeGenerator} from './branching-tree-generator'

export const treeGenerators: Readonly<Record<string, TreeGenerator>> = {
    [branchingTreeGenerator.id]: branchingTreeGenerator,
}

export function findTreeGenerator(id: string): TreeGenerator | undefined {
    return treeGenerators[id]
}

/**
 * Builds the component list for a tree.
 *
 * The result is style-independent: switching style changes the geometry, not
 * the structure of the tree.
 */
export function generateTreeComponents(
    generatorId: string,
    parameters: Readonly<Record<string, unknown>>,
    seed: number,
    style: StyleProfile,
): readonly SceneComponent[] {
    const generator = findTreeGenerator(generatorId)

    if (!generator) {
        return []
    }

    const validated = generator.validate(parameters)

    return generator.generate(validated.parameters, {
        random: createSeededRandom(seed),
        seed,
        style,
    })
}
