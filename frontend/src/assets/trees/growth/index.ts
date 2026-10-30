/**
 * The growth module's public surface.
 *
 * Everything a caller needs to grow a tree and turn it into bark: the
 * parameters and their validation, the growth itself, the sweep, and the
 * handles. Nothing here touches the editor, so the whole module can be
 * generated, tested, and reused on its own.
 */

export {
    growthDefaults,
    growthParameterSpecs,
    validateGrowthParameters,
    type CrownShape,
    type GrowthParameters,
} from './parameters'

export {growSkeleton} from './colonization'

export {skeletonToBark, type BarkOptions} from './sweep'

export {limbHandles, type LimbHandle} from './handles'

export {assignOrders, applyPipeModel, type Skeleton, type SkeletonNode} from './skeleton'

export {sampleAttractors, type Vec3} from './envelope'
