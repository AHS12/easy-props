import {describe, expect, it} from 'vitest'
import * as THREE from 'three'
import {RIGID_ATTRIBUTE} from '../assets/shared/generator-types'
import {controlsForTree, FRUIT_KINDS, paintedTreeParameterSpecs, planPaintedTree, validatePaintedTreeParameters, type FruitKind, type PaintedTreeParameters} from '../assets/trees/painted'
import {buildClump, clumpWithFruitSpots} from '../assets/trees/painted/clump-mesh'
import {planHangingFruit} from '../assets/trees/painted/fruit-mesh'
import {createSceneFromPreset} from '../core/scene/initial-scene'

type Point = [number, number, number]

const FRUIT_TREES = ['apple', 'orange', 'lemon', 'plum', 'christmas', 'pear', 'cherry', 'fig', 'pomegranate', 'pine-cones']
const KINDS = Object.keys(FRUIT_KINDS) as FruitKind[]

const treeOf = (presetId: string, change: Partial<PaintedTreeParameters> = {}) => {
    const asset = createSceneFromPreset(presetId).assets[0]

    return {tree: validatePaintedTreeParameters({...asset.parameters, ...change}).parameters, seed: asset.seed}
}

/** An apple's size on this tree: fruit is placed by it, whatever the kind. */
const appleSize = (tree: PaintedTreeParameters) => (0.06 + tree.height * 0.008) * tree.fruitSize

const pointAt = (array: ArrayLike<number>, index: number): Point => [array[index * 3], array[index * 3 + 1], array[index * 3 + 2]]
const distance = (a: Readonly<Point>, b: Readonly<Point>) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const sub = (a: Readonly<Point>, b: Readonly<Point>): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** A leaf card's middle and the half of each side, from its four corners. */
type Card = {middle: Point; across: Point; along: Point}

/**
 * How far a point is from the leafy middle of a card. The picture fades out
 * towards the corners, so only the middle half of each side counts.
 */
function distanceToCard(point: Readonly<Point>, {middle, across, along}: Card): number {
    const offset = sub(point, middle)
    const s = Math.max(-0.5, Math.min(0.5, dot(offset, across) / dot(across, across)))
    const t = Math.max(-0.5, Math.min(0.5, dot(offset, along) / dot(along, along)))

    return distance(point, [0, 1, 2].map((axis) => middle[axis] + across[axis] * s + along[axis] * t) as Point)
}

function cardsOf(geometry: THREE.BufferGeometry, leafCount: number): Card[] {
    const position = geometry.getAttribute('position').array
    const cards: Card[] = []

    for (let first = 0; first + 4 <= leafCount; first += 4) {
        const corners = [0, 1, 2, 3].map((corner) => pointAt(position, first + corner))
        const half = (a: Point, b: Point) => sub(b, a).map((value) => value / 2) as Point

        cards.push({
            middle: [0, 1, 2].map((axis) => corners.reduce((sum, corner) => sum + corner[axis], 0) / 4) as Point,
            across: half(corners[0], corners[1]),
            along: half(corners[0], corners[3]),
        })
    }

    return cards
}

/** Every point that sways whole with the fruit: stalks, bodies and stalk leaves. */
function fruitPoints(geometry: THREE.BufferGeometry): Point[] {
    const position = geometry.getAttribute('position').array
    const rigid = geometry.getAttribute(RIGID_ATTRIBUTE)?.array ?? []

    return Array.from(rigid.entries())
        .filter(([, mark]) => mark === 1)
        .map(([index]) => pointAt(position, index))
}

