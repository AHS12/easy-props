import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {cutRockBodyGenerator, cutRockDefaults, cutRockGenerator, type CutRockParameters} from '../assets/rocks/cut-rock-generator'
import {buildRockMesh} from '../assets/rocks/rock-mesh'
import {distanceToChunk, facesOfChunk, planRock} from '../assets/rocks/rock-plan'
import {findPropGenerator} from '../assets/prop-generators'
import {findPreset, presetGroups} from '../assets/trees/presets'

const SEEDS = [1, 2, 3, 7, 11, 19, 401, 90210]
const build = (rock: CutRockParameters, seed = 5, detail = 1) => buildRockMesh(planRock(rock, seed), rock, seed, detail)
const facesOf = (geometry: THREE.BufferGeometry) => geometry.index!.count / 3

const boundsOf = (geometry: THREE.BufferGeometry) => {
    geometry.computeBoundingBox()

    return geometry.boundingBox!
}

const rockPresets = presetGroups.filter((group) => group.family === 'rock').flatMap((group) => group.presets)

describe('cut rocks', () => {
    it('is the same rock for the same seed, and another for another', () => {
        const positions = (seed: number) => [...build(cutRockDefaults, seed).getAttribute('position').array]

        expect(positions(5)).toEqual(positions(5))
        expect(positions(5)).not.toEqual(positions(6))
    })

    it.each(SEEDS)('keeps a boulder under 2,000 faces at seed %i', (seed) => {
        expect(facesOf(build(cutRockDefaults, seed))).toBeLessThan(2000)
    })

    it.each(SEEDS)('fits the size asked for at seed %i', (seed) => {
        for (const kind of ['boulder', 'outcrop', 'pillar', 'cliff'] as const) {
            const rock = {...cutRockDefaults, kind, width: 7, height: 4, depth: 3, chunks: 6, bend: 0}
            const box = boundsOf(build(rock, seed))

            // The buried part of a rock carries on outwards, so it can reach a little past its size.
            expect(Math.abs(box.max.x - box.min.x - 7)).toBeLessThan(7 * 0.03)
            expect(box.max.y).toBeCloseTo(4, 1)
            expect(Math.abs(box.max.z - box.min.z - 3)).toBeLessThan(3 * 0.03)
            expect(box.min.y).toBeLessThanOrEqual(0)
        }
    })

    it('makes faces that look outwards', () => {
        const geometry = build({...cutRockDefaults, bend: 0, edges: 0})
        const position = geometry.getAttribute('position')
        const normal = geometry.getAttribute('normal')
        const index = geometry.index!
        const [a, b, c, n] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]

        for (let i = 0; i < index.count; i += 3) {
            a.fromBufferAttribute(position, index.getX(i))
            b.fromBufferAttribute(position, index.getX(i + 1))
            c.fromBufferAttribute(position, index.getX(i + 2))
            n.fromBufferAttribute(normal, index.getX(i))

            expect(b.clone().sub(a).cross(c.clone().sub(a)).dot(n)).toBeGreaterThanOrEqual(-1e-9)
        }
    })

    it('leaves nothing hidden inside another chunk', () => {
        const rock = {...cutRockDefaults, bend: 0, chunks: 4}
        const plan = planRock(rock, 5)
        const geometry = buildRockMesh(plan, rock, 5, 1)
        const position = geometry.getAttribute('position')
        const index = geometry.index!

        for (let i = 0; i < index.count; i += 3) {
            const corners = [0, 1, 2].map((corner) => {
                const v = index.getX(i + corner)

                return [position.getX(v), position.getY(v), position.getZ(v)] as const
            })

            for (const chunk of plan.chunks) {
                expect(corners.every((corner) => distanceToChunk(chunk, corner) < -1e-6)).toBe(false)
            }
        }
    })

    it('has no moss when Moss is off, and some when it is on', () => {
        const greenest = (moss: number) => {
            const colours = build({...cutRockDefaults, moss}).getAttribute('color')
            let best = 0

            for (let i = 0; i < colours.count; i++) {
                // Greener than both red and blue, as moss is and warm grey stone is not.
                best = Math.max(best, Math.min(colours.getY(i) - colours.getZ(i), colours.getY(i) - colours.getX(i)))
            }

            return best
        }

        expect(greenest(0)).toBeLessThan(0.05)
        expect(greenest(1)).toBeGreaterThan(0.12)
    })

    it('adding a chunk leaves the others as they were', () => {
        const few = planRock({...cutRockDefaults, kind: 'boulder', chunks: 2}, 9)
        const more = planRock({...cutRockDefaults, kind: 'boulder', chunks: 3}, 9)
        const tones = (plan: typeof few, chunk: number) => plan.chunks[chunk].planes.map((plane) => plane.tone)

        expect(tones(more, 0)).toEqual(tones(few, 0))
    })

    it('every face of a chunk lies on that chunk', () => {
        for (const chunk of planRock({...cutRockDefaults, chunks: 4}, 3).chunks) {
            for (const {corners} of facesOfChunk(chunk)) {
                for (const corner of corners) {
                    expect(Math.abs(distanceToChunk(chunk, corner))).toBeLessThan(1e-6)
                }
            }
        }
    })

    it('offers one collision shape for each chunk, standing on the ground', () => {
        const shapes = cutRockGenerator.collision!({...cutRockDefaults, chunks: 4}, 5)

        expect(shapes).toHaveLength(4)

        for (const shape of shapes) {
            expect(shape.start[1]).toBe(0)
            expect(shape.end[1]).toBeGreaterThan(0)
            expect(shape.startRadius).toBeGreaterThan(0)
        }
    })

    it.each(rockPresets.map((preset) => preset.id))('gives %s sound collision shapes, at every seed', (id) => {
        const rock = findPreset(id)!.parameters as unknown as CutRockParameters

        for (const seed of SEEDS) {
            for (const shape of cutRockGenerator.collision!(rock, seed)) {
                expect([...shape.start, ...shape.end, shape.startRadius, shape.endRadius].every(Number.isFinite)).toBe(true)
                expect(shape.end[1]).toBeGreaterThan(shape.start[1])
            }
        }
    })

    it('reads what it is given and repairs what it is not', () => {
        const {parameters} = cutRockBodyGenerator.validate({rock: {kind: 'nonsense', width: -4}, seed: 2.5})

        expect(parameters.rock.kind).toBe(cutRockDefaults.kind)
        expect(parameters.seed).toBe(2)
    })

    it('still opens a rock saved before these existed', () => {
        expect(findPropGenerator('rock')).toBeDefined()
        expect(findPreset('boulder')?.generatorId).toBe('cut-rock')
    })

    it.each(rockPresets.map((preset) => preset.id))('builds %s within budget, at every seed', (id) => {
        const rock = findPreset(id)!.parameters as unknown as CutRockParameters

        for (const seed of SEEDS) {
            const geometry = build(rock, seed)
            const position = geometry.getAttribute('position')

            expect(facesOf(geometry)).toBeGreaterThan(20)
            expect(facesOf(geometry)).toBeLessThan(14000)
            expect([...position.array].every(Number.isFinite)).toBe(true)
        }
    })
})
