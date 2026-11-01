import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {bushDefaults} from '../assets/bushes/bush-generator'
import {buildBushLeaves} from '../assets/bushes/bush-mesh'
import {grassDefaults} from '../assets/grass/grass-generator'
import {buildGrassMesh} from '../assets/grass/blade-mesh'
import {plantDefaults, plantGenerator} from '../assets/plants/plant-generator'
import {buildPlantMesh, type PlantParameters} from '../assets/plants/plant-mesh'
import {findPreset, presetGroups} from '../assets/trees/presets'

const SEEDS = [1, 2, 3, 7, 11, 90210]
const KINDS = ['daisy', 'cup', 'spike', 'plume'] as const
const facesOf = (geometry: THREE.BufferGeometry) => geometry.index!.count / 3
const plantPresets = presetGroups.flatMap((group) => group.presets).filter((preset) => preset.generatorId === 'plant')

const boundsOf = (geometry: THREE.BufferGeometry) => {
    geometry.computeBoundingBox()

    return geometry.boundingBox!
}

describe('flowering plants', () => {
    it.each(KINDS)('builds a %s the same way twice, with sound numbers', (kind) => {
        const build = () => buildPlantMesh({...plantDefaults, kind}, 5, 1)
        const positions = [...build().getAttribute('position').array]

        expect(positions).toEqual([...build().getAttribute('position').array])
        expect(positions.every(Number.isFinite)).toBe(true)
    })

    it.each(KINDS)('grows a %s from the ground, near the height asked for', (kind) => {
        const box = boundsOf(buildPlantMesh({...plantDefaults, kind, height: 1, headSize: 0.1, lean: 0.2}, 5, 1))

        expect(box.min.y).toBeLessThan(0.01)
        expect(box.max.y).toBeGreaterThan(0.6)
        expect(box.max.y).toBeLessThan(1.5)
    })

    it('adds a stem without moving the others', () => {
        const start = (stems: number) => [...buildPlantMesh({...plantDefaults, stems}, 5, 1).getAttribute('position').array].slice(0, 30)

        expect(start(10)).toEqual(start(11))
    })

    it('holds its outline at lighter levels', () => {
        const plant = {...plantDefaults, stems: 40}
        const full = boundsOf(buildPlantMesh(plant, 5, 1))
        const light = boundsOf(buildPlantMesh(plant, 5, 0.12))

        expect(facesOf(buildPlantMesh(plant, 5, 0.12))).toBeLessThan(facesOf(buildPlantMesh(plant, 5, 1)) * 0.3)
        expect(light.max.x - light.min.x).toBeGreaterThan((full.max.x - full.min.x) * 0.9)
    })

    it('has no collision', () => {
        expect(plantGenerator.collision!(plantDefaults, 5)).toEqual([])
    })

    it.each(plantPresets.map((preset) => preset.id))('builds %s within a Background budget, at every seed', (id) => {
        const plant = findPreset(id)!.parameters as unknown as PlantParameters

        for (const seed of SEEDS) {
            expect(facesOf(buildPlantMesh(plant, seed, 1))).toBeLessThanOrEqual(5000)
        }
    })
})

describe('flowers on other props', () => {
    it('adds nothing to a bush with Flowers off, and cards with it on', () => {
        const plain = facesOf(buildBushLeaves({...bushDefaults, flowers: 0}, 5, 1))
        const flowering = facesOf(buildBushLeaves({...bushDefaults, flowers: 1}, 5, 1))

        expect(flowering).toBeGreaterThan(plain)
    })

    it('paints flowers on a bush in their own colour', () => {
        const colours = buildBushLeaves({...bushDefaults, flowers: 1, flowerColour: 'pink'}, 5, 1).getAttribute('color')
        let pink = 0

        for (let i = 0; i < colours.count; i++) {
            if (colours.getX(i) > colours.getY(i) * 1.3) {
                pink++
            }
        }

        expect(pink).toBeGreaterThan(0)
    })

    it('adds flowers through grass, in drifts, without changing the blades', () => {
        const plain = buildGrassMesh({...grassDefaults, flowers: 0}, 5, 1)
        const flowering = buildGrassMesh({...grassDefaults, flowers: 30}, 5, 1)

        expect(facesOf(flowering)).toBeGreaterThan(facesOf(plain))
        expect([...flowering.getAttribute('position').array].slice(0, 300)).toEqual([...plain.getAttribute('position').array].slice(0, 300))
    })

    it('never stands a flower taller than the grass is asked to be', () => {
        expect(boundsOf(buildGrassMesh({...grassDefaults, height: 0.8, flowers: 50}, 5, 1)).max.y).toBeLessThan(0.8 * 1.05)
    })
})
