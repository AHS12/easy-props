import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import type {SceneComponent} from '../assets/shared/component-types'
import type {GenerationContext, PartGenerator} from '../assets/shared/generator-types'
import type {ValidationIssue} from '../assets/shared/parameters'
import {buildSpinePoints, countTriangles} from '../assets/shared/geometry-utils'
import {createSeededRandom} from '../assets/shared/random'
import {getStyleProfile} from '../assets/style/style-profiles'
import {palmTreeGenerator} from '../assets/trees/palm-tree-generator'
import {findTreeGenerator, generateTreeComponents} from '../assets/trees/tree-generators'
import {findPreset, treePresets} from '../assets/trees/presets'
import {palmTrunkGenerator} from '../assets/trees/components/palm-trunk'
import {palmCrownGenerator} from '../assets/trees/components/palm-crown'
import {palmFrondGenerator} from '../assets/trees/components/palm-frond'
import {coconutClusterGenerator} from '../assets/trees/components/coconut-cluster'

const STYLE = getStyleProfile('low-poly')
const COCONUT_PALM = findPreset('coconut-palm')!
const TROPICAL_PALM = findPreset('tropical-palm')!

function generatePalm(
    parameters: Readonly<Record<string, unknown>> = COCONUT_PALM.parameters,
    seed = COCONUT_PALM.seed,
    style = STYLE,
): readonly SceneComponent[] {
    return generateTreeComponents('palm-tree', parameters, seed, style)
}

function ofType(
    components: readonly SceneComponent[],
    type: SceneComponent['type'],
): readonly SceneComponent[] {
    return components.filter((component) => component.type === type)
}

function frondsOf(components: readonly SceneComponent[]): readonly SceneComponent[] {
    return ofType(components, 'palm-frond')
}

/**
 * A part's spine and pushes come back from the schema as fresh arrays, so
 * validation calls them reset even when every value is unchanged. Those two
 * are compared by value instead; everything else has to survive untouched.
 */
const ARRAY_KEYS = new Set(['spine', 'pushes'])

function realIssues(issues: readonly ValidationIssue[]): readonly ValidationIssue[] {
    return issues.filter((issue) => !ARRAY_KEYS.has(issue.key))
}

/**
 * Hands one component to the generator that builds it.
 *
 * The palm parts are looked up here rather than through the component
 * registry, so this test says what a palm is made of whether or not the
 * editor has been wired up for those parts yet.
 */
function checkPart(component: SceneComponent, style = STYLE) {
    const context = {random: createSeededRandom(component.seed), seed: component.seed, style}

    switch (component.generatorId) {
        case palmTrunkGenerator.id:
            return runPart(palmTrunkGenerator, component, context)

        case palmCrownGenerator.id:
            return runPart(palmCrownGenerator, component, context)

        case palmFrondGenerator.id:
            return runPart(palmFrondGenerator, component, context)

        case coconutClusterGenerator.id:
            return runPart(coconutClusterGenerator, component, context)

        default:
            throw new Error(`Not a palm part: ${component.generatorId}`)
    }
}

function runPart<P extends object>(
    generator: PartGenerator<P>,
    component: SceneComponent,
    context: GenerationContext,
) {
    const validated = generator.validate(component.parameters)
    const part = generator.generate(validated.parameters, context)

    return {
        issues: validated.issues,
        parameters: validated.parameters as Readonly<Record<string, unknown>>,
        triangles: countTriangles(part.geometry),
    }
}

function trianglesOf(components: readonly SceneComponent[], style = STYLE): number {
    return components.reduce((total, component) => total + checkPart(component, style).triangles, 0)
}

