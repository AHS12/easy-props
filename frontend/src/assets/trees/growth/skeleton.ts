/**
 * The skeleton: the joints of a tree and the two things worked out from them.
 *
 * A skeleton is only positions and parent links. Orders and radii are derived
 * from that, which keeps the growth itself free of any bookkeeping about how
 * thick a limb will eventually be.
 */

import type {GrowthParameters} from './parameters'

export type SkeletonNode = {
    readonly id: number
    readonly parentId: number | null
    readonly position: readonly [number, number, number]
    readonly radius: number
    /** 1 for a twig tip, higher the closer the joint is to the trunk. */
    readonly order: number
    /** The unit tangent leaving the parent. */
    readonly direction: readonly [number, number, number]
}

export type Skeleton = {
    readonly nodes: readonly SkeletonNode[]
    readonly parameters: GrowthParameters
    readonly seed: number
}

/**
 * How much of the pipe identity a single edge is allowed to give up to
 * narrowing.
 *
 * The pipe model has no taper of its own: a limb with one child keeps its
 * radius for ever. A per-edge taper fixes that, at the price of the identity,
 * because a taper `t` leaves a parent holding only `t^n` of the cross-section
 * its children add up to. The value is therefore derived from this budget
 * rather than fixed, so the identity stays true to within this much at every
 * exponent the parameters allow. At the default exponent of 2.3 this gives a
 * per-edge taper of 0.987; a taper of 0.94, the narrowest a hand-set constant
 * would want to be, would put the identity 13% out.
 */
const PIPE_BUDGET = 0.03

/**
 * Gives every joint its branch order.
 *
 * This is Strahler numbering: a twig tip is order 1, a joint whose children
 * all differ takes the largest of them, and a joint whose children share the
 * same order takes one more. It is the count that reads as "size of limb":
 * the trunk comes out highest, the outermost twigs lowest.
 */
export function assignOrders(nodes: readonly SkeletonNode[]): readonly SkeletonNode[] {
    const orders = new Int32Array(nodes.length)
    const widest = new Int32Array(nodes.length)
    const mixed = new Uint8Array(nodes.length)

    // Children always come after their parent, so one walk from the tips back
    // to the root sees every child before it needs a parent.
    for (let index = nodes.length - 1; index >= 0; index--) {
        const childOrder = widest[index]

        orders[index] =
            mixed[index] === 1 || childOrder === 0 ? Math.max(childOrder, 1) : childOrder + 1

        const parentId = nodes[index].parentId

        if (parentId === null || parentId < 0 || parentId >= index) {
            continue
        }

        const order = orders[index]

        if (widest[parentId] === 0) {
            widest[parentId] = order
        } else if (widest[parentId] !== order) {
            mixed[parentId] = 1

            if (order > widest[parentId]) {
                widest[parentId] = order
            }
        }
    }

    return nodes.map((node, index) => ({...node, order: orders[index]}))
}

/**
 * Works out the radius of every joint from the twigs down.
 *
 * With a da Vinci exponent of n, a parent carries as much wood as all of its
 * children together: `r_parent^n = sum(r_child^n)`. That single rule is what
 * gives a real tree its shape, a trunk thick with everything above it and
 * twigs thin with nothing. Radii are computed in units of the twig and then
 * scaled, so the trunk can be pinned to the thickness the user asked for
 * rather than the thickness the crown happens to add up to.
 */
export function applyPipeModel(
    nodes: readonly SkeletonNode[],
    exponent: number,
    minTwigRadius: number,
    trunkRadius?: number,
): readonly SkeletonNode[] {
    if (nodes.length === 0) {
        return []
    }

    const power = Math.min(Math.max(Number.isFinite(exponent) ? exponent : 2, 1), 8)
    const taper = Math.pow(1 - PIPE_BUDGET, 1 / power)
    const floor = Math.max(minTwigRadius, 1e-6)

    const units = new Float64Array(nodes.length)
    const sums = new Float64Array(nodes.length)
    const widestChild = new Float64Array(nodes.length)

    for (let index = nodes.length - 1; index >= 0; index--) {
        let unit = 1

        if (sums[index] > 0) {
            unit = taper * Math.pow(sums[index], 1 / power)

            // A limb never gets thicker away from the root. The pipe model on
            // its own would let a joint with one child carry exactly what that
            // child carries, which leaves a trunk the same thickness all the
            // way up, so the joint is held to one taper above its thickest
            // child instead. Both rules give the same answer where the limb
            // forks, which is every joint the model has anything to say about.
            const aboveChild = widestChild[index] / taper

            if (unit < aboveChild) {
                unit = aboveChild
            }
        }

        units[index] = unit

        const parentId = nodes[index].parentId

        if (parentId === null || parentId < 0 || parentId >= index) {
            continue
        }

        sums[parentId] += Math.pow(unit, power)

        if (unit > widestChild[parentId]) {
            widestChild[parentId] = unit
        }
    }

    // The root is the thickest joint, so it sets the scale: with a trunk
    // radius the whole tree is scaled to meet it, and without one the twigs
    // are left at the thinnest a twig is allowed to be.
    const rootUnit = units[0]
    const scale =
        trunkRadius !== undefined && trunkRadius > 0 && rootUnit > 0
            ? trunkRadius / rootUnit
            : floor

    return nodes.map((node, index) => ({
        ...node,
        radius: Math.max(units[index] * scale, floor),
    }))
}

