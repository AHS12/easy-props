/**
 * The prop generator registry.
 *
 * Keeps the generator contract in one place so a new asset family plugs in
 * without touching the editor.
 */

import type {SceneComponent} from './shared/component-types'
import type {PropGenerator} from './shared/generator-types'
import type {ParameterSpec} from './shared/parameters'
import {createSeededRandom} from './shared/random'
import type {StyleProfile} from './style/style-profiles'
import {bushGenerator} from './bushes/bush-generator'
import {cactusGenerator} from './cacti/cactus-generator'
import {cutRockGenerator} from './rocks/cut-rock-generator'
import {grassGenerator} from './grass/grass-generator'
import {plantGenerator} from './plants/plant-generator'
import {rockGenerator} from './rocks/rock-generator'
import {branchingTreeGenerator} from './trees/branching-tree-generator'
import {controlsForTree} from './trees/painted'
import {paintedTreeGenerator} from './trees/painted-tree-generator'
import {palmTreeGenerator} from './trees/palm-tree-generator'

export const propGenerators: Readonly<Record<string, PropGenerator>> = {
    [branchingTreeGenerator.id]: branchingTreeGenerator,
    [paintedTreeGenerator.id]: paintedTreeGenerator,
    [palmTreeGenerator.id]: palmTreeGenerator,
    [rockGenerator.id]: rockGenerator,
    [cutRockGenerator.id]: cutRockGenerator,
    [grassGenerator.id]: grassGenerator,
    [bushGenerator.id]: bushGenerator,
    [plantGenerator.id]: plantGenerator,
    [cactusGenerator.id]: cactusGenerator,
}

export function findPropGenerator(id: string): PropGenerator | undefined {
    return propGenerators[id]
}

/** The controls that do something on this prop, under the names they go by on it. */
export function shownControls(
    generatorId: string | undefined,
    specs: readonly ParameterSpec[],
    values: Readonly<Record<string, unknown>>,
): readonly ParameterSpec[] {
    const generator = generatorId ? findPropGenerator(generatorId) : undefined

    return generator?.shownControls?.(values) ?? controlsForTree(specs, values)
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
