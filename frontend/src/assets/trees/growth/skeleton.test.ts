import {describe, expect, it} from 'vitest'
import {growSkeleton} from './colonization'
import {growthDefaults} from './parameters'
import {applyPipeModel, assignOrders, type SkeletonNode} from './skeleton'

const SEED = 20240521

function node(
    id: number,
    parentId: number | null,
    position: readonly [number, number, number],
): SkeletonNode {
    return {id, parentId, position, radius: 0, order: 0, direction: [0, 1, 0]}
}

function childrenOf(nodes: readonly SkeletonNode[]): Map<number, number[]> {
    const children = new Map<number, number[]>()

    for (const child of nodes) {
        if (child.parentId === null) {
            continue
        }

        const list = children.get(child.parentId) ?? []

        list.push(child.id)
        children.set(child.parentId, list)
    }

    return children
}

/**
 * The pipe identity at every internal joint.
 *
 * A joint holding the `minTwigRadius` clamp has been pushed off the identity
 * by the clamp rather than by the model, so those joints are counted and
 * excluded, and the count is what the caller checks against.
 */
function pipeErrors(nodes: readonly SkeletonNode[], exponent: number, minTwigRadius: number) {
    const children = childrenOf(nodes)
    let worst = 0
    let worstId = -1
    let clamped = 0
    let internal = 0

    for (const joint of nodes) {
        const kids = children.get(joint.id) ?? []

        if (kids.length === 0) {
            continue
        }

        if (joint.radius <= minTwigRadius * (1 + 1e-9)) {
            clamped++

            continue
        }

        internal++

        const sum = kids.reduce((total, id) => total + Math.pow(nodes[id].radius, exponent), 0)
        const error = Math.abs(Math.pow(joint.radius, exponent) - sum) / Math.pow(joint.radius, exponent)

        if (error > worst) {
            worst = error
            worstId = joint.id
        }
    }

    return {worst, worstId, clamped, internal}
}

