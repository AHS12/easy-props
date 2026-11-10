/**
 * The registry of component generators.
 *
 * The viewport looks a generator up by id, so adding a new kind of part
 * means adding an entry here and nothing else.
 */

import type {PartGenerator} from './shared/generator-types'
import {bushCoreGenerator, bushLeavesGenerator} from './bushes/bush-generator'
import {cactusBodyGenerator} from './cacti/cactus-generator'
import {cutRockBodyGenerator} from './rocks/cut-rock-generator'
import {grassBodyGenerator} from './grass/grass-generator'
import {plantBodyGenerator} from './plants/plant-generator'
import {rockBodyGenerator} from './rocks/rock-generator'
import {branchGenerator} from './trees/components/branch'
import {coconutClusterGenerator} from './trees/components/coconut-cluster'
import {foliageGenerator} from './trees/components/foliage-cluster'
import {paintedBarkGenerator, paintedClumpGenerator, paintedLimbGenerator} from './trees/components/painted-parts'
import {palmCrownGenerator} from './trees/components/palm-crown'
import {palmFrondGenerator} from './trees/components/palm-frond'
import {palmTrunkGenerator} from './trees/components/palm-trunk'
import {rootGenerator} from './trees/components/root'
import {trunkGenerator} from './trees/components/trunk'
import {
    branchEndsGenerator,
    branchWoodGenerator,
    litterLeavesGenerator,
    logEndsGenerator,
    logWoodGenerator,
    stumpEndsGenerator,
    stumpWoodGenerator,
} from './trees/pieces/piece-generators'

export const componentGenerators: Readonly<Record<string, PartGenerator>> = {
    [branchGenerator.id]: branchGenerator,
    [coconutClusterGenerator.id]: coconutClusterGenerator,
    [foliageGenerator.id]: foliageGenerator,
    [paintedBarkGenerator.id]: paintedBarkGenerator,
    [paintedClumpGenerator.id]: paintedClumpGenerator,
    [paintedLimbGenerator.id]: paintedLimbGenerator,
    [palmCrownGenerator.id]: palmCrownGenerator,
    [palmFrondGenerator.id]: palmFrondGenerator,
    [palmTrunkGenerator.id]: palmTrunkGenerator,
    [rockBodyGenerator.id]: rockBodyGenerator,
    [cutRockBodyGenerator.id]: cutRockBodyGenerator,
    [grassBodyGenerator.id]: grassBodyGenerator,
    [bushCoreGenerator.id]: bushCoreGenerator,
    [bushLeavesGenerator.id]: bushLeavesGenerator,
    [plantBodyGenerator.id]: plantBodyGenerator,
    [cactusBodyGenerator.id]: cactusBodyGenerator,
    [rootGenerator.id]: rootGenerator,
    [trunkGenerator.id]: trunkGenerator,
    [stumpWoodGenerator.id]: stumpWoodGenerator,
    [logWoodGenerator.id]: logWoodGenerator,
    [branchWoodGenerator.id]: branchWoodGenerator,
    [stumpEndsGenerator.id]: stumpEndsGenerator,
    [logEndsGenerator.id]: logEndsGenerator,
    [branchEndsGenerator.id]: branchEndsGenerator,
    [litterLeavesGenerator.id]: litterLeavesGenerator,
}

export function findComponentGenerator(id: string): PartGenerator | undefined {
    return componentGenerators[id]
}
