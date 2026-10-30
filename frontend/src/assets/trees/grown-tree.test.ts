import {describe, expect, it} from 'vitest'
import type {StyleProfile} from '../style/style-profiles'
import {createSeededRandom} from '../shared/random'
import {findComponentGenerator} from './component-generators'
import {findTreeGenerator} from './tree-generators'
import {findPreset} from './presets'
import {grownBarkGenerator} from './components/grown-bark'
import {grownTreeGenerator} from './grown-tree-generator'
import {growthDefaults, growthParameterSpecs, validateGrowthParameters} from './growth'

const STYLE: StyleProfile = {
    id: 'low-poly',
    label: 'Low poly',
    radialSegments: 5,
    heightSegments: 4,
    flatShading: true,
    foliageDetail: 'simple',
    barkDetail: 'smooth',
    polygonBudget: 20000,
}

const contextOf = (seed: number) => ({
    random: createSeededRandom(seed),
    seed,
    style: STYLE,
})

/** A cheap fingerprint of a position buffer, for comparing two generations. */
function hashPositions(positions: ArrayLike<number>): number {
    let hash = 0x811c9dc5

    for (let i = 0; i < positions.length; i++) {
        hash ^= Math.round(positions[i] * 1e6) | 0
        hash = Math.imul(hash, 0x01000193)
    }

    return hash >>> 0
}

describe('the grown tree', () => {
    it('is registered as a tree and as a part', () => {
        expect(findTreeGenerator('grown-tree')).toBe(grownTreeGenerator)
        expect(findComponentGenerator('grown-bark')).toBe(grownBarkGenerator)
    })

    it('builds the whole tree as one bark part', () => {
        const parameters = grownTreeGenerator.validate(growthDefaults)
        const components = grownTreeGenerator.generate(parameters.parameters, contextOf(1234))

        expect(components).toHaveLength(1)
        expect(components[0].type).toBe('bark')
        expect(components[0].generatorId).toBe('grown-bark')
        expect(components[0].slot).toBe('bark')
        expect(components[0].parentId).toBeNull()
    })

    it('gives the same tree for the same seed, and a different one otherwise', () => {
        const parameters = validateGrowthParameters(growthDefaults).parameters
        const first = grownTreeGenerator.generate(parameters, contextOf(99))
        const again = grownTreeGenerator.generate(parameters, contextOf(99))
        const other = grownTreeGenerator.generate(parameters, contextOf(100))

        expect(JSON.stringify(again)).toBe(JSON.stringify(first))
        expect(JSON.stringify(other)).not.toBe(JSON.stringify(first))
    })

    it('sweeps one clean surface over the skeleton', () => {
        const parameters = grownBarkGenerator.validate({
            growth: growthDefaults,
            seed: 4321,
        }).parameters

        const {geometry, material} = grownBarkGenerator.generate(parameters, contextOf(4321))
        const position = geometry.getAttribute('position')

        expect(material).toBe('bark')
        expect(position.count).toBeGreaterThan(1000)
        expect(geometry.getIndex()?.count ?? 0).toBeGreaterThan(0)
        expect((geometry.getIndex()?.count ?? 0) % 3).toBe(0)

        for (let i = 0; i < position.count * 3; i++) {
            expect(Number.isFinite(position.array[i])).toBe(true)
        }

        // The triangle budget the growth tests hold, checked through the
        // generator the app actually calls.
        expect((geometry.getIndex()?.count ?? 0) / 3).toBeLessThan(60000)
    })

    it('sweeps the same surface twice', () => {
        const parameters = grownBarkGenerator.validate({growth: growthDefaults, seed: 77}).parameters
        const first = grownBarkGenerator.generate(parameters, contextOf(77)).geometry
        const second = grownBarkGenerator.generate(parameters, contextOf(77)).geometry

        expect(hashPositions(second.getAttribute('position').array)).toBe(
            hashPositions(first.getAttribute('position').array),
        )
    })

    it('leaves a grown tree with nothing selected to drag yet', () => {
        // Handles arrive with skeleton editing: the dots must move the
        // skeleton, or its children would be left behind.
        expect(grownBarkGenerator.parameters).toHaveLength(0)
    })
})

describe('the grown oak preset', () => {
    it('exists and points at the grown tree', () => {
        const preset = findPreset('grown-oak')

        expect(preset).toBeDefined()
        expect(preset?.generatorId).toBe('grown-tree')
    })

    it('ships parameters the generator accepts without changing them', () => {
        const preset = findPreset('grown-oak')
        const validated = validateGrowthParameters(preset?.parameters)

        expect(validated.parameters).toEqual(growthDefaults)
    })

    it('offers every growth control to the inspector', () => {
        expect(growthParameterSpecs.map((spec) => spec.key)).toEqual([
            'height',
            'crownWidth',
            'crownShape',
            'irregularity',
            'trunkRadius',
            'attractorCount',
            'perceptionRadius',
            'killDistance',
            'stepLength',
            'maxNodes',
            'reachForLight',
            'droop',
            'pipeExponent',
            'minTwigRadius',
            'crownBaseFraction',
        ])
        expect(findTreeGenerator('grown-tree')?.parameters).toBe(growthParameterSpecs)
    })
})