/** How many times pruning may sweep the tree, so no input can make it loop. */
const MAX_PRUNE_PASSES = 16

/** The joints of one tip-to-fork run, and how long the run is. */
interface TwigChain {
    readonly ids: readonly number[]
    readonly length: number
}

/**
 * Every tip's chain: the run from the tip up to the first joint that forks.
 *
 * A run measured this way is one shoot. Its `ids` never contain the fork, so
 * removing a chain can never orphan another: the fork stays and simply has one
 * child fewer.
 */
function twigChains(nodes: readonly SkeletonNode[], childCount: Int32Array): TwigChain[] {
    const chains: TwigChain[] = []

    for (const node of nodes) {
        if (childCount[node.id] > 0) {
            continue
        }

        const ids = [node.id]
        let length = 0
        let current = node

        while (true) {
            const parentId = current.parentId

            // The root is the tree: a chain always stops below it.
            if (parentId === null || parentId < 0 || parentId >= nodes.length) {
                break
            }

            const parent = nodes[parentId]

            length += Math.hypot(
                current.position[0] - parent.position[0],
                current.position[1] - parent.position[1],
                current.position[2] - parent.position[2],
            )

            if (childCount[parentId] !== 1) {
                break
            }

            ids.push(parentId)
            current = parent
        }

        chains.push({ids, length})
    }

    return chains
}

/**
 * Removes the doomed joints and renumbers what is left.
 *
 * Survivors keep their relative order, which is parent before child, so the
 * new ids come out contiguous from 0 and every link still points backwards.
 */
function compact(nodes: readonly SkeletonNode[], doomed: ReadonlySet<number>): SkeletonNode[] {
    const kept = nodes.filter((node) => !doomed.has(node.id))
    const renumbered = new Int32Array(nodes.length).fill(-1)

    for (let index = 0; index < kept.length; index++) {
        renumbered[kept[index].id] = index
    }

    return kept.map((node, index) => ({
        ...node,
        id: index,
        parentId: node.parentId === null ? null : renumbered[node.parentId],
    }))
}

/** A grid of joints keyed by the cell of a given size. */
interface JointGrid {
    /** The joint ids within `clearance` of a point, in no particular order. */
    near(x: number, y: number, z: number): readonly number[]
}

/**
 * Buckets the joints into cubes of `clearance`.
 *
 * A twig only has to know what is near it, so the tree is bucketed once and
 * each twig looks at the few cells its own cube reaches into instead of at
 * every joint in the tree.
 */
function bucketJoints(nodes: readonly SkeletonNode[], clearance: number): JointGrid {
    const cells = new Map<string, number[]>()
    const inverse = 1 / clearance
    const cellOf = (x: number, y: number, z: number): string =>
        `${Math.floor(x * inverse)},${Math.floor(y * inverse)},${Math.floor(z * inverse)}`

    for (const node of nodes) {
        const key = cellOf(node.position[0], node.position[1], node.position[2])
        const bucket = cells.get(key)

        if (bucket) {
            bucket.push(node.id)
        } else {
            cells.set(key, [node.id])
        }
    }

    return {
        near(x, y, z) {
            const found: number[] = []
            const startX = Math.floor((x - clearance) * inverse)
            const endX = Math.floor((x + clearance) * inverse)
            const startY = Math.floor((y - clearance) * inverse)
            const endY = Math.floor((y + clearance) * inverse)
            const startZ = Math.floor((z - clearance) * inverse)
            const endZ = Math.floor((z + clearance) * inverse)

            for (let cellX = startX; cellX <= endX; cellX++) {
                for (let cellY = startY; cellY <= endY; cellY++) {
                    for (let cellZ = startZ; cellZ <= endZ; cellZ++) {
                        const bucket = cells.get(`${cellX},${cellY},${cellZ}`)

                        if (bucket) {
                            for (const id of bucket) {
                                found.push(id)
                            }
                        }
                    }
                }
            }

            return found
        },
    }
}