describe('fruit on a painted tree', () => {
    it('hangs on a stalk from inside the leaves', () => {
        for (const id of FRUIT_TREES) {
            const {tree, seed} = treeOf(id)

            for (const shift of [0, 1, 2]) {
                const plan = planPaintedTree(tree, seed + shift)

                for (const clump of plan.clumps) {
                    const {geometry, leafCount, spots} = clumpWithFruitSpots(plan, clump, tree, 1, 1, null)
                    const cards = cardsOf(geometry, leafCount)
                    const hangs = planHangingFruit(spots, clump, tree)

                    expect(hangs.length, `${id} clump ${clump.key}`).toBe(tree.fruitCount)

                    for (const {attach} of hangs) {
                        const nearest = Math.min(...cards.map((card) => distanceToCard(attach, card)))

                        expect(nearest, `${id} seed ${seed + shift} clump ${clump.key}`).toBeLessThanOrEqual(appleSize(tree))
                    }
                }
            }
        }
    })

    it('hangs lower on a longer stalk as Hanging rises, from the same place in the leaves', () => {
        const snug = treeOf('cherry', {fruitHang: 0})
        const dangling = treeOf('cherry', {fruitHang: 1})
        const plan = planPaintedTree(snug.tree, snug.seed)
        const clump = plan.clumps[0]
        const {spots} = clumpWithFruitSpots(plan, clump, snug.tree, 1, 1, null)
        const high = planHangingFruit(spots, clump, snug.tree)
        const low = planHangingFruit(spots, clump, dangling.tree)

        high.forEach((hang, index) => {
            expect(low[index].attach).toEqual(hang.attach)
            expect(hang.top[1] - low[index].top[1]).toBeGreaterThan(appleSize(snug.tree) * 3)
        })
    })

    it('stays in place on a lighter level, which only has fewer of it', () => {
        for (const id of ['apple', 'cherry', 'pear']) {
            const {tree, seed} = treeOf(id)
            const plan = planPaintedTree(tree, seed)

            for (const clump of plan.clumps) {
                const full = fruitPoints(buildClump(plan, clump, tree, 1))

                for (const share of [0.5, 0.15]) {
                    const lighter = fruitPoints(buildClump(plan, clump, tree, 1, share))

                    expect(lighter.length).toBeGreaterThan(0)

                    // A plainer fruit has fewer sides, so its points sit near, not on, the full one's.
                    for (const point of lighter) {
                        expect(Math.min(...full.map((other) => distance(other, point)))).toBeLessThan(appleSize(tree) * 0.6)
                    }
                }
            }
        }
    })

    it.each(KINDS)('builds %s, at every level, without costing much', (kind) => {
        const {tree, seed} = treeOf('apple', {fruitKind: kind})
        const plain = treeOf('apple', {fruitCount: 0})
        const plan = planPaintedTree(tree, seed)
        const triangles = (geometry: THREE.BufferGeometry) => (geometry.index?.count ?? 0) / 3
        let extra = 0

        for (const clump of plan.clumps) {
            for (const share of [1, 0.5, 0.15]) {
                const geometry = buildClump(plan, clump, tree, 1, share)

                expect(geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true)

                if (share === 1) {
                    extra += triangles(geometry) - triangles(buildClump(plan, clump, plain.tree, 1))
                }
            }
        }

        // A bunch or a hand is one fruit here: it hangs on one stalk.
        expect(extra).toBeGreaterThan(0)
        expect(extra / (plan.clumps.length * tree.fruitCount)).toBeLessThan(200)
    })

    it('shows Hanging with the other fruit controls, but not for cones, which stand up', () => {
        const keys = (presetId: string) =>
            controlsForTree(paintedTreeParameterSpecs, createSceneFromPreset(presetId).assets[0].parameters).map((spec) => spec.key)

        expect(keys('apple')).toContain('fruitHang')
        expect(keys('pine-cones')).not.toContain('fruitHang')
        expect(keys('oak')).not.toContain('fruitHang')
    })

    it('hangs from the leaves on a tree saved before it did, as on a new one', () => {
        const asset = createSceneFromPreset('apple').assets[0]
        // Trees saved then carry a setting that kept the old, floating fruit.
        const saved = validatePaintedTreeParameters({...asset.parameters, fruitPlacement: 'shell'}).parameters
        const fresh = validatePaintedTreeParameters(asset.parameters).parameters
        const plan = planPaintedTree(fresh, asset.seed)

        for (const clump of plan.clumps) {
            const before = buildClump(planPaintedTree(saved, asset.seed), clump, saved, 1).getAttribute('position').array
            const now = buildClump(plan, clump, fresh, 1).getAttribute('position').array

            expect(Array.from(before)).toEqual(Array.from(now))
        }
    })
})
