import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {cactusGenerator} from '../assets/cacti/cactus-generator'
import type {CactusParameters} from '../assets/cacti/cactus-mesh'
import {findComponentGenerator} from '../assets/component-generators'
import {generatePropComponents} from '../assets/prop-generators'
import {createSeededRandom} from '../assets/shared/random'
import {getStyleProfile} from '../assets/style/style-profiles'
import {findPreset} from '../assets/trees/presets'

const STYLE = getStyleProfile('detailed')
const CACTI = ['saguaro', 'young-saguaro', 'organ-pipe', 'golden-barrel', 'flowering-barrel', 'prickly-pear']

function presetCactus(id: string, build: 'painted' | 'low-poly', changes: Partial<CactusParameters> = {}) {
    const preset = findPreset(id)!

    return {cactus: cactusGenerator.validate({...preset.parameters, ...changes, build}).parameters, seed: preset.seed}
}

function buildCactus({cactus, seed}: {cactus: CactusParameters; seed: number}, detail = 1): THREE.BufferGeometry {
    const [component] = generatePropComponents('cactus', cactus as unknown as Record<string, unknown>, seed, STYLE)
    const generator = findComponentGenerator(component.generatorId)!

    return generator.generate(generator.validate(component.parameters).parameters, {random: createSeededRandom(seed), seed, style: STYLE, detail}).geometry
}

const faces = (geometry: THREE.BufferGeometry) => (geometry.index?.count ?? geometry.getAttribute('position').count) / 3

const sizeOf = (geometry: THREE.BufferGeometry) => {
    geometry.computeBoundingBox()

    return geometry.boundingBox!.getSize(new THREE.Vector3())
}

describe('a low-poly cactus', () => {
    it('costs far fewer faces than the normal cactus', () => {
        for (const id of CACTI) {
            expect(faces(buildCactus(presetCactus(id, 'low-poly'))), id).toBeLessThan(faces(buildCactus(presetCactus(id, 'painted'))) / 2)
        }
    })

    it('gives every face one colour and one facing', () => {
        for (const id of CACTI) {
            const geometry = buildCactus(presetCactus(id, 'low-poly'))
            const normal = geometry.getAttribute('normal')
            const colour = geometry.getAttribute('color')

            expect(geometry.index, id).toBeNull()

            for (let at = 0; at < normal.count; at += 3) {
                for (let k = 1; k < 3; k++) {
                    expect(normal.getX(at + k)).toBeCloseTo(normal.getX(at), 6)
                    expect(colour.getY(at + k)).toBeCloseTo(colour.getY(at), 6)
                }
            }
        }
    })

    it('stands about as wide and tall as the normal cactus', () => {
        for (const id of CACTI) {
            const low = sizeOf(buildCactus(presetCactus(id, 'low-poly')))
            const normal = sizeOf(buildCactus(presetCactus(id, 'painted')))

            for (const axis of ['x', 'y', 'z'] as const) {
                expect(Math.abs(low[axis] / normal[axis] - 1), `${id} ${axis}`).toBeLessThan(0.12)
            }
        }
    })

    it('gives every lighter detail level fewer faces', () => {
        for (const id of ['saguaro', 'golden-barrel', 'prickly-pear']) {
            const cactus = presetCactus(id, 'low-poly')
            const counts = [1, 0.4, 0.12].map((detail) => faces(buildCactus(cactus, detail)))

            expect(counts[1], id).toBeLessThan(counts[0])
            expect(counts[2], id).toBeLessThanOrEqual(counts[1])
        }
    })

    it('stays finite at the extremes', () => {
        for (const kind of ['column', 'barrel', 'paddle'] as const) {
            for (const changes of [{height: 0.1, thickness: 0.04, ribs: 0, arms: 8, pads: 1, spines: 1, flowers: 16}, {height: 14, thickness: 1.6, ribs: 30, ribDepth: 1, arms: 8, pads: 40, lean: 0.4, spines: 1, flowers: 16}]) {
                const position = buildCactus(presetCactus('saguaro', 'low-poly', {...changes, kind})).getAttribute('position')

                expect([...position.array].every(Number.isFinite), kind).toBe(true)
            }
        }
    })

    it('hides the style from the controls, since it is a switch over the view', () => {
        const keys = cactusGenerator.shownControls!(presetCactus('saguaro', 'low-poly').cactus as unknown as Record<string, unknown>).map((spec) => spec.key)

        expect(keys).not.toContain('build')
        expect(keys).toContain('ribs')
    })
})
