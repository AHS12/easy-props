import {describe, expect, it} from 'vitest'
import {growSkeleton} from './colonization'
import {growthDefaults} from './parameters'
import {skeletonToBark} from './sweep'
import type {Skeleton} from './skeleton'

const SEED = 20240521

function childrenOf(skeleton: Skeleton): Map<number, number[]> {
    const children = new Map<number, number[]>()

    for (const node of skeleton.nodes) {
        if (node.parentId === null) {
            continue
        }

        const list = children.get(node.parentId) ?? []

        list.push(node.id)
        children.set(node.parentId, list)
    }

    return children
}

/** FNV-1a over the raw bytes of a geometry's positions. */
function hashGeometry(skeleton: Skeleton): number {
    const position = skeletonToBark(skeleton).getAttribute('position')
    const words = new Uint32Array(
        position.array.buffer,
        position.array.byteOffset,
        position.array.length,
    )

    let hash = 0x811c9dc5

    for (const word of words) {
        hash = Math.imul(hash ^ word, 0x01000193) >>> 0
    }

    return hash
}

describe('growth', () => {
    it('produces the same tree for the same seed and another for a different one', () => {
        const first = growSkeleton(growthDefaults, SEED)
        const again = growSkeleton(growthDefaults, SEED)
        const other = growSkeleton(growthDefaults, SEED + 1)

        expect(first.nodes.length).toBe(again.nodes.length)
        expect(first.nodes).toEqual(again.nodes)
        expect(hashGeometry(first)).toBe(hashGeometry(again))

        // Both the skeleton and the bark it sweeps into must move with the
        // seed: a change in the growth that never reaches the mesh would be a
        // change nobody can see.
        expect(other.nodes).not.toEqual(first.nodes)
        expect(hashGeometry(other)).not.toBe(hashGeometry(first))
    })

    it('grows a tree to the size it was given', () => {
        const skeleton = growSkeleton(growthDefaults, SEED)
        const crownRadius = growthDefaults.crownWidth / 2

        const reach = Math.max(
            ...skeleton.nodes.map((node) => Math.hypot(node.position[0], node.position[2])),
        )
        const top = Math.max(...skeleton.nodes.map((node) => node.position[1]))

        expect(reach).toBeGreaterThan(0)
        expect(Math.abs(reach - crownRadius) / crownRadius).toBeLessThan(0.15)
        expect(Math.abs(top - growthDefaults.height) / growthDefaults.height).toBeLessThan(0.15)

        // The trunk starts on the ground, climbs to where the crown begins and
        // is the only chain that runs below it: growth starts at its top.
        const children = childrenOf(skeleton)
        const crownBase = growthDefaults.crownBaseFraction * growthDefaults.height

        expect(skeleton.nodes[0].position[1]).toBeCloseTo(0, 9)
        expect(skeleton.nodes[0].parentId).toBeNull()

        let trunkTop = 0
        let trunkJoints = 0

        while (true) {
            const kids = children.get(trunkTop) ?? []

            if (kids.length !== 1) {
                break
            }

            trunkTop = kids[0]
            trunkJoints++

            expect(skeleton.nodes[trunkTop].position[1]).toBeGreaterThan(
                skeleton.nodes[skeleton.nodes[trunkTop].parentId!].position[1] - 1e-9,
            )
        }

        expect(trunkJoints).toBeGreaterThan(5)
        expect(skeleton.nodes[trunkTop].position[1]).toBeCloseTo(crownBase, 9)

        const grown = skeleton.nodes.filter((node) => node.id > trunkTop)

        expect(Math.min(...grown.map((node) => node.position[1]))).toBeGreaterThan(
            crownBase - growthDefaults.stepLength * 2,
        )
    })

    it('keeps the skeleton a tree: one root, parents before children', () => {
        const skeleton = growSkeleton(growthDefaults, SEED)
        const nodes = skeleton.nodes
        const roots = nodes.filter((node) => node.parentId === null)

        expect(roots).toHaveLength(1)
        expect(roots[0].id).toBe(0)

        for (let index = 0; index < nodes.length; index++) {
            expect(nodes[index].id).toBe(index)
            expect(Number.isFinite(nodes[index].position[0])).toBe(true)
            expect(Number.isFinite(nodes[index].radius)).toBe(true)
            expect(nodes[index].radius).toBeGreaterThan(0)

            const parentId = nodes[index].parentId

            if (parentId !== null) {
                expect(parentId).toBeLessThan(index)
            }

            const [dx, dy, dz] = nodes[index].direction

            expect(Math.hypot(dx, dy, dz)).toBeCloseTo(1, 9)
        }

        expect(skeleton.seed).toBe(SEED)
        expect(skeleton.parameters).toBe(growthDefaults)
    })

    it('stops at the joint budget it was given', () => {
        const skeleton = growSkeleton({...growthDefaults, maxNodes: 400}, SEED)

        expect(skeleton.nodes.length).toBeLessThanOrEqual(400)
        expect(skeleton.nodes.length).toBeGreaterThan(50)
    })

    it('is deterministic whatever the seed, and never produces a NaN', () => {
        for (const seed of [0, 1, 99, 4294967295]) {
            const skeleton = growSkeleton(growthDefaults, seed)

            for (const node of skeleton.nodes) {
                for (const value of [...node.position, ...node.direction, node.radius]) {
                    expect(Number.isFinite(value), `seed ${seed}`).toBe(true)
                }
            }

            expect(hashGeometry(skeleton)).toBe(hashGeometry(growSkeleton(growthDefaults, seed)))
        }
    })

    it('stays inside the drawing budget and grows quickly', () => {
        // The real target is a few tens of milliseconds on a developer machine
        // (about 15 ms for the defaults); the bound below is deliberately loose
        // so a slow or busy machine does not fail the suite.
        const budget = 1500

        const started = performance.now()
        const skeleton = growSkeleton(growthDefaults, SEED)
        const elapsed = performance.now() - started

        const bark = skeletonToBark(skeleton)
        const index = bark.getIndex()

        expect(index).not.toBeNull()

        const triangles = index!.count / 3
        const tips = skeleton.nodes.filter((node) => !childrenOf(skeleton).has(node.id)).length

        expect(elapsed).toBeLessThan(budget)
        expect(skeleton.nodes.length).toBeLessThan(growthDefaults.maxNodes)
        expect(triangles).toBeLessThan(60000)

        // One ring per joint plus a fan on each tip and on the base.
        expect(triangles).toBe(2 * 8 * (skeleton.nodes.length - 1) + 8 * (tips + 1))
        expect(tips).toBeGreaterThan(100)
    })
})
