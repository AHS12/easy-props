import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {cactusDefaults, cactusGenerator} from '../assets/cacti/cactus-generator'
import {buildCactusMesh, type CactusKind, type CactusParameters} from '../assets/cacti/cactus-mesh'
import {createSeededRandom} from '../assets/shared/random'
import {presetGroups} from '../assets/trees/presets'

const KINDS: readonly CactusKind[] = ['column', 'barrel', 'paddle']
const facesOf = (geometry: THREE.BufferGeometry) => geometry.index!.count / 3
const cactusPresets = presetGroups.flatMap((group) => group.presets).filter((preset) => preset.generatorId === 'cactus')
const presetParameters = (preset: (typeof cactusPresets)[number]) => cactusGenerator.validate(preset.parameters).parameters

const boundsOf = (geometry: THREE.BufferGeometry) => {
    geometry.computeBoundingBox()

    return geometry.boundingBox!
}

describe('cactus', () => {
    it.each(KINDS)('is the same %s for the same seed, and another for another', (kind) => {
        const positions = (seed: number) => [...buildCactusMesh({...cactusDefaults, kind}, seed).getAttribute('position').array]

        expect(positions(5)).toEqual(positions(5))
        expect(positions(5)).not.toEqual(positions(6))
    })

    it('stands as tall as Height, with nothing on top', () => {
        for (const kind of ['column', 'barrel'] as const) {
            for (const height of [0.5, 3, 9]) {
                const top = boundsOf(buildCactusMesh({...cactusDefaults, kind, height, spines: 0}, 3)).max.y

                expect(Math.abs(top - height) / height, `${kind} at ${height} m`).toBeLessThan(0.03)
            }
        }
    })

    it('never grows a pad above Height', () => {
        for (const seed of [1, 2, 3, 4, 5]) {
            const top = boundsOf(buildCactusMesh({...cactusDefaults, kind: 'paddle', height: 1.2, pads: 30, spines: 0}, seed)).max.y

            expect(top).toBeLessThanOrEqual(1.2 + 1e-6)
        }
    })

    it.each(KINDS)('stands in the ground, not above it, as a %s', (kind) => {
        expect(boundsOf(buildCactusMesh({...cactusDefaults, kind}, 4)).min.y).toBeLessThanOrEqual(0)
    })

    it('adding an arm leaves the others where they were', () => {
        const count = (arms: number) => buildCactusMesh({...cactusDefaults, arms, spines: 0}, 8).getAttribute('position')
        const few = count(2)
        const more = count(3)

        // The trunk and the first two arms come first, so they are the same numbers.
        expect([...more.array.slice(0, few.array.length)]).toEqual([...few.array])
    })

    it('gives every kind only the controls it uses', () => {
        const keys = (kind: CactusKind, flowers = 0) => cactusGenerator.shownControls!({kind, flowers}).map((spec) => spec.key)

        expect(keys('column')).toContain('arms')
        expect(keys('column')).not.toContain('pads')
        expect(keys('barrel')).not.toContain('arms')
        expect(keys('paddle')).toContain('pads')
        expect(keys('paddle')).not.toContain('ribs')
        expect(keys('column')).not.toContain('flowerColour')
        expect(keys('column', 3)).toContain('flowerColour')
    })

    it.each(cactusPresets.map((preset) => preset.id))('keeps %s well inside a standard budget', (id) => {
        const preset = cactusPresets.find((candidate) => candidate.id === id)!

        expect(facesOf(buildCactusMesh(presetParameters(preset), preset.seed))).toBeLessThan(12000)
    })

    it.each(cactusPresets.map((preset) => preset.id))('gets lighter with detail, as %s', (id) => {
        const preset = cactusPresets.find((candidate) => candidate.id === id)!
        const full = facesOf(buildCactusMesh(presetParameters(preset), preset.seed, 1))

        expect(facesOf(buildCactusMesh(presetParameters(preset), preset.seed, 0.4)) / full).toBeLessThan(0.5)
        expect(facesOf(buildCactusMesh(presetParameters(preset), preset.seed, 0.12)) / full).toBeLessThan(0.16)
    })

    it('never produces a broken number, across the whole range of every control', () => {
        const random = createSeededRandom(77)

        for (let run = 0; run < 40; run++) {
            const {parameters} = cactusGenerator.validate({
                kind: KINDS[run % 3],
                height: 0.1 + random() * 14,
                thickness: 0.04 + random() * 1.6,
                ribs: random() * 30,
                ribDepth: random(),
                arms: random() * 8,
                armHeight: 0.05 + random() * 0.75,
                pads: 1 + random() * 39,
                lean: random() * 0.4,
                spines: random(),
                flowers: random() * 16,
            })
            const geometry = buildCactusMesh(parameters as CactusParameters, run, [1, 0.4, 0.12][run % 3])

            expect(geometry.getAttribute('position').count).toBeGreaterThan(0)
            expect([...geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true)
            expect([...geometry.getAttribute('normal').array].every(Number.isFinite)).toBe(true)
            expect([...geometry.getAttribute('color').array].every((value) => value >= 0 && value <= 1)).toBe(true)
        }
    })

    it('mends a damaged saved cactus rather than failing', () => {
        const {parameters} = cactusGenerator.validate({kind: 'tree', height: 'tall', ribs: 12.6, pads: -3})

        expect(parameters.kind).toBe('column')
        expect(parameters.height).toBe(cactusDefaults.height)
        expect(parameters.ribs).toBe(13)
        expect(parameters.pads).toBe(1)
    })
})
