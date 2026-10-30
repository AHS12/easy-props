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
