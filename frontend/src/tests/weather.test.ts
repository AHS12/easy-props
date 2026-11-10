import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {findComponentGenerator} from '../assets/component-generators'
import {findPropGenerator, generatePropComponents} from '../assets/prop-generators'
import type {GeneratedPart} from '../assets/shared/generator-types'
import {createSeededRandom} from '../assets/shared/random'
import {snowCover, weatherPaint} from '../assets/shared/weather'
import {getStyleProfile} from '../assets/style/style-profiles'
import {findPreset} from '../assets/trees/presets'

const STYLE = getStyleProfile('detailed')

/** One preset of every kind of prop, light enough to build quickly. */
const PRESETS = ['sapling', 'field-stone', 'small-bush', 'golden-barrel', 'grass-tuft', 'daisies']

function partsOf(presetId: string, changes: Record<string, unknown> = {}, detail = 0.5): GeneratedPart[] {
    const preset = findPreset(presetId)!
    const generator = findPropGenerator(preset.generatorId)!
    const parameters = generator.validate({...preset.parameters, ...changes}).parameters as Record<string, unknown>

    return generatePropComponents(preset.generatorId, parameters, preset.seed, STYLE).flatMap((component) => {
        const part = findComponentGenerator(component.generatorId)!
        const built = part.generate(part.validate(component.parameters).parameters, {
            random: createSeededRandom(component.seed),
            seed: component.seed,
            style: STYLE,
            detail,
        })

        return built.surface?.proxy ? [] : [built]
    })
}

const values = (parts: GeneratedPart[], name: string) =>
    parts.flatMap((part) => Array.from((part.geometry.getAttribute(name)?.array as ArrayLike<number> | undefined) ?? []))

/** How bright the points facing mostly up are, and the rest. */
function brightness(parts: GeneratedPart[]): {up: number; all: number} {
    let up = 0
    let upCount = 0
    let all = 0

    for (const part of parts) {
        const colour = part.geometry.getAttribute('color')
        const normal = part.geometry.getAttribute('normal')

        for (let i = 0; i < colour.count; i++) {
            const value = (colour.getX(i) + colour.getY(i) + colour.getZ(i)) / 3

            all += value

            if (normal.getY(i) > 0.7) {
                up += value
                upCount++
            }
        }
    }

    const count = parts.reduce((sum, part) => sum + part.geometry.getAttribute('color').count, 0)

    return {up: up / Math.max(upCount, 1), all: all / count}
}

describe('weather', () => {
    it.each(PRESETS)('%s offers Snow and Wet, both starting at nothing', (id) => {
        const generator = findPropGenerator(findPreset(id)!.generatorId)!
        const keys = generator.parameters.map((spec) => spec.key)

        expect(keys).toEqual(expect.arrayContaining(['snow', 'wet']))
        expect(generator.validate({}).parameters).toMatchObject({snow: 0, wet: 0})
    })

    it.each(PRESETS)('%s comes out the same when saved before there was weather', (id) => {
        const preset = findPreset(id)!
        const before = Object.fromEntries(Object.entries(preset.parameters).filter(([key]) => !['snow', 'wet', 'mossFrom'].includes(key)))
        const saved = partsOf(id, before)
        const now = partsOf(id)

        expect(values(saved, 'position')).toEqual(values(now, 'position'))
        expect(values(saved, 'color')).toEqual(values(now, 'color'))
        expect(saved.map((part) => part.surface?.roughness)).toEqual(now.map(() => undefined))
    })

    it.each(PRESETS)('%s takes snow on its tops without changing its shape', (id) => {
        const dry = partsOf(id)
        const snowy = partsOf(id, {snow: 0.8})

        // Colour only: leaves still sway as they did, and nothing costs a face.
        expect(values(snowy, 'position')).toEqual(values(dry, 'position'))
        expect(brightness(snowy).up).toBeGreaterThan(brightness(dry).up + 0.05)
    })

    it.each(PRESETS)('%s is darker and shinier when wet', (id) => {
        const dry = partsOf(id)
        const wet = partsOf(id, {wet: 1})

        expect(values(wet, 'position')).toEqual(values(dry, 'position'))
        expect(brightness(wet).all).toBeLessThan(brightness(dry).all * 0.8)

        for (const part of wet) {
            expect(part.surface?.roughness).toBeLessThan(0.6)
        }
    })

    it.each(['sapling', 'field-stone', 'small-bush', 'grass-tuft'])('%s takes snow in Low-poly too, one colour to a face', (id) => {
        const dry = partsOf(id, {build: 'low-poly'})
        const snowy = partsOf(id, {build: 'low-poly', snow: 0.8})

        expect(values(snowy, 'position')).toEqual(values(dry, 'position'))
        expect(brightness(snowy).up).toBeGreaterThan(brightness(dry).up + 0.05)
    })

    it('keeps the snow on a lighter level', () => {
        const light = partsOf('field-stone', {snow: 0.8}, 0.15)
        const dry = partsOf('field-stone', {}, 0.15)

        expect(brightness(light).up).toBeGreaterThan(brightness(dry).up + 0.05)
    })

    it('grows moss on one side of a rock when asked, and on top as before', () => {
        const onTop = partsOf('field-stone', {moss: 0.6})
        const said = partsOf('field-stone', {moss: 0.6, mossFrom: 'sky'})
        const side = partsOf('field-stone', {moss: 0.6, mossFrom: 'shade'})

        expect(values(said, 'color')).toEqual(values(onTop, 'color'))
        expect(values(side, 'color')).not.toEqual(values(onTop, 'color'))
    })

    it('grows moss on one side of a trunk when asked', () => {
        const onTop = partsOf('sapling', {moss: 0.8})
        const side = partsOf('sapling', {moss: 0.8, mossFrom: 'shade'})

        expect(values(side, 'color')).not.toEqual(values(onTop, 'color'))
    })

    it('lays snow thickest on flat tops and none underneath', () => {
        expect(snowCover(1, 0.5)).toBe(1)
        expect(snowCover(-1, 1)).toBe(0)
        expect(snowCover(1, 0)).toBe(0)
        expect(snowCover(0.5, 0.3)).toBeLessThan(snowCover(0.5, 0.9))
    })

    it('leaves snow white on a wet prop', () => {
        const colour = weatherPaint(new THREE.Color('#556b2f'), 1, {snow: 1, wet: 1})

        expect(Math.min(colour.r, colour.g, colour.b)).toBeGreaterThan(0.8)
    })
})
