/**
 * The registry of component generators.
 *
 * The viewport looks a generator up by id, so adding a new kind of part
 * means adding an entry here and nothing else.
 */

import type {PartGenerator} from '../shared/generator-types'
import {branchGenerator} from './components/branch'
import {foliageGenerator} from './components/foliage-cluster'
import {rootGenerator} from './components/root'
import {trunkGenerator} from './components/trunk'

export const componentGenerators: Readonly<Record<string, PartGenerator>> = {
    [branchGenerator.id]: branchGenerator,
    [foliageGenerator.id]: foliageGenerator,
    [rootGenerator.id]: rootGenerator,
    [trunkGenerator.id]: trunkGenerator,
}

export function findComponentGenerator(id: string): PartGenerator | undefined {
    return componentGenerators[id]
}
