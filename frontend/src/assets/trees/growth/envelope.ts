/**
 * The crown envelope: where the tree is allowed to grow towards.
 *
 * The crown is a solid of revolution described by a profile: how far out the
 * crown reaches at each height. Points are drawn uniformly inside it, which is
 * what makes a branch see the same density of points in every direction and
 * therefore grow an even crown rather than a lopsided one.
 */

import {valueNoise3} from '../../shared/geometry-utils'
import type {RandomSource} from '../../shared/random'
import type {CrownShape, GrowthParameters} from './parameters'

export type Vec3 = readonly [number, number, number]

/** How finely the raggedness varies around the crown. */
const NOISE_FREQUENCY = 2.2

/** How far the noise may move the rim either way, at full irregularity. */
const NOISE_REACH = 0.45

/** How many tries a height gets before the last one is kept, so the loop always ends. */
const MAX_TRIES = 64

/**
 * The crown's outline at a given fraction of its height.
 *
 * `t` runs from 0 where the crown starts to 1 at the top of the tree, and the
 * result is a fraction of the crown radius. No shape ever returns more than 1,
 * which is what keeps a grown tree inside the width that was asked for.
 */
function crownProfile(shape: CrownShape, t: number): number {
    const clamped = Math.min(Math.max(t, 0), 1)

    switch (shape) {
        case 'dome': {
            // Tucked in at the bottom, widest a quarter of the way up, then a
            // rounded shoulder down from there. The widened bottom is what
            // gives a broadleaf tree its heavy, low crown.
            const widest = 0.25

            if (clamped <= widest) {
                return 0.72 + 0.28 * (clamped / widest)
            }

            const k = (clamped - widest) / (1 - widest)

            return Math.sqrt(Math.max(0, 1 - k * k))
        }

        case 'ellipsoid': {
            const k = 2 * clamped - 1

            return Math.sqrt(Math.max(0, 1 - k * k))
        }

        case 'cone':
            return Math.pow(1 - clamped, 0.8)

        case 'irregular': {
            // The raggedness is added on top of a plain egg, so the shape is
            // still a crown and only its rim wanders.
            const k = 2 * clamped - 1

            return Math.sqrt(Math.max(0, 1 - k * k))
        }
    }
}

/**
 * Draws the points the branches grow towards.
 *
 * The height is picked with a probability proportional to the area of the
 * slice it cuts, then the point is placed inside that slice, which is exactly
 * a uniform point inside the crown volume but without the wasted samples of
 * dropping points into a box and throwing most of them away. The requested
 * count is always honoured and every coordinate is finite.
 */
export function sampleAttractors(parameters: GrowthParameters, random: RandomSource): Vec3[] {
    const count = Math.max(0, Math.round(parameters.attractorCount))
    const crownRadius = Math.max(parameters.crownWidth, 0.01) / 2
    const base = Math.min(Math.max(parameters.crownBaseFraction, 0), 1) * parameters.height
    const top = Math.max(parameters.height, base + 0.01)
    const crownHeight = top - base
    const shape = parameters.crownShape
    const irregularity = Math.min(Math.max(parameters.irregularity, 0), 1)

    // The raggedness is a property of the tree, not of where the random source
    // happens to be, so the noise gets its own seed, drawn once.
    const noiseSeed = Math.floor(random() * 0xffffffff) >>> 0

    const points: Vec3[] = []

    for (let index = 0; index < count; index++) {
        let t = 0
        let reach = 0

        for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
            t = random()
            const profile = crownProfile(shape, t)

            // Accepting with probability profile squared makes a height as
            // likely as the area of the ring it cuts through.
            reach = profile

            if (random() <= profile * profile) {
                break
            }
        }

        const angle = random() * Math.PI * 2
        const nx = Math.cos(angle)
        const nz = Math.sin(angle)

        if (irregularity > 0) {
            // The noise is looked up along the direction of the crown, not at
            // the point, so the rim stays a continuous ragged outline instead
            // of turning into static.
            const ny = 0.8 * (2 * t - 1)
            const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
            const noise = valueNoise3(
                (nx / length) * NOISE_FREQUENCY,
                (ny / length) * NOISE_FREQUENCY,
                (nz / length) * NOISE_FREQUENCY,
                noiseSeed,
            )

            reach = Math.min(1, Math.max(0.2, reach * (1 + NOISE_REACH * irregularity * noise)))
        }

        const radius = crownRadius * reach * Math.sqrt(random())
        const y = base + crownHeight * t

        points.push([nx * radius, y, nz * radius])
    }

    return points
}
