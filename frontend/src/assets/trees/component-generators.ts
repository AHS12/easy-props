/**
 * The registry of component generators.
 *
 * The viewport looks a generator up by id, so adding a new kind of part
 * means adding an entry here and nothing else.
 */

import type {PartGenerator} from '../shared/generator-types'
import {branchGenerator} from './components/branch'
import {coconutClusterGenerator} from './components/coconut-cluster'
import {foliageGenerator} from './components/foliage-cluster'
import {paintedBarkGenerator, paintedClumpGenerator} from './components/painted-parts'
import {palmCrownGenerator} from './components/palm-crown'
import {palmFrondGenerator} from './components/palm-frond'
import {palmTrunkGenerator} from './components/palm-trunk'
import {rootGenerator} from './components/root'
import {trunkGenerator} from './components/trunk'

export const componentGenerators: Readonly<Record<string, PartGenerator>> = {
    [branchGenerator.id]: branchGenerator,
    [coconutClusterGenerator.id]: coconutClusterGenerator,
    [foliageGenerator.id]: foliageGenerator,
    [paintedBarkGenerator.id]: paintedBarkGenerator,
    [paintedClumpGenerator.id]: paintedClumpGenerator,
    [palmCrownGenerator.id]: palmCrownGenerator,
    [palmFrondGenerator.id]: palmFrondGenerator,
    [palmTrunkGenerator.id]: palmTrunkGenerator,
    [rootGenerator.id]: rootGenerator,
    [trunkGenerator.id]: trunkGenerator,
}

export function findComponentGenerator(id: string): PartGenerator | undefined {
    return componentGenerators[id]
}
