import {describe, expect, it} from 'vitest'
import {getStyleProfile} from '../assets/style/style-profiles'
import {createSeededRandom, hashSeed} from '../assets/shared/random'
import {countTriangles} from '../assets/shared/geometry-utils'
import {branchingTreeGenerator} from '../assets/trees/branching-tree-generator'
import {generateTreeComponents} from '../assets/trees/tree-generators'
import {treePresets} from '../assets/trees/presets'
import {findComponentGenerator} from '../assets/trees/component-generators'

const STYLE = getStyleProfile('low-poly')

function generateAll(seed: number, style = STYLE) {
    const components = generateTreeComponents(
        'branching-tree',
        treePresets[0].parameters,
        seed,
        style,
    )

    return components.map((component) => {
        const generator = findComponentGenerator(component.generatorId)!
        const validated = generator.validate(component.parameters)
        const part = generator.generate(validated.parameters, {
            random: createSeededRandom(component.seed),
            seed: component.seed,
            style,
        })

        return {
            id: component.id,
            geometry: part.geometry,
            triangles: countTriangles(part.geometry),
        }
    })
}

describe('tree generator', () => {
    it('produces a complete tree', () => {
        const components = generateTreeComponents(
            'branching-tree',
            treePresets[0].parameters,
            12345,
            STYLE,
        )

        const types = new Set(components.map((component) => component.type))

        expect(types.has('trunk')).toBe(true)
        expect(types.has('branch')).toBe(true)
        expect(types.has('foliage-cluster')).toBe(true)
        expect(types.has('root')).toBe(true)
    })

    it('gives every component a unique id', () => {
        const components = generateTreeComponents(
            'branching-tree',
            treePresets[0].parameters,
            12345,
            STYLE,
        )

        const ids = new Set(components.map((component) => component.id))

        expect(ids.size).toBe(components.length)
    })

    it('attaches every component to something that exists', () => {
        const components = generateTreeComponents(
            'branching-tree',
            treePresets[0].parameters,
            12345,
            STYLE,
        )

        const ids = new Set(components.map((component) => component.id))

        for (const component of components) {
            if (component.parentId !== null) {
                expect(ids.has(component.parentId)).toBe(true)
            }
        }
    })

    it('produces the same geometry for the same seed', () => {
        const first = generateAll(12345)
        const second = generateAll(12345)

        expect(first.length).toBe(second.length)

        for (let i = 0; i < first.length; i++) {
            expect(first[i].id).toBe(second[i].id)
            expect(first[i].geometry.getAttribute('position').array).toEqual(
                second[i].geometry.getAttribute('position').array,
            )
        }
    })

    it('produces different geometry for different seeds', () => {
        const first = generateAll(1)
        const second = generateAll(2)

        const positions = (parts: ReturnType<typeof generateAll>) =>
            parts.map((part) => Array.from(part.geometry.getAttribute('position').array))

        expect(positions(first)).not.toEqual(positions(second))
    })

    it('keeps the same component count for different seeds', () => {
        expect(generateAll(1).length).toBe(generateAll(9999).length)
    })
})

describe('parameter validation', () => {
    it('rejects invalid values and falls back to the defaults', () => {
        const validated = branchingTreeGenerator.validate({
            height: 'tall',
            trunkRadius: null,
        })

        expect(validated.valid).toBe(false)
        expect(validated.parameters.height).toBe(
            branchingTreeGenerator.createDefaultParameters().height,
        )
    })

    it('clamps out-of-range values instead of rejecting them', () => {
        const validated = branchingTreeGenerator.validate({height: 500})

        expect(validated.parameters.height).toBe(12)
        expect(validated.issues.length).toBeGreaterThan(0)
    })

    it('falls back to the default for an unknown choice', () => {
        const validated = branchingTreeGenerator.validate({bend: 'sideways'})

        expect(validated.parameters.bend).toBe('curved')
    })

    it('leaves valid values alone', () => {
        const validated = branchingTreeGenerator.validate({height: 6, bend: 'straight'})

        expect(validated.valid).toBe(true)
        expect(validated.parameters.height).toBe(6)
        expect(validated.parameters.bend).toBe('straight')
    })
})

