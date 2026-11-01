/**
 * The prop generator registry.
 *
 * Keeps the generator contract in one place so a new asset family plugs in
 * without touching the editor.
 */

import type {SceneComponent} from './shared/component-types'
import type {PropGenerator} from './shared/generator-types'
import {createSeededRandom} from './shared/random'
import type {StyleProfile} from './style/style-profiles'
import {cutRockGenerator} from './rocks/cut-rock-generator'
import {grassGenerator} from './grass/grass-generator'
import {rockGenerator} from './rocks/rock-generator'
import {branchingTreeGenerator} from './trees/branching-tree-generator'
import {paintedTreeGenerator} from './trees/painted-tree-generator'
import {palmTreeGenerator} from './trees/palm-tree-generator'

export const propGenerators: Readonly<Record<string, PropGenerator>> = {
    [branchingTreeGenerator.id]: branchingTreeGenerator,
    [paintedTreeGenerator.id]: paintedTreeGenerator,
    [palmTreeGenerator.id]: palmTreeGenerator,
    [rockGenerator.id]: rockGenerator,
    [cutRockGenerator.id]: cutRockGenerator,
    [grassGenerator.id]: grassGenerator,
}

export function findPropGenerator(id: string): PropGenerator | undefined {
    return propGenerators[id]
}

/**
 * Builds the component list for a prop.
 *
 * The result is style-independent: switching style changes the geometry, not
 * the structure of the prop.
 */
export function generatePropComponents(
    generatorId: string,
    parameters: Readonly<Record<string, unknown>>,
    seed: number,
    style: StyleProfile,
): readonly SceneComponent[] {
    const generator = findPropGenerator(generatorId)

    if (!generator) {
        return []
    }

    const validated = generator.validate(parameters)

    const generated = generator.generate(validated.parameters, {
        random: createSeededRandom(seed),
        seed,
        style,
    })

    // A generated part starts unedited. The scene marks it edited the first
    // time the user changes it.
    return generated.map((component) => ({...component, edited: false}))
}
