import {describe, expect, it} from 'vitest'
import * as THREE from 'three'
import {RIGID_ATTRIBUTE} from '../assets/shared/generator-types'
import {planPaintedTree, validatePaintedTreeParameters} from '../assets/trees/painted'
import {buildClump} from '../assets/trees/painted/clump-mesh'
import {fruitRadius} from '../assets/trees/painted/frond-mesh'
import {createSceneFromPreset} from '../core/scene/initial-scene'

type Point = [number, number, number]

const FRUIT_TREES = ['apple', 'orange', 'lemon', 'plum', 'christmas']

const treeOf = (presetId: string) => {
    const asset = createSceneFromPreset(presetId).assets[0]

    return {tree: validatePaintedTreeParameters(asset.parameters).parameters, seed: asset.seed}
}

const pointAt = (array: ArrayLike<number>, index: number): Point => [array[index * 3], array[index * 3 + 1], array[index * 3 + 2]]
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** A leaf card's middle and the half of each side, from its four corners. */
type Card = {middle: Point; across: Point; along: Point}

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * How far a point is from the leafy middle of a card. The picture fades out
 * towards the corners, so only the middle half of each side counts.
 */
function distanceToCard(point: Point, {middle, across, along}: Card): number {
    const offset = sub(point, middle)
    const s = Math.max(-0.5, Math.min(0.5, dot(offset, across) / dot(across, across)))
    const t = Math.max(-0.5, Math.min(0.5, dot(offset, along) / dot(along, along)))

    return distance(point, [0, 1, 2].map((axis) => middle[axis] + across[axis] * s + along[axis] * t) as Point)
}

/** Each leaf card, and the middle of each fruit, in one clump. */
function partsOf(geometry: THREE.BufferGeometry, share: number) {
    const position = geometry.getAttribute('position').array
    const rigid = geometry.getAttribute(RIGID_ATTRIBUTE)?.array ?? []
    const count = position.length / 3
    let leafCount = count

    for (let i = 0; i < rigid.length; i++) {
        if (rigid[i] === 1) {
            leafCount = i
            break
        }
    }

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

    // A stalk, then the ball: plainer on a light level.
    const plain = share < 0.7
    const stalk = plain ? 6 : 8
    const ball = plain ? 16 : 30
    const fruit: Point[] = []

    for (let first = leafCount; first < count; first += stalk + ball) {
        const points = Array.from({length: ball}, (_, index) => pointAt(position, first + stalk + index))

        fruit.push([0, 1, 2].map((axis) => points.reduce((sum, point) => sum + point[axis], 0) / ball) as Point)
    }

    return {cards, fruit}
}

describe('fruit on a painted tree', () => {
    it('hangs where there are leaves, close enough to touch them', () => {
        for (const id of FRUIT_TREES) {
            const {tree, seed} = treeOf(id)

            for (const shift of [0, 1, 2]) {
                const plan = planPaintedTree(tree, seed + shift)
                const radius = fruitRadius(tree)

                for (const clump of plan.clumps) {
                    const {cards, fruit} = partsOf(buildClump(plan, clump, tree, 1), 1)

                    expect(fruit.length, `${id} clump ${clump.key}`).toBe(tree.fruitCount)

                    for (const centre of fruit) {
                        const nearest = Math.min(...cards.map((card) => distanceToCard(centre, card)))

                        expect(nearest, `${id} seed ${seed + shift} clump ${clump.key}`).toBeLessThanOrEqual(radius)
                    }
                }
            }
        }
    })

    it('stays in place on a lighter level, which only has fewer of it', () => {
        for (const id of FRUIT_TREES) {
            const {tree, seed} = treeOf(id)
            const plan = planPaintedTree(tree, seed)

            for (const clump of plan.clumps) {
                const full = partsOf(buildClump(plan, clump, tree, 1), 1).fruit

                for (const share of [0.5, 0.15]) {
                    const lighter = partsOf(buildClump(plan, clump, tree, 1, share), share).fruit

                    expect(lighter.length).toBeGreaterThan(0)
                    expect(lighter.length).toBeLessThanOrEqual(full.length)

                    for (const centre of lighter) {
                        expect(Math.min(...full.map((other) => distance(other, centre)))).toBeLessThan(1e-4)
                    }
                }
            }
        }
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
