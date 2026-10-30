import {describe, expect, it} from 'vitest'
import {
    growthDefaults,
    growthParameterSpecs,
    validateGrowthParameters,
    type GrowthParameters,
} from './parameters'

function numberSpec(key: string) {
    const spec = growthParameterSpecs.find((candidate) => candidate.key === key)

    if (!spec || spec.kind !== 'number') {
        throw new Error(`No number parameter ${key}`)
    }

    return spec
}

describe('growth parameters', () => {
    it('offers the documented defaults', () => {
        const expected: GrowthParameters = {
            height: 6,
            crownWidth: 4.5,
            crownShape: 'dome',
            irregularity: 0.3,
            interiorHollowing: 0.5,
            trunkRadius: 0.28,
            attractorCount: 2500,
            perceptionRadius: 0.55,
            killDistance: 0.18,
            stepLength: 0.22,
            limbStretch: 1.6,
            maxNodes: 4000,
            reachForLight: 0.45,
            droop: 0.15,
            pipeExponent: 2.3,
            minTwigRadius: 0.008,
            minTwigLength: 0.12,
            crownBaseFraction: 0.35,
        }

        expect(growthDefaults).toEqual(expected)

        // The defaults are what the inspector starts from, so every one of
        // them has to be reachable from a spec.
        expect(growthParameterSpecs.map((spec) => spec.key).sort()).toEqual(
            Object.keys(expected).sort(),
        )
    })

    it('describes every parameter for the inspector', () => {
        for (const spec of growthParameterSpecs) {
            expect(spec.label.length, spec.key).toBeGreaterThan(2)
            expect(spec.help, spec.key).toBeDefined()
            expect((spec.help ?? '').length, spec.key).toBeGreaterThan(20)

            if (spec.kind === 'number') {
                expect(spec.min, spec.key).toBeLessThan(spec.max)
                expect(spec.default, spec.key).toBeGreaterThanOrEqual(spec.min)
                expect(spec.default, spec.key).toBeLessThanOrEqual(spec.max)
                expect(spec.step, spec.key).toBeGreaterThan(0)
                expect(
                    (growthDefaults as unknown as Record<string, number>)[spec.key],
                    spec.key,
                ).toBeCloseTo(spec.default, 10)
            } else {
                expect(spec.options.length, spec.key).toBeGreaterThan(1)
                expect(
                    spec.options.some((option) => option.value === spec.default),
                    spec.key,
                ).toBe(true)
            }
        }
    })

    it('accepts its own defaults without changing anything', () => {
        const result = validateGrowthParameters(growthDefaults)

        expect(result.valid).toBe(true)
        expect(result.issues).toEqual([])
        expect(result.parameters).toEqual(growthDefaults)
    })

    it('clamps an out-of-range value and says so', () => {
        const result = validateGrowthParameters({...growthDefaults, height: 500, droop: -3})

        expect(result.parameters.height).toBe(numberSpec('height').max)
        expect(result.parameters.droop).toBe(0)
        expect(result.issues.map((issue) => issue.key).sort()).toEqual(['droop', 'height'])
        expect(result.valid).toBe(false)
    })

    it('replaces a value of the wrong kind with the default', () => {
        const result = validateGrowthParameters({...growthDefaults, height: 'tall'})

        expect(result.parameters.height).toBe(growthDefaults.height)
        expect(result.valid).toBe(false)
    })

    it('falls back to the first shape for a crown shape it does not know', () => {
        const result = validateGrowthParameters({...growthDefaults, crownShape: 'hourglass'})

        expect(result.parameters.crownShape).toBe('dome')
        expect(result.valid).toBe(false)
    })

    it('counts in whole numbers', () => {
        const result = validateGrowthParameters({
            ...growthDefaults,
            attractorCount: 2500.7,
            maxNodes: 999.4,
        })

        expect(result.parameters.attractorCount).toBe(2501)
        expect(result.parameters.maxNodes).toBe(999)
        expect(Number.isInteger(result.parameters.attractorCount)).toBe(true)
        expect(Number.isInteger(result.parameters.maxNodes)).toBe(true)
    })

    it('returns the defaults for something that is not an object at all', () => {
        for (const input of [undefined, null, 42, 'tree', []]) {
            const result = validateGrowthParameters(input)

            expect(result.parameters).toEqual(growthDefaults)
            expect(result.valid).toBe(false)
            expect(result.issues.length).toBeGreaterThan(0)
        }
    })
})