describe('geometry invariants', () => {
    it('never produces a broken tree, whatever the parameters', () => {
        for (let i = 0; i < 200; i++) {
            const seed = hashSeed(i, 7)

            const parameters = {
                height: 1 + (i % 12),
                trunkRadius: 0.05 + (i % 100) / 100,
                bend: ['straight', 'curved', 'very-curved'][i % 3],
                twist: -180 + (i % 360),
                branchCount: i % 40,
                branchLength: 0.3 + (i % 50) / 10,
                foliageCount: i % 60,
                foliageSize: 0.2 + (i % 30) / 10,
                foliageShape: 'round',
                rootCount: i % 12,
            }

            const components = generateTreeComponents('branching-tree', parameters, seed, STYLE)

            expect(components.length).toBeGreaterThan(0)

            for (const component of components) {
                const generator = findComponentGenerator(component.generatorId)!
                const validated = generator.validate(component.parameters)
                const part = generator.generate(validated.parameters, {
                    random: createSeededRandom(component.seed),
                    seed: component.seed,
                    style: STYLE,
                })

                const position = part.geometry.getAttribute('position')

                expect(position.count).toBeGreaterThan(0)

                for (let v = 0; v < position.array.length; v++) {
                    expect(Number.isFinite(position.array[v])).toBe(true)
                }

                expect(countTriangles(part.geometry)).toBeGreaterThan(0)
            }
        }
    }, 60000)

    it('holds up across ten thousand parameter sets', () => {
        for (let i = 0; i < 10000; i++) {
            const parameters = {
                height: 1 + (i % 1200) / 100,
                trunkRadius: 0.05 + (i % 115) / 100,
                bend: ['straight', 'curved', 'very-curved'][i % 3],
                twist: -180 + (i % 360),
                branchCount: i % 40,
                branchLength: 0.3 + (i % 570) / 100,
                foliageCount: i % 60,
                foliageSize: 0.2 + (i % 230) / 100,
                foliageShape: ['round', 'oval', 'flat', 'tall', 'irregular', 'layered'][i % 6],
                rootCount: i % 12,
            }

            const components = generateTreeComponents(
                'branching-tree',
                parameters,
                hashSeed(i, 13),
                STYLE,
            )

            expect(components.length).toBeGreaterThan(0)

            for (const component of components) {
                const generator = findComponentGenerator(component.generatorId)!
                const validated = generator.validate(component.parameters)

                expect(validated.parameters).toBeDefined()

                for (const value of Object.values(validated.parameters)) {
                    if (typeof value === 'number') {
                        expect(Number.isFinite(value)).toBe(true)
                    }
                }
            }
        }
    }, 60000)

    it('stays inside a sane face budget', () => {
        const components = generateTreeComponents(
            'branching-tree',
            treePresets[0].parameters,
            12345,
            STYLE,
        )

        let triangles = 0

        for (const component of components) {
            const generator = findComponentGenerator(component.generatorId)!
            const validated = generator.validate(component.parameters)
            const part = generator.generate(validated.parameters, {
                random: createSeededRandom(component.seed),
                seed: component.seed,
                style: STYLE,
            })

            triangles += countTriangles(part.geometry)
        }

        expect(triangles).toBeGreaterThan(0)
        expect(triangles).toBeLessThan(STYLE.polygonBudget * 4)
    })
})

describe('style profiles', () => {
    it('keeps the same tree structure in both styles', () => {
        const lowPoly = generateTreeComponents(
            'branching-tree',
            treePresets[0].parameters,
            12345,
            getStyleProfile('low-poly'),
        )

        const detailed = generateTreeComponents(
            'branching-tree',
            treePresets[0].parameters,
            12345,
            getStyleProfile('detailed'),
        )

        expect(detailed.map((component) => component.id)).toEqual(
            lowPoly.map((component) => component.id),
        )
    })

    it('makes the detailed style heavier', () => {
        const lowPoly = generateAll(12345, getStyleProfile('low-poly'))
        const detailed = generateAll(12345, getStyleProfile('detailed'))

        const total = (parts: ReturnType<typeof generateAll>) =>
            parts.reduce((sum, part) => sum + part.triangles, 0)

        expect(total(detailed)).toBeGreaterThan(total(lowPoly))
    })
})
