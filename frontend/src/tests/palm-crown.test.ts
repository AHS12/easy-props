import {describe, expect, it} from 'vitest'
import type * as THREE from 'three'
import {countTriangles} from '../assets/shared/geometry-utils'
import {getStyleProfile} from '../assets/style/style-profiles'
import {palmCrownGenerator} from '../assets/trees/components/palm-crown'

const STYLE = getStyleProfile('low-poly')
const CONTEXT = {random: () => 0.5, seed: 7, style: STYLE}

function generate(
    overrides: Record<string, unknown> = {},
    context: typeof CONTEXT = CONTEXT,
): THREE.BufferGeometry {
    const defaults = palmCrownGenerator.createDefaultParameters() as unknown as Record<
        string,
        unknown
    >
    const parameters = palmCrownGenerator.validate({...defaults, ...overrides}).parameters

    return palmCrownGenerator.generate(parameters, context).geometry
}

function positions(geometry: THREE.BufferGeometry): number[] {
    return Array.from(geometry.getAttribute('position').array)
}

function verticalRange(geometry: THREE.BufferGeometry): {min: number; max: number} {
    const position = geometry.getAttribute('position')
    let min = Infinity
    let max = -Infinity

    for (let index = 0; index < position.count; index++) {
        const y = position.getY(index)

        min = Math.min(min, y)
        max = Math.max(max, y)
    }

    return {min, max}
}

describe('palm crown', () => {
    it('draws a solid crown of pale bark', () => {
        const part = palmCrownGenerator.generate(
            palmCrownGenerator.createDefaultParameters(),
            CONTEXT,
        )

        const position = part.geometry.getAttribute('position')

        expect(part.material).toBe('bark-light')
        expect(position.count).toBeGreaterThan(0)
        expect(countTriangles(part.geometry)).toBeGreaterThan(0)

        for (let index = 0; index < position.array.length; index++) {
            expect(Number.isFinite(position.array[index])).toBe(true)
        }
    })

    it('draws the same crown from the same parameters', () => {
        expect(positions(generate())).toEqual(positions(generate()))
    })

    it('draws a different crown from a different seed', () => {
        const first = positions(generate({}, {...CONTEXT, seed: 7}))
        const second = positions(generate({}, {...CONTEXT, seed: 8}))

        expect(first).not.toEqual(second)
    })

    it('stays inside the low-poly budget at the default parameters', () => {
        expect(countTriangles(generate())).toBeLessThan(2500)
    })

    it('sits centred on the origin inside half its size either way', () => {
        const size = 0.42
        const {min, max} = verticalRange(generate())

        expect(min).toBeGreaterThanOrEqual(-size / 2 - 1e-6)
        expect(max).toBeLessThanOrEqual(size / 2 + 1e-6)
        expect(max - min).toBeGreaterThan(size * 0.8)
        expect(Math.abs((max + min) / 2)).toBeLessThan(size * 0.1)
    })

    it('adds a bulge for every lobe', () => {
        expect(countTriangles(generate({lobes: 0}))).toBeLessThan(
            countTriangles(generate({lobes: 6})),
        )
    })
})

describe('palm crown validation', () => {
    it('clamps values that are out of range and reports them', () => {
        const validated = palmCrownGenerator.validate({size: 5, spread: -2, lobes: 40})

        expect(validated.parameters.size).toBe(1.2)
        expect(validated.parameters.spread).toBe(0.05)
        expect(validated.parameters.lobes).toBe(12)

        const keys = validated.issues.map((issue) => issue.key)

        expect(keys).toContain('size')
        expect(keys).toContain('spread')
        expect(keys).toContain('lobes')
    })

    it('falls back to the defaults when the values make no sense', () => {
        const defaults = palmCrownGenerator.createDefaultParameters()

        const validated = palmCrownGenerator.validate({size: 'big', lobes: 'many'})

        expect(validated.valid).toBe(false)
        expect(validated.parameters.size).toBe(defaults.size)
        expect(validated.parameters.lobes).toBe(defaults.lobes)
    })

    it('leaves sound values untouched', () => {
        const validated = palmCrownGenerator.validate({size: 0.6, spread: 0.5, lobes: 9})

        expect(validated.issues).toHaveLength(0)
        expect(validated.valid).toBe(true)
        expect(validated.parameters.size).toBe(0.6)
        expect(validated.parameters.spread).toBe(0.5)
        expect(validated.parameters.lobes).toBe(9)
    })
})
