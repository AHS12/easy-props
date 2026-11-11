import {describe, expect, it} from 'vitest'
import {plantGenerator} from '../assets/plants/plant-generator'
import {buildPlantMesh, type PlantLeafKind, type PlantParameters} from '../assets/plants/plant-mesh'
import {createSceneFromPreset} from '../core/scene/initial-scene'

const KINDS: readonly PlantLeafKind[] = ['grass', 'straps', 'stem', 'rosette', 'feathery']

function flower(change: Partial<PlantParameters> = {}) {
    const asset = createSceneFromPreset('flame-flowers').assets[0]

    return {plant: plantGenerator.validate({...asset.parameters, ...change}).parameters, seed: asset.seed}
}

const triangles = (change: Partial<PlantParameters>, detail = 1) => {
    const {plant, seed} = flower(change)

    return (buildPlantMesh(plant, seed, detail).index?.count ?? 0) / 3
}

describe('a flower’s leaves', () => {
    it('start grass-like, on new flowers and ones saved before the choice', () => {
        expect(plantGenerator.validate({}).parameters.leafKind).toBe('grass')
        expect(flower({leafKind: undefined}).plant.leafKind).toBe('grass')
    })

    it.each(KINDS)('build as %s, with nothing broken, at every level', (leafKind) => {
        const {plant, seed} = flower({leafKind})

        for (const detail of [1, 0.5, 0.2]) {
            const geometry = buildPlantMesh(plant, seed, detail)

            expect(geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true)
            // Leaves stand on the ground, never below it.
            geometry.computeBoundingBox()
            expect(geometry.boundingBox!.min.y).toBeGreaterThan(-0.001)
        }
    })

    it('look different for each kind, and cost little more than grass-like ones', () => {
        const shapes = KINDS.map((leafKind) => {
            const {plant, seed} = flower({leafKind})

            return Array.from(buildPlantMesh(plant, seed, 1).getAttribute('position').array)
        })

        for (let a = 0; a < shapes.length; a++) {
            for (let b = a + 1; b < shapes.length; b++) {
                expect(shapes[a]).not.toEqual(shapes[b])
            }
        }

        for (const leafKind of KINDS) {
            expect(triangles({leafKind})).toBeLessThan(triangles({leafKind: 'grass'}) * 2.5)
        }
    })

    it('leave the flowers on top where they were', () => {
        const head = (leafKind: PlantLeafKind) => {
            const {plant, seed} = flower({leafKind, leaves: 0})

            return Array.from(buildPlantMesh(plant, seed, 1).getAttribute('position').array)
        }

        // With no leaves, every kind is the same stems and heads.
        for (const leafKind of KINDS) {
            expect(head(leafKind)).toEqual(head('grass'))
        }
    })

    it('hide the choice on a low-poly flower, which keeps folded grass-like leaves', () => {
        const keys = (build: string) => plantGenerator.shownControls!({...flower().plant, build}).map((spec) => spec.key)

        expect(keys('painted')).toContain('leafKind')
        expect(keys('low-poly')).not.toContain('leafKind')
    })
})
