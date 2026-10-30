import {describe, expect, it} from 'vitest'
import {countTriangles} from '../assets/shared/geometry-utils'
import {spineKindOf} from '../assets/shared/spines'
import {getStyleProfile} from '../assets/style/style-profiles'
import {
    coconutClusterGenerator,
    type CoconutClusterParameters,
} from '../assets/trees/components/coconut-cluster'

const STYLE = getStyleProfile('low-poly')
const CONTEXT = {random: () => 0.5, seed: 1, style: STYLE}

function generate(overrides: Partial<CoconutClusterParameters> = {}, seed = 1) {
    const parameters = {...coconutClusterGenerator.createDefaultParameters(), ...overrides}

    return coconutClusterGenerator.generate(parameters, {...CONTEXT, seed})
}

describe('the coconut cluster', () => {
    it('builds a bunch of shells', () => {
        const part = generate()
        const position = part.geometry.getAttribute('position')

        expect(position.count).toBeGreaterThan(0)

        for (let index = 0; index < position.count; index++) {
            expect(Number.isFinite(position.getX(index))).toBe(true)
            expect(Number.isFinite(position.getY(index))).toBe(true)
            expect(Number.isFinite(position.getZ(index))).toBe(true)
        }

        expect(countTriangles(part.geometry)).toBeGreaterThan(0)
        expect(part.material).toBe('coconut')
    })

    it('stays inside its triangle budget', () => {
        expect(countTriangles(generate().geometry)).toBeLessThan(1200)
    })

    it('hangs everything below the origin', () => {
        const part = generate()
        const position = part.geometry.getAttribute('position')

        for (let index = 0; index < position.count; index++) {
            expect(position.getY(index)).toBeLessThanOrEqual(0)
        }
    })

    it('draws the same bunch from the same seed', () => {
        const first = Array.from(generate({}, 6).geometry.getAttribute('position').array)
        const second = Array.from(generate({}, 6).geometry.getAttribute('position').array)

        expect(first).toEqual(second)
    })

    it('moves the coconuts when the seed changes', () => {
        const first = Array.from(generate({}, 6).geometry.getAttribute('position').array)
        const second = Array.from(generate({}, 7).geometry.getAttribute('position').array)

        expect(first).not.toEqual(second)
    })

    it('adds a shell for each extra coconut', () => {
        expect(countTriangles(generate({count: 1}).geometry)).toBeLessThan(
            countTriangles(generate({count: 8}).geometry),
        )
    })

    it('spreads the coconuts further apart when it is asked to', () => {
        const tight = generate({spread: 0}).geometry
        const wide = generate({spread: 0.5}).geometry

        tight.computeBoundingBox()
        wide.computeBoundingBox()

        const tightWidth = tight.boundingBox!.max.x - tight.boundingBox!.min.x
        const wideWidth = wide.boundingBox!.max.x - wide.boundingBox!.min.x

        expect(wideWidth).toBeGreaterThan(tightWidth)
    })

    it('hangs the shells smaller when they are told to be', () => {
        const small = generate({size: 0.1}).geometry
        const large = generate({size: 0.4}).geometry

        small.computeBoundingBox()
        large.computeBoundingBox()

        expect(large.boundingBox!.min.y).toBeLessThan(small.boundingBox!.min.y)
    })

    it('has no spine to drag', () => {
        expect(spineKindOf('coconut-cluster')).toBeNull()
    })

    it('clamps rather than refuses', () => {
        const result = coconutClusterGenerator.validate({count: 0, size: 3, spread: -1})

        expect(result.valid).toBe(false)
        expect(result.parameters.count).toBe(1)
        expect(result.parameters.size).toBe(0.4)
        expect(result.parameters.spread).toBe(0)
    })

    it('never throws on rubbish', () => {
        expect(() => coconutClusterGenerator.validate(17)).not.toThrow()
        expect(() => coconutClusterGenerator.validate(null)).not.toThrow()
        expect(coconutClusterGenerator.validate(undefined).parameters.count).toBe(4)
    })

    it('takes its defaults from the specs', () => {
        const parameters = coconutClusterGenerator.createDefaultParameters()

        expect(parameters).toEqual({count: 4, size: 0.16, spread: 0.18})
    })
})
