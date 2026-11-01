import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {buildGrassMesh, planGrass, type GrassParameters} from '../assets/grass/blade-mesh'
import {grassDefaults, grassGenerator} from '../assets/grass/grass-generator'
import {findPreset, presetGroups} from '../assets/trees/presets'
import {EVEN_REACH, windWeight} from '../core/export/pipeline/wind'

const SEEDS = [1, 2, 3, 7, 11, 19, 387, 90210]
const facesOf = (geometry: THREE.BufferGeometry) => geometry.index!.count / 3
const grassPresets = presetGroups.flatMap((group) => group.presets).filter((preset) => preset.generatorId === 'grass')

const boundsOf = (geometry: THREE.BufferGeometry) => {
    geometry.computeBoundingBox()

    return geometry.boundingBox!
}

describe('grass', () => {
    it('is the same patch for the same seed, and another for another', () => {
        const positions = (seed: number) => [...buildGrassMesh(grassDefaults, seed, 1).getAttribute('position').array]

        expect(positions(5)).toEqual(positions(5))
        expect(positions(5)).not.toEqual(positions(6))
    })

    it('costs what the formula says: 4n - 2 faces for a blade of n pieces', () => {
        for (const smoothness of [2, 3, 4, 6]) {
            const geometry = buildGrassMesh({...grassDefaults, blades: 20, smoothness}, 5, 1)

            expect(facesOf(geometry)).toBe(20 * (4 * smoothness - 2))
        }
    })

    it.each(SEEDS)('stands exactly as tall as Height, at seed %i', (seed) => {
        expect(boundsOf(buildGrassMesh({...grassDefaults, height: 0.9}, seed, 1)).max.y).toBeCloseTo(0.9, 3)
    })

    it('grows from the ground', () => {
        expect(boundsOf(buildGrassMesh(grassDefaults, 5, 1)).min.y).toBe(0)
    })

    it('gives blades in one clump a shared direction when Scatter is off', () => {
        const blades = planGrass({...grassDefaults, scatter: 0, clumps: 1}, 5)

        expect(new Set(blades.map((blade) => blade.facing)).size).toBe(1)
    })

    it('adding a blade leaves the others where they were', () => {
        const few = planGrass({...grassDefaults, blades: 50}, 9)
        const more = planGrass({...grassDefaults, blades: 60}, 9)

        for (let i = 0; i < few.length; i++) {
            expect(more[i].x).toBe(few[i].x)
            expect(more[i].facing).toBe(few[i].facing)
        }
    })

    it('bends its normals towards the sky', () => {
        const normal = buildGrassMesh(grassDefaults, 5, 1).getAttribute('normal')

        for (let i = 0; i < normal.count; i++) {
            expect(normal.getY(i)).toBeGreaterThan(0.45)
        }
    })

    it('goes from dark at the root to light at the tip', () => {
        const color = buildGrassMesh({...grassDefaults, blades: 1, variation: 0, dryness: 0}, 5, 1).getAttribute('color')

        expect(color.getY(color.count - 1)).toBeGreaterThan(color.getY(0))
    })

    it('makes dry clumps paler than green ones', () => {
        const blue = (dryness: number) => {
            const color = buildGrassMesh({...grassDefaults, dryness}, 5, 1).getAttribute('color')
            let sum = 0

            for (let i = 0; i < color.count; i++) {
                sum += color.getZ(i)
            }

            return sum / color.count
        }

        expect(blue(1)).toBeGreaterThan(blue(0))
    })

    it('keeps the outline at a lighter level', () => {
        const full = boundsOf(buildGrassMesh(grassDefaults, 5, 1))

        for (const detail of [0.4, 0.12]) {
            const light = boundsOf(buildGrassMesh(grassDefaults, 5, detail))

            expect(Math.abs(light.max.y - full.max.y)).toBeLessThan(full.max.y * 0.02)
            expect(light.max.x - light.min.x).toBeGreaterThan((full.max.x - full.min.x) * 0.9)
        }
    })

    it('has no collision, and its rim moves as its middle does', () => {
        expect(grassGenerator.collision!(grassDefaults, 5)).toEqual([])
        expect(grassGenerator.swaysEvenly).toBe(true)

        const extent = {height: 1, reach: EVEN_REACH}

        expect(windWeight(0.1, 0.5, 0, 'foliage', extent)[0]).toBeCloseTo(windWeight(1.5, 0.5, 0, 'foliage', extent)[0], 4)
    })

    it.each(grassPresets.map((preset) => preset.id))('builds %s within a Background budget, at every seed', (id) => {
        const grass = findPreset(id)!.parameters as unknown as GrassParameters

        for (const seed of SEEDS) {
            const geometry = buildGrassMesh(grass, seed, 1)

            expect(facesOf(geometry)).toBeLessThanOrEqual(5000)
            expect([...geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true)
        }
    })
})
