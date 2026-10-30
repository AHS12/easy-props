import {describe, expect, it} from 'vitest'
import * as THREE from 'three'
import {growSkeleton} from './colonization'
import {growthDefaults} from './parameters'
import {skeletonToBark} from './sweep'
import type {Skeleton} from './skeleton'

const SEED = 20240521
const SEGMENTS = 8

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

function attribute(geometry: THREE.BufferGeometry, name: string): THREE.BufferAttribute {
    const found = geometry.getAttribute(name)

    if (!(found instanceof THREE.BufferAttribute)) {
        throw new Error(`No ${name} attribute`)
    }

    return found
}

function indicesOf(geometry: THREE.BufferGeometry): number[] {
    const index = geometry.getIndex()

    if (!index) {
        throw new Error('Geometry is not indexed')
    }

    return Array.from(index.array as ArrayLike<number>)
}

/** The distance from a joint to one of its own ring vertices. */
function vertex(
    position: THREE.BufferAttribute,
    index: number,
): [number, number, number] {
    return [position.getX(index), position.getY(index), position.getZ(index)]
}

function distance(a: readonly number[], b: readonly number[]): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

describe('bark sweep', () => {
    const skeleton = growSkeleton(growthDefaults, SEED)
    const children = childrenOf(skeleton)
    const bark = skeletonToBark(skeleton)
    const position = attribute(bark, 'position')
    const normal = attribute(bark, 'normal')
    const indices = indicesOf(bark)
    const count = skeleton.nodes.length
    const tips = skeleton.nodes.filter((node) => !children.has(node.id)).length
    const capStart = count * SEGMENTS

    it('puts one ring on every joint and a fan on every real end', () => {
        expect(position.count).toBe(capStart + tips + 1)
        expect(indices.length % 3).toBe(0)
        expect(normal.count).toBe(position.count)
    })

    it('shares the joint ring between a limb and its parent', () => {
        const usedByEdge = new Map<string, Set<number>>()

        for (let corner = 0; corner < indices.length; corner += 3) {
            const triangle = [indices[corner], indices[corner + 1], indices[corner + 2]]
            const rings = triangle.map((index) => (index >= capStart ? -1 : Math.floor(index / SEGMENTS)))

            // A face is either a cap, or a quad bridging one joint with one of
            // its children. Anything else would be a seam or a hole.
            if (rings.includes(-1)) {
                continue
            }

            const [first] = rings
            const other = rings.find((ring) => ring !== first)

            if (other === undefined) {
                throw new Error(`Face inside a single ring: ${triangle.join(',')}`)
            }

            const child = skeleton.nodes[other].parentId === first ? other : first
            const parent = child === first ? other : first

            expect(skeleton.nodes[child].parentId).toBe(parent)

            const key = `${parent}:${child}`
            const used = usedByEdge.get(key) ?? new Set<number>()

            for (const index of triangle) {
                used.add(index)
            }

            usedByEdge.set(key, used)
        }

        let edges = 0

        for (const node of skeleton.nodes) {
            if (node.parentId === null) {
                continue
            }

            const parent = node.parentId
            const used = usedByEdge.get(`${parent}:${node.id}`)

            expect(used, `edge ${parent}->${node.id}`).toBeDefined()

            // The child's tube starts on the parent's ring: the same vertices,
            // not a second copy of them.
            const expected = new Set<number>()

            for (let step = 0; step < SEGMENTS; step++) {
                expected.add(parent * SEGMENTS + step)
                expected.add(node.id * SEGMENTS + step)
            }

            expect([...used!].sort((a, b) => a - b)).toEqual([...expected].sort((a, b) => a - b))

            // And that shared ring really is the parent's ring: it sits at the
            // parent's radius, round the parent's axis.
            const centre = skeleton.nodes[parent].position
            const direction = skeleton.nodes[parent].direction
            const length = Math.hypot(direction[0], direction[1], direction[2])

            for (let step = 0; step < SEGMENTS; step++) {
                const vertexIndex = parent * SEGMENTS + step
                const point = vertex(position, vertexIndex)

                expect(Math.abs(distance(point, centre) - skeleton.nodes[parent].radius)).toBeLessThan(1e-6)
                expect(
                    Math.abs(
                        ((point[0] - centre[0]) * direction[0] +
                            (point[1] - centre[1]) * direction[1] +
                            (point[2] - centre[2]) * direction[2]) /
                            length,
                    ),
                ).toBeLessThan(1e-6)
            }

            // The child tapers from that ring to its own, which is thinner.
            expect(skeleton.nodes[node.id].radius).toBeLessThanOrEqual(
                skeleton.nodes[parent].radius + 1e-12,
            )

            edges++
        }

        expect(edges).toBe(count - 1)
    })

    it('caps only the tips and the base of the trunk', () => {
        let capTriangles = 0

        for (let corner = 0; corner < indices.length; corner += 3) {
            const triangle = [indices[corner], indices[corner + 1], indices[corner + 2]]

            if (triangle.some((index) => index >= capStart)) {
                capTriangles++

                // Every cap triangle is one fan corner plus two ring vertices.
                expect(triangle.filter((index) => index >= capStart)).toHaveLength(1)
            }
        }

        expect(capTriangles).toBe((tips + 1) * SEGMENTS)
    })

    it('starts the trunk at the thickness that was asked for', () => {
        const centre = skeleton.nodes[0].position

        for (let step = 0; step < SEGMENTS; step++) {
            expect(distance(vertex(position, step), centre)).toBeCloseTo(
                growthDefaults.trunkRadius,
                6,
            )
        }

        expect(skeleton.nodes[0].radius).toBeCloseTo(growthDefaults.trunkRadius, 6)
        expect(centre[1]).toBeCloseTo(0, 9)
    })

    it('is a clean mesh: finite, indexed, no slivers, nothing wasted', () => {
        const vertexCount = position.count

        for (let index = 0; index < vertexCount; index++) {
            const point = vertex(position, index)
            const shading = vertex(normal, index)

            for (const value of [...point, ...shading]) {
                expect(Number.isFinite(value), `vertex ${index}`).toBe(true)
            }

            // A normal of no length would render as a black speck.
            expect(Math.hypot(...shading)).toBeCloseTo(1, 5)
        }

        const used = new Set<number>()
        let smallest = Number.POSITIVE_INFINITY

        for (let corner = 0; corner < indices.length; corner += 3) {
            const triangle = [indices[corner], indices[corner + 1], indices[corner + 2]]

            for (const index of triangle) {
                expect(index).toBeGreaterThanOrEqual(0)
                expect(index).toBeLessThan(vertexCount)
                used.add(index)
            }

            const [a, b, c] = triangle.map((index) => vertex(position, index))
            const area =
                0.5 *
                Math.hypot(
                    (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
                    (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
                    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
                )

            expect(area, `triangle ${corner / 3}`).toBeGreaterThan(1e-9)
            smallest = Math.min(smallest, area)
        }

        // Nothing in the buffer goes unrendered.
        expect(used.size).toBe(vertexCount)
        expect(smallest).toBeGreaterThan(0)
    })

    it('follows every limb with a ring that stays square to it', () => {
        for (const node of skeleton.nodes) {
            const centre = node.position
            let mean = [0, 0, 0]

            for (let step = 0; step < SEGMENTS; step++) {
                const point = vertex(position, node.id * SEGMENTS + step)

                mean = [
                    mean[0] + point[0] / SEGMENTS,
                    mean[1] + point[1] / SEGMENTS,
                    mean[2] + point[2] / SEGMENTS,
                ]

                expect(Math.abs(distance(point, centre) - node.radius)).toBeLessThan(1e-6)
            }

            // The ring is centred on the joint, not offset from it.
            expect(distance(mean, centre)).toBeLessThan(1e-5)
        }
    })

    it('faces the caps the way the wood ends', () => {
        const facing = (index: number, direction: readonly [number, number, number]): number => {
            const shading = vertex(normal, index)

            return shading[0] * direction[0] + shading[1] * direction[1] + shading[2] * direction[2]
        }

        // The base of the trunk looks down the tree, away from the crown.
        expect(facing(capStart, skeleton.nodes[0].direction)).toBeLessThan(-0.9)

        let cap = capStart + 1

        for (let index = 1; index < count; index++) {
            if (children.has(index)) {
                continue
            }

            // A tip looks the way the twig was growing, not back into it.
            expect(facing(cap, skeleton.nodes[index].direction)).toBeGreaterThan(0.9)
            cap++
        }

        expect(cap).toBe(position.count)
    })

    it('honours a different number of ring vertices', () => {
        const segments = 5
        const geometry = skeletonToBark(skeleton, {radialSegments: segments})
        const position = attribute(geometry, 'position')
        const index = indicesOf(geometry)

        expect(position.count).toBe(count * segments + tips + 1)
        expect(index.length / 3).toBe(2 * segments * (count - 1) + segments * (tips + 1))
    })

    it('returns nothing for a skeleton with nothing in it', () => {
        const empty = skeletonToBark({nodes: [], parameters: growthDefaults, seed: SEED})

        expect(empty.getAttribute('position')).toBeUndefined()
        expect(empty.getIndex()).toBeNull()
    })
})