describe('skeleton analysis', () => {
    it('numbers a tip 1, a chain up from 1, and a fork from its largest child', () => {
        //            0
        //          /   \
        //         1     2
        //        / \     \
        //       3   4     5
        //      / \
        //     6   7
        const nodes = [
            node(0, null, [0, 0, 0]),
            node(1, 0, [1, 0, 0]),
            node(2, 0, [-1, 0, 0]),
            node(3, 1, [2, 0, 0]),
            node(4, 1, [2, 0, 1]),
            node(5, 2, [-2, 0, 0]),
            node(6, 3, [3, 0, 0]),
            node(7, 3, [3, 0, 1]),
        ]

        const ordered = assignOrders(nodes)
        const order = (id: number) => ordered[id].order

        // Tips are order 1.
        expect([4, 5, 6, 7].map(order)).toEqual([1, 1, 1, 1])

        // Two children of equal order make a bigger limb: 3 and 1 are both 2.
        expect(order(3)).toBe(2)
        expect(order(1)).toBe(2)

        // A single child carries the parent up one step.
        expect(order(2)).toBe(2)

        // Children of different order — 1 is 2, 2 is 2 — are equal, so the
        // root is 3. A fork of unequal children would take the larger.
        expect(order(0)).toBe(3)

        const unequal = assignOrders([
            node(0, null, [0, 0, 0]),
            node(1, 0, [1, 0, 0]),
            node(2, 0, [-1, 0, 0]),
            node(3, 1, [2, 0, 0]),
            node(4, 3, [3, 0, 0]),
            node(5, 4, [4, 0, 0]),
        ])

        expect(unequal[0].order).toBe(4)
        expect(unequal[1].order).toBe(4)
    })

    it('leaves the nodes it was given alone', () => {
        const nodes = [node(0, null, [0, 0, 0]), node(1, 0, [0, 1, 0])]

        assignOrders(nodes)

        expect(nodes[0].order).toBe(0)
        expect(nodes[1].order).toBe(0)
    })

    it('gives a parent the wood of all its children', () => {
        // A trunk with two equal limbs, each forking into two twigs.
        const nodes = [
            node(0, null, [0, 0, 0]),
            node(1, 0, [0, 1, 0]),
            node(2, 0, [1, 0, 0]),
            node(3, 1, [0, 2, 0]),
            node(4, 1, [-1, 1, 0]),
            node(5, 3, [0, 3, 0]),
            node(6, 3, [1, 2, 0]),
        ]
        const radius = 2.3
        const minTwigRadius = 0.008
        const modelled = applyPipeModel(nodes, radius, minTwigRadius, growthDefaults.trunkRadius)
        const errors = pipeErrors(modelled, radius, minTwigRadius)

        expect(errors.internal).toBeGreaterThan(0)
        expect(errors.worst).toBeLessThan(0.05)
        expect(modelled[0].radius).toBeCloseTo(growthDefaults.trunkRadius, 9)

        // Every tip is the same thickness: they carry the same load.
        expect(modelled[5].radius).toBeCloseTo(modelled[6].radius, 12)
        expect(modelled[5].radius).toBeGreaterThanOrEqual(minTwigRadius)
        expect(modelled[0].radius).toBeGreaterThan(modelled[1].radius)
    })

    it('counts and reports the joints the twig clamp has taken over', () => {
        const nodes = [node(0, null, [0, 0, 0]), node(1, 0, [0, 1, 0]), node(2, 1, [0, 2, 0])]
        const modelled = applyPipeModel(nodes, 2.3, 0.05, 0.01)
        const errors = pipeErrors(modelled, 2.3, 0.05)

        // A trunk thinner than the twigs it must carry is impossible, so every
        // joint ends up on the clamp.
        expect(modelled.every((joint) => joint.radius >= 0.05)).toBe(true)
        expect(errors.clamped).toBeGreaterThan(0)
        expect(errors.worst).toBe(0)
    })

    it('holds the pipe identity along a grown tree', () => {
        const skeleton = growSkeleton(growthDefaults, SEED)
        const errors = pipeErrors(
            skeleton.nodes,
            growthDefaults.pipeExponent,
            growthDefaults.minTwigRadius,
        )

        expect(errors.internal).toBeGreaterThan(100)
        expect(errors.worst).toBeLessThan(0.05)
        expect(errors.clamped).toBeGreaterThanOrEqual(0)
    })

    it('gets thinner away from the root on every chain', () => {
        const skeleton = growSkeleton(growthDefaults, SEED)
        const nodes = skeleton.nodes
        const children = childrenOf(nodes)

        let chains = 0
        let thinnest = Number.POSITIVE_INFINITY
        let thickest = 0

        for (const joint of nodes) {
            expect(joint.radius).toBeGreaterThan(0)
            thinnest = Math.min(thinnest, joint.radius)
            thickest = Math.max(thickest, joint.radius)

            if (joint.parentId === null) {
                continue
            }

            // Along a chain the radius can only stay the same or fall.
            expect(joint.radius, `joint ${joint.id}`).toBeLessThanOrEqual(
                nodes[joint.parentId].radius + 1e-12,
            )
        }

        // Walk each root-to-tip chain end to end as well, which is the same
        // rule read the other way round.
        const walk = (id: number, previous: number, depth: number): void => {
            const radius = nodes[id].radius

            expect(radius).toBeLessThanOrEqual(previous + 1e-12)

            const kids = children.get(id) ?? []

            if (kids.length === 0) {
                chains++
                expect(depth).toBeGreaterThan(0)

                return
            }

            for (const kid of kids) {
                walk(kid, radius, depth + 1)
            }
        }

        walk(0, Number.POSITIVE_INFINITY, 0)

        expect(chains).toBeGreaterThan(100)
        expect(thickest).toBeGreaterThan(thinnest * 2)
    })

    it('thickens the trunk to the thickness that was asked for', () => {
        for (const trunkRadius of [0.12, 0.28, 0.55]) {
            const skeleton = growSkeleton({...growthDefaults, trunkRadius}, SEED)

            expect(skeleton.nodes[0].parentId).toBeNull()
            expect(skeleton.nodes[0].radius).toBeCloseTo(trunkRadius, 6)
        }
    })
})
