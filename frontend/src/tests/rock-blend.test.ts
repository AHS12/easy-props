import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {cutRockBodyGenerator, cutRockDefaults, cutRockGenerator, type CutRockParameters} from '../assets/rocks/cut-rock-generator'
import {damageRock, type CrackedChunk} from '../assets/rocks/rock-damage'
import {buildRockMesh} from '../assets/rocks/rock-mesh'
import {distanceToChunk, planRock} from '../assets/rocks/rock-plan'
import {findPreset} from '../assets/trees/presets'
import {parseProject, serializeProject} from '../core/project/project-document'
import {createSceneFromPreset} from '../core/scene/initial-scene'

const boulder = (changes: Partial<CutRockParameters> = {}): CutRockParameters => ({...(findPreset('boulder')!.parameters as unknown as CutRockParameters), ...changes})
const SEED = findPreset('boulder')!.seed

function bodyOf(rock: CutRockParameters, detail = 1): THREE.BufferGeometry {
    return cutRockBodyGenerator.generate(cutRockBodyGenerator.validate({rock, seed: SEED}).parameters, {detail} as never).geometry
}

const brightness = (colour: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, index: number) => colour.getX(index) + colour.getY(index) + colour.getZ(index)

describe('blend on rocks', () => {
    it('is on for new rocks, and hidden on a low-poly one', () => {
        expect(cutRockDefaults.blend).toBe(0.6)

        const keys = (build: string) => cutRockGenerator.shownControls!({...cutRockDefaults, build}).map((spec) => spec.key)

        expect(keys('painted')).toContain('blend')
        expect(keys('low-poly')).not.toContain('blend')
    })

    it('eases the seams between chunks to creases', () => {
        const plan = planRock(boulder(), SEED)
        const seamLight = (blend: number) => {
            const geometry = buildRockMesh(plan, boulder({blend}), SEED, 1)
            const position = geometry.getAttribute('position')
            const colour = geometry.getAttribute('color')
            let sum = 0
            let count = 0

            for (let index = 0; index < position.count; index++) {
                const p = [position.getX(index), position.getY(index), position.getZ(index)] as const
                const near = plan.chunks.filter((chunk) => Math.abs(distanceToChunk(chunk, p)) < 0.05).length

                // Where two chunks meet.
                if (near >= 2) {
                    sum += brightness(colour, index)
                    count++
                }
            }

            return sum / count
        }

        expect(seamLight(1)).toBeGreaterThan(seamLight(0) * 1.05)
    })

    it('draws a carved boulder’s smaller chunks in, and leaves a low-poly one’s where they were', () => {
        const spread = (rock: CutRockParameters) => {
            const shapes = cutRockGenerator.collision!(rock, SEED)

            return shapes.slice(1).reduce((sum, shape) => sum + Math.hypot(shape.start[0], shape.start[2]), 0) / (shapes.length - 1)
        }

        // The rock is stretched back to its width afterwards, so they end up only a little nearer.
        expect(spread(boulder({blend: 1}))).toBeLessThan(spread(boulder({blend: 0})) * 0.95)
        expect(spread(boulder({build: 'low-poly', blend: 1}))).toBe(spread(boulder({build: 'low-poly', blend: 0})))
        // A rock saved before Rounded light keeps its layout too.
        expect(spread(boulder({rounded: 0, blend: 1}))).toBe(spread(boulder({rounded: 0, blend: 0})))
    })

    it('opens a rock saved before it with none', () => {
        const scene = createSceneFromPreset('boulder')
        const document = JSON.parse(serializeProject({scene, style: 'low-poly'})) as {
            scene: {assets: {parameters: Record<string, unknown>; components: {parameters: {rock?: Record<string, unknown>}}[]}[]}
        }

        for (const asset of document.scene.assets) {
            delete asset.parameters.blend

            for (const component of asset.components) {
                delete component.parameters.rock?.blend
            }
        }

        const [asset] = parseProject(JSON.stringify(document)).scene.assets

        expect(asset.parameters.blend).toBe(0)
        expect((asset.components[0].parameters as {rock: {blend: number}}).rock.blend).toBe(0)
    })
})

describe('rubble', () => {
    it('is none at first, and leaves the rock as it was', () => {
        expect(cutRockDefaults.rubble).toBe(0)

        const plan = planRock(boulder(), SEED)

        expect(damageRock(plan, boulder(), SEED)).toBe(plan)
    })

    it('lies small stones round the foot, more as it goes up', () => {
        const pebbles = (rubble: number) => (damageRock(planRock(boulder(), SEED), boulder({rubble}), SEED).chunks as CrackedChunk[]).filter((chunk) => chunk.rubble)

        expect(pebbles(1).length).toBeGreaterThan(pebbles(0.2).length)

        for (const pebble of pebbles(1)) {
            // On the ground, outside the main stone.
            expect(pebble.centre[1]).toBeLessThan(0.3)
            expect(Math.hypot(pebble.centre[0], pebble.centre[2])).toBeGreaterThan(1)
        }
    })

    it('costs little, and stays at every level', () => {
        const faces = (rubble: number, detail = 1) => (bodyOf(boulder({rubble}), detail).index?.count ?? 0) / 3

        expect(faces(1) - faces(0)).toBeLessThan(500)
        expect(faces(1, 0.12)).toBeGreaterThan(faces(0, 0.12))
    })
})

describe('dents', () => {
    const mossy = (changes: Partial<CutRockParameters> = {}): CutRockParameters => ({...(findPreset('mossy-boulder')!.parameters as unknown as CutRockParameters), ...changes})
    const mossySeed = findPreset('mossy-boulder')!.seed
    const build = (rock: CutRockParameters) => buildRockMesh(planRock(rock, mossySeed), rock, mossySeed, 1)

    it('are on for new rocks, hidden on a low-poly one, and none on a saved one', () => {
        expect(cutRockDefaults.dents).toBe(0.3)
        expect(cutRockGenerator.shownControls!({...cutRockDefaults, build: 'low-poly'}).map((spec) => spec.key)).not.toContain('dents')

        const document = JSON.parse(serializeProject({scene: createSceneFromPreset('boulder'), style: 'low-poly'})) as {
            scene: {assets: {parameters: Record<string, unknown>}[]}
        }

        delete document.scene.assets[0].parameters.dents
        expect(parseProject(JSON.stringify(document)).scene.assets[0].parameters.dents).toBe(0)
    })

    it('hollow some faces darker and deeper, at no cost in faces', () => {
        const flat = build(mossy({dents: 0}))
        const dented = build(mossy({dents: 1}))
        const total = (geometry: THREE.BufferGeometry) => {
            const colour = geometry.getAttribute('color')
            let sum = 0

            for (let index = 0; index < colour.count; index++) {
                sum += brightness(colour, index)
            }

            return sum
        }

        expect(dented.index!.count).toBe(flat.index!.count)
        expect(total(dented)).toBeLessThan(total(flat))
        expect(Array.from(dented.getAttribute('position').array)).not.toEqual(Array.from(flat.getAttribute('position').array))
    })

    it('leave a rock saved before Rounded light alone', () => {
        const before = build(mossy({rounded: 0, dents: 0}))
        const after = build(mossy({rounded: 0, dents: 1}))

        expect(Array.from(after.getAttribute('position').array)).toEqual(Array.from(before.getAttribute('position').array))
    })
})