describe('the palm tree', () => {
    it('assembles a trunk, one crown, a ring of fronds and a bunch of coconuts', () => {
        const components = generatePalm()
        const fronds = Number(COCONUT_PALM.parameters.frondCount)

        expect(ofType(components, 'trunk')).toHaveLength(1)
        expect(ofType(components, 'palm-crown')).toHaveLength(1)
        expect(frondsOf(components)).toHaveLength(fronds)
        expect(ofType(components, 'coconut-cluster')).toHaveLength(1)
        expect(components).toHaveLength(fronds + 3)
    })

    it('gives every component an id of its own', () => {
        const components = generatePalm()
        const ids = new Set(components.map((component) => component.id))

        expect(ids.size).toBe(components.length)
    })

    it('attaches every component to something that exists', () => {
        const components = generatePalm()
        const ids = new Set(components.map((component) => component.id))

        for (const component of components) {
            if (component.parentId !== null) {
                expect(ids.has(component.parentId)).toBe(true)
            }
        }
    })

    it('hangs the crown off the trunk and the fronds and coconuts off the crown', () => {
        const components = generatePalm()
        const trunk = ofType(components, 'trunk')[0]
        const crown = ofType(components, 'palm-crown')[0]

        expect(trunk.parentId).toBeNull()
        expect(crown.parentId).toBe(trunk.id)

        for (const part of [
            ...frondsOf(components),
            ...ofType(components, 'coconut-cluster'),
        ]) {
            expect(part.parentId).toBe(crown.id)
        }
    })

    it('names the parts the way the editor looks them up', () => {
        const components = generatePalm()

        expect(ofType(components, 'trunk')[0].generatorId).toBe('palm-trunk')
        expect(ofType(components, 'palm-crown')[0].generatorId).toBe('palm-crown')
        expect(frondsOf(components)[0].generatorId).toBe('palm-frond')
        expect(ofType(components, 'coconut-cluster')[0].generatorId).toBe('coconut-cluster')
    })

    it('sits the crown on the trunk tip, wherever the trunk bends to', () => {
        const components = generatePalm({...COCONUT_PALM.parameters, bend: 'curved', twist: 40})
        const trunk = ofType(components, 'trunk')[0]
        const crown = ofType(components, 'palm-crown')[0]

        const parameters = palmTrunkGenerator.validate(trunk.parameters).parameters
        const spine = buildSpinePoints(parameters.spine, parameters.height, parameters.twist)
        const tip = spine[spine.length - 1]

        expect(crown.transform.position).not.toEqual([0, parameters.height, 0])

        const distance = new THREE.Vector3(...crown.transform.position).distanceTo(tip)

        expect(distance).toBeLessThan(0.01)

        for (const frond of frondsOf(components)) {
            expect(frond.transform.position).toEqual(crown.transform.position)
        }
    })

    it('stands a straight palm up the middle', () => {
        const components = generatePalm({...COCONUT_PALM.parameters, bend: 'straight'})
        const crown = ofType(components, 'palm-crown')[0]
        const height = Number(COCONUT_PALM.parameters.height)

        expect(crown.transform.position[0]).toBeCloseTo(0, 6)
        expect(crown.transform.position[1]).toBeCloseTo(height, 6)
        expect(crown.transform.position[2]).toBeCloseTo(0, 6)
    })

    it('puts the coconuts below the crown', () => {
        const components = generatePalm()
        const crown = ofType(components, 'palm-crown')[0]
        const coconut = ofType(components, 'coconut-cluster')[0]

        expect(coconut.parentId).toBe(crown.id)
        expect(coconut.transform.position[1]).toBeLessThan(crown.transform.position[1])
    })

    it('builds the same palm from the same seed', () => {
        const first = generatePalm()
        const second = generatePalm()

        expect(first.map((component) => component.id)).toEqual(
            second.map((component) => component.id),
        )
        expect(first.map((component) => component.seed)).toEqual(
            second.map((component) => component.seed),
        )
        expect(first.map((component) => component.transform)).toEqual(
            second.map((component) => component.transform),
        )
    })

    it('swings the fronds about for a different seed and keeps the same parts', () => {
        const first = generatePalm()
        const second = generatePalm(COCONUT_PALM.parameters, COCONUT_PALM.seed + 11)

        const rotations = (components: readonly SceneComponent[]) =>
            frondsOf(components).map((component) => component.transform.rotation)

        expect(second.map((component) => component.id)).toEqual(
            first.map((component) => component.id),
        )
        expect(rotations(second)).not.toEqual(rotations(first))
    })

    it('drops the coconuts when there are none and changes nothing else', () => {
        const withCoconuts = generatePalm({...COCONUT_PALM.parameters, coconutCount: 4})
        const without = generatePalm({...COCONUT_PALM.parameters, coconutCount: 0})

        const others = (components: readonly SceneComponent[]) =>
            components.filter((component) => component.type !== 'coconut-cluster')

        expect(ofType(without, 'coconut-cluster')).toHaveLength(0)
        expect(withCoconuts.map((component) => component.id)).toContain('cmp-coconut-0')

        expect(others(without).map((component) => component.id)).toEqual(
            others(withCoconuts).map((component) => component.id),
        )
        expect(others(without).map((component) => component.transform)).toEqual(
            others(withCoconuts).map((component) => component.transform),
        )
        expect(others(without).map((component) => component.seed)).toEqual(
            others(withCoconuts).map((component) => component.seed),
        )
    })

    it('hands every part to its own generator without changing a value', () => {
        for (const component of generatePalm()) {
            const checked = checkPart(component)

            expect(realIssues(checked.issues)).toHaveLength(0)
            expect(checked.parameters).toEqual(component.parameters)
            expect(checked.triangles).toBeGreaterThan(0)
        }
    })

    it('stays inside the triangle budget at the defaults', () => {
        const components = generatePalm(palmTreeGenerator.createDefaultParameters())
        const triangles = trianglesOf(components)

        expect(ofType(components, 'trunk')).toHaveLength(1)
        expect(triangles).toBeGreaterThan(0)
        expect(triangles).toBeLessThan(6000)
    })
})