/**
 * The chains that are dead wood in one pass.
 *
 * A shoot earns its place by carrying leaves, and a leaf needs two things: a
 * shoot at least `minTwigLength` long to sit on, and that shoot in the open
 * rather than pushed into wood that is already there. So a chain dies when it
 * is too short, or when it ends within a leaf's length of a joint that is not
 * its own — which is a twig that grew into the inside of another limb and can
 * neither hold a leaf nor show one.
 *
 * Chains are judged longest first, so of two twigs growing into each other the
 * longer one survives and the shorter dies; that keeps the crown from being
 * thinned in pairs or thinned twice where the skeleton is already dense.
 */
function deadTwigsIn(
    nodes: readonly SkeletonNode[],
    chains: readonly TwigChain[],
    limit: number,
): Set<number> {
    const grid = bucketJoints(nodes, limit)
    const doomed = new Set<number>()
    const settled = new Set<number>()

    // Which chain a joint belongs to, so a joint met in the grid can be
    // recognised as part of a twig rather than as wood.
    const owner = new Int32Array(nodes.length).fill(-1)

    for (const chain of chains) {
        for (const id of chain.ids) {
            owner[id] = chain.ids[0]
        }
    }

    const order = [...chains].sort((a, b) => b.length - a.length || a.ids[0] - b.ids[0])

    for (const chain of order) {
        const tipId = chain.ids[0]

        // The root is never a twig: a tree with a two-centimetre base is not a
        // tree that needs trimming.
        if (chain.ids.includes(0)) {
            continue
        }

        if (chain.length < limit) {
            for (const id of chain.ids) {
                doomed.add(id)
            }

            continue
        }

        const tip = nodes[tipId]
        const own = new Set(chain.ids)
        let crowded = false

        for (const other of grid.near(tip.position[0], tip.position[1], tip.position[2])) {
            if (own.has(other)) {
                continue
            }

            const twig = owner[other]

            // Another twig that has not been judged yet is the shorter half of
            // a pair, so this chain keeps its place and that one will go.
            if (twig >= 0 && !settled.has(twig)) {
                continue
            }

            const joint = nodes[other]

            if (
                Math.hypot(
                    joint.position[0] - tip.position[0],
                    joint.position[1] - tip.position[1],
                    joint.position[2] - tip.position[2],
                ) < limit
            ) {
                crowded = true
                break
            }
        }

        if (crowded) {
            for (const id of chain.ids) {
                doomed.add(id)
            }
        } else {
            settled.add(tipId)
        }
    }

    return doomed
}

/**
 * Cuts away the twigs that lead nowhere.
 *
 * Growth leaves a fringe of stubs: a joint whose side offset cancelled most of
 * its step, or a spur that grew one step into a crown that was already full.
 * Drawn, they make the crown fuzzy and cost triangles that buy no shape.
 *
 * Only tips are considered, and a chain is measured to its first fork, so
 * removing one can never orphan another: the fork stays and has one child
 * fewer. Pruning is repeated because cutting a chain turns its fork into a tip,
 * which may now be too short itself. Every pass renumbers as it goes, so a
 * joint's id is always its index in the list it was found in.
 */
export function pruneDeadTwigs(
    nodes: readonly SkeletonNode[],
    minTwigLength: number,
): readonly SkeletonNode[] {
    const limit = Number.isFinite(minTwigLength) ? Math.max(minTwigLength, 0) : 0

    // The joints arrive numbered from 0 by the growth, which is the invariant
    // the walk below relies on.
    let kept: readonly SkeletonNode[] = nodes
    let pruned = false

    for (let pass = 0; pass < MAX_PRUNE_PASSES && limit > 0; pass++) {
        const childCount = new Int32Array(kept.length)

        for (const node of kept) {
            const parentId = node.parentId

            if (parentId !== null && parentId >= 0 && parentId < kept.length) {
                childCount[parentId]++
            }
        }

        const doomed = deadTwigsIn(kept, twigChains(kept, childCount), limit)

        if (doomed.size === 0) {
            break
        }

        kept = compact(kept, doomed)
        pruned = true
    }

    return pruned ? kept : nodes
}
