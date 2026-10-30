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
 * The steepest outward bias the hollowing may ask for.
 *
 * `1 / (1 - hollowing)` runs away as the hollowing reaches 1, and a point
 * exactly on the rim has no direction to grow in. Leaving a two-percent gap
 * keeps the shell a shell: at 0.98 the exponent is 50, which puts all but the
 * innermost points within a few centimetres of the surface.
 */
const MIN_HOLLOWING_GAP = 0.02

/**
 * The largest share of the points that may be pushed out to the shell.
 *
 * Never all of them. A growing joint can only reach a point it can see inside
 * its branch reach, and the trunk top sits in the middle of the crown: push
 * every point to the rim and the tree has nothing within reach to grow towards,
 * so it stops after a few joints and the crown is never built. The share that
 * stays where it was drawn is the path outward, and it is small enough that the
 * inside of the crown still thins out.
 */
const MAX_SHELL_SHARE = 0.85

/**
 * Pushes a radius fraction towards the outside of the crown.
 *
 * A crown sampled uniformly fills its volume, so a branch can earn a twig
 * anywhere and the result is an even bush. Biasing the fraction outward with
 * `1 - (1 - u)^(1 / (1 - hollowing))` concentrates the points in a shell: at 0
 * nothing changes, and as the hollowing rises the middle of the crown empties
 * out and a limb has to travel outward before there is anything to grow
 * towards. That is what makes limbs long and the inside of the crown open.
 */
function biasOutward(fraction: number, hollowing: number): number {
    if (hollowing <= 0) {
        return fraction
    }

    const strength = 1 / Math.max(1 - hollowing, MIN_HOLLOWING_GAP)

    return 1 - Math.pow(1 - fraction, strength)
}

/**
 * The crown's outline at a given fraction of its height.
 *
 * `t` runs from 0 where the crown starts to 1 at the top of the tree, and the
 * result is a fraction of the crown radius. No shape ever returns more than 1,
 * which is what keeps a grown tree inside the width that was asked for.
 *
 * Exported because anything that has to know whether a joint is near the
 * outside of the crown — leaf pads, for one — needs the same outline the
 * points were sampled in.
 */
export function crownReach(shape: CrownShape, t: number): number {
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
    const hollowing = Math.min(Math.max(parameters.interiorHollowing, 0), 1)

    // The raggedness is a property of the tree, not of where the random source
    // happens to be, so the noise gets its own seed, drawn once.
    const noiseSeed = Math.floor(random() * 0xffffffff) >>> 0

    const points: Vec3[] = []

    for (let index = 0; index < count; index++) {
        let t = 0
        let reach = 0

        for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
            t = random()
            const profile = crownReach(shape, t)

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

        // A uniform point in the volume is a uniform fraction of the radius
        // squared, so the square root is drawn first. A share of the points is
        // then pushed outward from that fraction; the rest stays where it was
        // drawn, which is what keeps the middle of the crown thin rather than
        // empty and keeps the tree able to grow into itself.
        const inside = Math.sqrt(random())
        const pushed = random() < Math.min(hollowing, MAX_SHELL_SHARE)
        const radius = crownRadius * reach * (pushed ? biasOutward(inside, hollowing) : inside)
        const y = base + crownHeight * t

        points.push([nx * radius, y, nz * radius])
    }

    return points
}