describe('palm parameter validation', () => {
    it('clamps a height beyond reason and says so', () => {
        const validated = palmTreeGenerator.validate({height: 500})

        expect(validated.valid).toBe(false)
        expect(validated.parameters.height).toBe(18)
        expect(validated.issues.map((issue) => issue.key)).toContain('height')
    })

    it('falls back to the defaults for junk', () => {
        const defaults = palmTreeGenerator.createDefaultParameters()

        const validated = palmTreeGenerator.validate({
            height: 'tall',
            frondCount: null,
            bend: 'sideways',
        })

        expect(validated.valid).toBe(false)
        expect(validated.parameters.height).toBe(defaults.height)
        expect(validated.parameters.frondCount).toBe(defaults.frondCount)
        expect(validated.parameters.bend).toBe(defaults.bend)
    })

    it('never throws, whatever it is handed', () => {
        expect(() => palmTreeGenerator.validate(null)).not.toThrow()
        expect(() => palmTreeGenerator.validate(17)).not.toThrow()
        expect(() => palmTreeGenerator.validate({coconutCount: 'none'})).not.toThrow()
    })

    it('leaves sound values alone', () => {
        const validated = palmTreeGenerator.validate({
            height: 12,
            trunkRadius: 0.5,
            taper: 0.5,
            bend: 'straight',
            twist: 30,
            rings: 10,
            ringDepth: 0.1,
            crownSize: 0.6,
            frondCount: 12,
            frondLength: 3.4,
            frondArch: 'drooping',
            leaflets: 20,
            coconutCount: 3,
            coconutSize: 0.2,
        })

        expect(validated.valid).toBe(true)
        expect(validated.issues).toHaveLength(0)
        expect(validated.parameters).toEqual({
            height: 12,
            trunkRadius: 0.5,
            taper: 0.5,
            bend: 'straight',
            twist: 30,
            rings: 10,
            ringDepth: 0.1,
            crownSize: 0.6,
            frondCount: 12,
            frondLength: 3.4,
            frondArch: 'drooping',
            leaflets: 20,
            coconutCount: 3,
            coconutSize: 0.2,
        })
    })

    it('offers the controls a palm needs, in the order a panel shows them', () => {
        expect(palmTreeGenerator.id).toBe('palm-tree')
        expect(palmTreeGenerator.version).toBe(1)
        expect(palmTreeGenerator.label).toBe('Palm')
        expect(palmTreeGenerator.parameters.map((spec) => spec.key)).toEqual([
            'height',
            'trunkRadius',
            'taper',
            'bend',
            'twist',
            'rings',
            'ringDepth',
            'crownSize',
            'frondCount',
            'frondLength',
            'frondArch',
            'leaflets',
            'coconutCount',
            'coconutSize',
        ])
    })

    it('is in the registry under its own name', () => {
        expect(findTreeGenerator('palm-tree')).toBe(palmTreeGenerator)
    })
})

describe('the palm presets', () => {
    it('keeps the five broadleaf presets where they were', () => {
        expect(treePresets[0].id).toBe('round-canopy')
        expect(findPreset('coconut-palm')).toBeDefined()
        expect(findPreset('tropical-palm')).toBeDefined()
    })

    it('generates a complete palm from each one', () => {
        for (const preset of [COCONUT_PALM, TROPICAL_PALM]) {
            const validated = palmTreeGenerator.validate(preset.parameters)
            const components = generatePalm(preset.parameters, preset.seed)

            expect(preset.generatorId).toBe('palm-tree')
            expect(validated.issues).toHaveLength(0)
            expect(ofType(components, 'trunk')).toHaveLength(1)
            expect(ofType(components, 'palm-crown')).toHaveLength(1)
            expect(frondsOf(components)).toHaveLength(validated.parameters.frondCount)
            expect(ofType(components, 'coconut-cluster')).toHaveLength(
                validated.parameters.coconutCount > 0 ? 1 : 0,
            )

            for (const component of components) {
                const checked = checkPart(component)

                expect(realIssues(checked.issues)).toHaveLength(0)
                expect(checked.triangles).toBeGreaterThan(0)
            }
        }
    })

    it('gives the coconut palm coconuts and the tropical palm none', () => {
        const coconut = generatePalm(COCONUT_PALM.parameters, COCONUT_PALM.seed)
        const tropical = generatePalm(TROPICAL_PALM.parameters, TROPICAL_PALM.seed)

        expect(ofType(coconut, 'coconut-cluster')).toHaveLength(1)
        expect(ofType(tropical, 'coconut-cluster')).toHaveLength(0)
        expect(trianglesOf(tropical)).toBeLessThan(6000)
    })
})
