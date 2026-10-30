import {describe, expect, it} from 'vitest'
import {createSeededRandom, hashSeed} from '../../shared/random'
import {sampleAttractors} from './envelope'
import {growthDefaults, type GrowthParameters} from './parameters'

function sample(parameters: GrowthParameters, seed = 7) {
    return sampleAttractors(parameters, createSeededRandom(hashSeed(seed, 99)))
}

function radial(point: readonly [number, number, number]): number {
    return Math.hypot(point[0], point[2])
}

describe('crown envelope', () => {
    it('returns exactly the number of points that was asked for', () => {
        expect(sample({...growthDefaults, attractorCount: 100})).toHaveLength(100)
        expect(sample({...growthDefaults, attractorCount: 2500})).toHaveLength(2500)
        expect(sample({...growthDefaults, attractorCount: 20000})).toHaveLength(20000)
        expect(sample({...growthDefaults, attractorCount: 0})).toHaveLength(0)
    })

    it('keeps every point inside the crown and free of NaN', () => {
        const base = growthDefaults.crownBaseFraction * growthDefaults.height
        const radius = growthDefaults.crownWidth / 2

        for (const shape of ['dome', 'ellipsoid', 'cone', 'irregular'] as const) {
            const points = sample({...growthDefaults, crownShape: shape, irregularity: 1})

            expect(points.length).toBeGreaterThan(0)

            for (const point of points) {
                for (const value of point) {
                    expect(Number.isFinite(value), shape).toBe(true)
                }

                expect(point[1], shape).toBeGreaterThanOrEqual(base - 1e-9)
                expect(point[1], shape).toBeLessThanOrEqual(growthDefaults.height + 1e-9)
                expect(radial(point), shape).toBeLessThanOrEqual(radius + 1e-9)
            }
        }
    })

    it('is concentrated where each shape is widest', () => {
        const points = sample(growthDefaults)
        const reach = growthDefaults.crownWidth / 2
        const base = growthDefaults.crownBaseFraction * growthDefaults.height

        // The dome is heavy at the bottom and narrow where the trunk top is,
        // which is what gives a broadleaf tree its low, wide crown.
        const bottom = points.filter((point) => point[1] < base + 0.3)
        const shoulder = points.filter(
            (point) => point[1] > base + 0.4 && point[1] < base + 1.6,
        )

        expect(bottom.length).toBeGreaterThan(0)
        expect(shoulder.length).toBeGreaterThan(0)

        const meanBottom = bottom.reduce((sum, point) => sum + radial(point), 0) / bottom.length
        const meanShoulder =
            shoulder.reduce((sum, point) => sum + radial(point), 0) / shoulder.length

        expect(meanShoulder).toBeGreaterThan(meanBottom)
        expect(meanShoulder / reach).toBeGreaterThan(0.4)

        // A cone narrows as it rises: its top slice is thinner than its foot.
        const cone = sample({...growthDefaults, crownShape: 'cone'})
        const top = cone.filter((point) => point[1] > base + (growthDefaults.height - base) * 0.7)
        const foot = cone.filter((point) => point[1] < base + (growthDefaults.height - base) * 0.3)

        expect(top.length).toBeGreaterThan(0)
        expect(foot.length).toBeGreaterThan(0)

        const meanTop = top.reduce((sum, point) => sum + radial(point), 0) / top.length
        const meanFoot = foot.reduce((sum, point) => sum + radial(point), 0) / foot.length

        expect(meanTop).toBeLessThan(meanFoot)

        // An egg is much the same at the top as at the bottom.
        const egg = sample({...growthDefaults, crownShape: 'ellipsoid'})
        const eggTop = egg.filter((point) => point[1] > base + (growthDefaults.height - base) * 0.7)
        const eggFoot = egg.filter((point) => point[1] < base + (growthDefaults.height - base) * 0.3)

        const eggMeanTop = eggTop.reduce((sum, point) => sum + radial(point), 0) / eggTop.length
        const eggMeanFoot = eggFoot.reduce((sum, point) => sum + radial(point), 0) / eggFoot.length

        expect(Math.abs(eggMeanTop - eggMeanFoot) / eggMeanFoot).toBeLessThan(0.3)
    })

    it('makes a ragged crown out of an egg when asked', () => {
        const smooth = sample({...growthDefaults, crownShape: 'ellipsoid', irregularity: 0})
        const ragged = sample({...growthDefaults, crownShape: 'ellipsoid', irregularity: 1})

        expect(ragged).not.toEqual(smooth)

        // How far the rim reaches differs around the crown. An egg has the same
        // reach whichever way you look; a ragged crown does not.
        const rimSpread = (points: typeof smooth): number => {
            const sectors = 12
            const reach = new Array<number>(sectors).fill(0)

            for (const point of points) {
                const sector =
                    Math.floor(((Math.atan2(point[2], point[0]) + Math.PI) / (Math.PI * 2)) * sectors) %
                    sectors

                reach[sector] = Math.max(reach[sector], radial(point))
            }

            const mean = reach.reduce((sum, value) => sum + value, 0) / sectors

            return (Math.max(...reach) - Math.min(...reach)) / mean
        }

        expect(rimSpread(ragged)).toBeGreaterThan(rimSpread(smooth) * 2)
        expect(rimSpread(ragged)).toBeGreaterThan(0.1)
        expect(rimSpread(smooth)).toBeLessThan(0.1)
    })

    it('gives the same cloud for the same seed and a different one otherwise', () => {
        expect(sample(growthDefaults, 7)).toEqual(sample(growthDefaults, 7))
        expect(sample(growthDefaults, 7)).not.toEqual(sample(growthDefaults, 8))
    })

    it('honours a crown that starts at the ground', () => {
        const points = sample({...growthDefaults, crownBaseFraction: 0})

        expect(Math.min(...points.map((point) => point[1]))).toBeLessThan(
            growthDefaults.height * 0.2,
        )
    })
})
