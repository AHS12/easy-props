import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {plantGenerator} from '../assets/plants/plant-generator'
import type {PlantParameters} from '../assets/plants/plant-mesh'
import {findComponentGenerator} from '../assets/component-generators'
import {generatePropComponents} from '../assets/prop-generators'
import {createSeededRandom} from '../assets/shared/random'
import {getStyleProfile} from '../assets/style/style-profiles'
import {findPreset} from '../assets/trees/presets'

const STYLE = getStyleProfile('detailed')
const PLANTS = ['flower-clump', 'daisies', 'flame-flowers', 'red-spikes', 'violet-spikes', 'pampas']

function presetPlant(id: string, build: 'painted' | 'low-poly', changes: Partial<PlantParameters> = {}) {
    const preset = findPreset(id)!

    return {plant: plantGenerator.validate({...preset.parameters, ...changes, build}).parameters, seed: preset.seed}
}

function buildPlant({plant, seed}: {plant: PlantParameters; seed: number}, detail = 1): THREE.BufferGeometry {
    const [component] = generatePropComponents('plant', plant as unknown as Record<string, unknown>, seed, STYLE)
    const generator = findComponentGenerator(component.generatorId)!

    return generator.generate(generator.validate(component.parameters).parameters, {random: createSeededRandom(seed), seed, style: STYLE, detail}).geometry
}

const faces = (geometry: THREE.BufferGeometry) => (geometry.index?.count ?? geometry.getAttribute('position').count) / 3

const sizeOf = (geometry: THREE.BufferGeometry) => {
    geometry.computeBoundingBox()

    return geometry.boundingBox!.getSize(new THREE.Vector3())
}

describe('a low-poly flowering plant', () => {
    it('costs fewer faces than the normal plant', () => {
        for (const id of PLANTS) {
            expect(faces(buildPlant(presetPlant(id, 'low-poly'))), id).toBeLessThan(faces(buildPlant(presetPlant(id, 'painted'))) * 0.75)
        }
    })

    it('gives every face one colour and one facing', () => {
        for (const id of PLANTS) {
            const geometry = buildPlant(presetPlant(id, 'low-poly'))
            const normal = geometry.getAttribute('normal')
            const colour = geometry.getAttribute('color')

            expect(geometry.index, id).toBeNull()

            for (let at = 0; at < normal.count; at += 3) {
                for (let k = 1; k < 3; k++) {
                    expect(normal.getY(at + k)).toBeCloseTo(normal.getY(at), 6)
                    expect(colour.getX(at + k)).toBeCloseTo(colour.getX(at), 6)
                }
            }
        }
    })

    it('stands about as wide and tall as the normal plant', () => {
        for (const id of PLANTS) {
            const low = sizeOf(buildPlant(presetPlant(id, 'low-poly')))
            const normal = sizeOf(buildPlant(presetPlant(id, 'painted')))

            for (const axis of ['x', 'y', 'z'] as const) {
                expect(Math.abs(low[axis] / normal[axis] - 1), `${id} ${axis}`).toBeLessThan(0.15)
            }
        }
    })

    it('is the same for the same seed, and stays finite at the extremes', () => {
        const plant = presetPlant('pampas', 'low-poly')

        expect([...buildPlant(plant).getAttribute('position').array]).toEqual([...buildPlant(plant).getAttribute('position').array])

        for (const changes of [{stems: 1, leaves: 0, headSize: 0.01, width: 0.05, height: 0.05, lean: 0}, {stems: 80, leaves: 6, headSize: 1, width: 6, height: 4, lean: 1}]) {
            for (const kind of ['daisy', 'cup', 'spike', 'plume'] as const) {
                const position = buildPlant(presetPlant('daisies', 'low-poly', {...changes, kind})).getAttribute('position')

                expect([...position.array].every(Number.isFinite), kind).toBe(true)
            }
        }
    })

    it('gives a lighter detail level fewer faces, at the same size', () => {
        const plant = presetPlant('violet-spikes', 'low-poly')
        const full = buildPlant(plant)
        const light = buildPlant(plant, 0.4)

        expect(faces(light)).toBeLessThan(faces(full))
        expect(sizeOf(light).y).toBeCloseTo(sizeOf(full).y, 4)
    })

    it('hides the style from the controls, since it is a switch over the view', () => {
        expect(plantGenerator.shownControls!(presetPlant('daisies', 'low-poly').plant as unknown as Record<string, unknown>).map((spec) => spec.key)).not.toContain('build')
    })
})
