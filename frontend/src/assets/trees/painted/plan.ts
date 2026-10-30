/**
 * The plan of a painted tree: where its wood runs and where its leaves sit.
 *
 * Everything drawn is derived from this, so bark and leaves agree by
 * construction. It is a pure function of the parameters and the seed, and the
 * last one is kept, because every part of one tree asks for it in turn.
 */

import {createSeededRandom, hashSeed, randomRange, type RandomSource} from '../../shared/random'
import type {PaintedTreeParameters} from './parameters'

export type Vec3 = readonly [number, number, number]

export interface Limb {
    readonly id: number
    /** 0 is the trunk, 1 a heavy limb or root, 2 a branch, 3 a twig. */
    readonly level: number
    readonly points: readonly Vec3[]
    readonly radii: readonly number[]
}

/** A mass of leaves: an ellipsoid whose surface the seed breaks up. */
export interface Clump {
    readonly centre: Vec3
    readonly radius: number
    /** The vertical radius over the horizontal one. */
    readonly flatten: number
    readonly seed: number
}

export interface TreePlan {
    readonly limbs: readonly Limb[]
    readonly clumps: readonly Clump[]
    readonly crownCentre: Vec3
    readonly crownRadius: number
}

const SEED_WOOD = 11
const SEED_CROWN = 12

/** The golden angle, so limbs around a parent never line up. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

const add = (a: Vec3, b: Vec3, scale = 1): Vec3 => [
    a[0] + b[0] * scale,
    a[1] + b[1] * scale,
    a[2] + b[2] * scale,
]

export function normalize(v: Vec3): Vec3 {
    const length = Math.hypot(v[0], v[1], v[2])

    return length < 1e-9 ? [0, 1, 0] : [v[0] / length, v[1] / length, v[2] / length]
}

export function cross(a: Vec3, b: Vec3): Vec3 {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** Any unit vector at right angles to a unit vector. */
export function perpendicularTo(v: Vec3): Vec3 {
    return normalize(cross(v, Math.abs(v[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
}

interface LimbRecipe {
    readonly start: Vec3
    readonly direction: Vec3
    readonly length: number
    readonly baseRadius: number
    readonly tipRadius: number
    readonly level: number
    readonly steps: number
    /** How hard it wanders. */
    readonly wander: number
    /** How much it bends upward along its length. Negative sags. */
    readonly rise: number
    /** Above 1 the radius falls quickly at first, so a limb ends in a whip. */
    readonly taperPower: number
}

/**
 * Walks a limb from its base.
 *
 * The heading drifts by a slow sum of sines rather than a random walk: a walk
 * makes every limb jitter, and two slow waves make it bend with intent.
 */
function growLimb(id: number, recipe: LimbRecipe, random: RandomSource): Limb {
    const {steps, length, baseRadius, tipRadius, taperPower} = recipe
    const side = perpendicularTo(recipe.direction)
    const other = cross(recipe.direction, side)
    const phaseA = random() * Math.PI * 2
    const phaseB = random() * Math.PI * 2
    const waves = randomRange(random, 0.8, 1.4)

    const points: Vec3[] = [recipe.start]
    const radii: number[] = [baseRadius]
    let heading = recipe.direction
    let at = recipe.start

    for (let step = 1; step <= steps; step++) {
        const t = step / steps
        const a = Math.sin(t * Math.PI * 2 * waves + phaseA)
        const b = Math.sin(t * Math.PI * 2 * waves * 0.61 + phaseB)

        heading = normalize(
            add(
                add(add(heading, side, a * recipe.wander), other, b * recipe.wander),
                [0, 1, 0],
                recipe.rise / steps,
            ),
        )
        at = add(at, heading, length / steps)
        points.push(at)
        radii.push(tipRadius + (baseRadius - tipRadius) * Math.pow(1 - t, taperPower))
    }

    return {id, level: recipe.level, points, radii}
}

/** A point partway along a limb, with its radius and heading. */
function along(limb: Limb, t: number): {point: Vec3; radius: number; heading: Vec3} {
    const last = limb.points.length - 1
    const position = Math.min(Math.max(t, 0), 1) * last
    const index = Math.min(Math.floor(position), last - 1)
    const fraction = position - index
    const a = limb.points[index]
    const b = limb.points[index + 1]
    const delta: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]

    return {
        point: add(a, delta, fraction),
        radius: limb.radii[index] + (limb.radii[index + 1] - limb.radii[index]) * fraction,
        heading: normalize(delta),
    }
}

/** A heading `angle` away from an axis, turned `azimuth` around it. */
function leaveAxis(axis: Vec3, angle: number, azimuth: number): Vec3 {
    const side = perpendicularTo(axis)
    const other = cross(axis, side)
    const around = add(add([0, 0, 0], side, Math.cos(azimuth)), other, Math.sin(azimuth))

    return normalize(add(add([0, 0, 0], axis, Math.cos(angle)), around, Math.sin(angle)))
}

function pathLength(limb: Limb): number {
    let length = 0

    for (let index = 1; index < limb.points.length; index++) {
        const a = limb.points[index - 1]
        const b = limb.points[index]

        length += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    }

    return length
}

function growWood(parameters: PaintedTreeParameters, random: RandomSource): Limb[] {
    const {height, spread, trunkRadius, forkHeight, limbCount, gnarl} = parameters
    const limbs: Limb[] = []
    const forkY = height * forkHeight
    const lean = randomRange(random, 0.08, 0.22) * (0.4 + gnarl)
    const leanAzimuth = random() * Math.PI * 2

    const trunk = growLimb(
        limbs.length,
        {
            start: [0, 0, 0],
            direction: normalize([Math.cos(leanAzimuth) * lean, 1, Math.sin(leanAzimuth) * lean]),
            length: forkY * 1.22,
            baseRadius: trunkRadius,
            tipRadius: trunkRadius * 0.6,
            level: 0,
            steps: 12,
            wander: 0.2 * gnarl,
            rise: 0.1,
            taperPower: 0.9,
        },
        random,
    )

    limbs.push(trunk)

    // Roots: short, thick and sinking, so the trunk stands in the ground
    // rather than on it.
    const rootCount = 5 + Math.round(gnarl * 2)

    for (let index = 0; index < rootCount; index++) {
        const azimuth = index * GOLDEN_ANGLE + leanAzimuth

        const root = growLimb(
                limbs.length,
                {
                    start: [
                        Math.cos(azimuth) * trunkRadius * 0.45,
                        trunkRadius * randomRange(random, 0.55, 0.85),
                        Math.sin(azimuth) * trunkRadius * 0.45,
                    ],
                    direction: normalize([Math.cos(azimuth), -0.3, Math.sin(azimuth)]),
                    length: trunkRadius * randomRange(random, 2.2, 3.4),
                    baseRadius: trunkRadius * randomRange(random, 0.42, 0.55),
                    tipRadius: trunkRadius * 0.12,
                    level: 1,
                    steps: 5,
                    wander: 0.08,
                    rise: -0.6,
                    taperPower: 0.9,
                },
                random,
            )

        // A root runs along the ground, it does not dive through it.
        limbs.push({
            ...root,
            points: root.points.map((point): Vec3 => [point[0], Math.max(point[1], -0.04), point[2]]),
        })
    }

    // Heavy limbs: low ones reach out, high ones climb.
    const heavy: Limb[] = []
    const azimuthStart = random() * Math.PI * 2

    for (let index = 0; index < limbCount; index++) {
        const share = limbCount === 1 ? 0.5 : index / (limbCount - 1)
        const leaving = along(trunk, 0.66 + share * 0.34)
        const azimuth = azimuthStart + index * GOLDEN_ANGLE + randomRange(random, -0.3, 0.3)
        const elevation = (10 + share * 52 + randomRange(random, -6, 6)) * (Math.PI / 180)
        const limb = growLimb(
            limbs.length,
            {
                start: leaving.point,
                direction: normalize([
                    Math.cos(azimuth) * Math.cos(elevation),
                    Math.sin(elevation),
                    Math.sin(azimuth) * Math.cos(elevation),
                ]),
                length:
                    (spread * 0.5 * randomRange(random, 0.82, 1.05)) /
                    Math.max(Math.cos(elevation), 0.55),
                baseRadius: leaving.radius * randomRange(random, 0.62, 0.74),
                tipRadius: 0.018,
                level: 1,
                steps: 9,
                wander: 0.14 * (0.35 + gnarl),
                rise: 0.4,
                taperPower: 1.55,
            },
            random,
        )

        limbs.push(limb)
        heavy.push(limb)
    }

    // Branches, then twigs. Children turn around their parent, and the lower
    // they leave, the longer they are.
    const branches: Limb[] = []

    for (const parent of heavy) {
        const count = 3 + (random() < 0.5 ? 1 : 0)
        const parentLength = pathLength(parent)
        const start = random() * Math.PI * 2

        for (let index = 0; index < count; index++) {
            const t = 0.34 + (index / Math.max(count - 1, 1)) * 0.56
            const leaving = along(parent, t)
            const branch = growLimb(
                limbs.length,
                {
                    start: leaving.point,
                    direction: leaveAxis(
                        leaving.heading,
                        randomRange(random, 0.55, 0.85),
                        start + index * GOLDEN_ANGLE,
                    ),
                    length: parentLength * (0.56 - t * 0.22) * randomRange(random, 0.85, 1.15),
                    baseRadius: Math.max(leaving.radius * 0.72, 0.022),
                    tipRadius: 0.01,
                    level: 2,
                    steps: 5,
                    wander: 0.14 * (0.35 + gnarl),
                    rise: 0.45,
                    taperPower: 1.3,
                },
                random,
            )

            limbs.push(branch)
            branches.push(branch)
        }
    }

    for (const parent of branches) {
        const parentLength = pathLength(parent)
        const start = random() * Math.PI * 2

        for (let index = 0; index < 2; index++) {
            const leaving = along(parent, 0.42 + index * 0.34)

            limbs.push(
                growLimb(
                    limbs.length,
                    {
                        start: leaving.point,
                        direction: leaveAxis(
                            leaving.heading,
                            randomRange(random, 0.55, 0.95),
                            start + index * Math.PI,
                        ),
                        length: parentLength * randomRange(random, 0.3, 0.46),
                        baseRadius: Math.max(leaving.radius * 0.75, 0.012),
                        tipRadius: 0.006,
                        level: 3,
                        steps: 2,
                        wander: 0.1,
                        rise: 0.2,
                        taperPower: 1,
                    },
                    random,
                ),
            )
        }
    }

    return limbs
}

/**
 * Puts the masses of leaves over the wood.
 *
 * Every branch tip wants a clump. The closest pairs merge until the count is
 * right: a crown is a few big shapes with air between them, not an even coat.
 */
function placeClumps(
    limbs: readonly Limb[],
    parameters: PaintedTreeParameters,
    random: RandomSource,
): Clump[] {
    let seats = limbs
        .filter((limb) => limb.level === 2)
        .map((limb) => ({point: limb.points[limb.points.length - 1], weight: 1}))

    const target = Math.max(1, parameters.clumpCount)

    while (seats.length > target) {
        let bestA = 0
        let bestB = 1
        let best = Number.POSITIVE_INFINITY

        for (let a = 0; a < seats.length; a++) {
            for (let b = a + 1; b < seats.length; b++) {
                const pa = seats[a].point
                const pb = seats[b].point
                const distance = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2])

                if (distance < best) {
                    best = distance
                    bestA = a
                    bestB = b
                }
            }
        }

        const a = seats[bestA]
        const b = seats[bestB]
        const weight = a.weight + b.weight
        const point: Vec3 = [
            (a.point[0] * a.weight + b.point[0] * b.weight) / weight,
            (a.point[1] * a.weight + b.point[1] * b.weight) / weight,
            (a.point[2] * a.weight + b.point[2] * b.weight) / weight,
        ]

        seats = seats.filter((_, index) => index !== bestA && index !== bestB)
        seats.push({point, weight})
    }

    const baseRadius = (parameters.spread * 0.17 + parameters.height * 0.03) * parameters.clumpSize
    const countScale = Math.sqrt(11 / target)

    return seats.map((seat) => {
        const radius =
            baseRadius *
            countScale *
            (0.72 + 0.16 * Math.min(seat.weight, 3)) *
            randomRange(random, 0.85, 1.15)

        return {
            centre: [seat.point[0], seat.point[1] + radius * 0.34, seat.point[2]] as Vec3,
            radius,
            flatten: randomRange(random, 0.62, 0.78),
            seed: Math.floor(random() * 2147483647),
        }
    })
}

/**
 * Fits the crown to the tree's height.
 *
 * Growth decides the shape and this decides the size, so Height means what it
 * says: everything above the fork is stretched or squashed vertically until the
 * top of the leaves is exactly where it was asked to be.
 */
function fitToHeight(limbs: readonly Limb[], clumps: readonly Clump[], height: number) {
    const forkY = limbs[0].points[limbs[0].points.length - 1][1] * 0.8
    let scale = 3

    // Only the centres move, not the clumps' own size, so each clump is solved
    // for separately and the one that would reach highest sets the scale.
    for (const clump of clumps) {
        const above = clump.centre[1] - forkY

        if (above > 1e-3) {
            scale = Math.min(scale, (height - forkY - clump.radius * clump.flatten) / above)
        }
    }

    scale = Math.max(scale, 0.15)
    const squash = (point: Vec3): Vec3 => [point[0], forkY + (point[1] - forkY) * scale, point[2]]

    return {
        limbs: limbs.map((limb) =>
            limb.level === 0 || limb.points[0][1] < forkY
                ? limb
                : {...limb, points: limb.points.map(squash)},
        ),
        clumps: clumps.map((clump) => ({...clump, centre: squash(clump.centre)})),
    }
}

function buildPlan(parameters: PaintedTreeParameters, seed: number): TreePlan {
    const grown = growWood(parameters, createSeededRandom(hashSeed(seed, SEED_WOOD)))
    const {limbs, clumps} = fitToHeight(
        grown,
        placeClumps(grown, parameters, createSeededRandom(hashSeed(seed, SEED_CROWN))),
        parameters.height,
    )

    let x = 0
    let y = 0
    let z = 0

    for (const clump of clumps) {
        x += clump.centre[0]
        y += clump.centre[1]
        z += clump.centre[2]
    }

    const count = Math.max(clumps.length, 1)
    const crownCentre: Vec3 = [x / count, y / count, z / count]
    let crownRadius = 0.001

    for (const clump of clumps) {
        crownRadius = Math.max(
            crownRadius,
            Math.hypot(
                clump.centre[0] - crownCentre[0],
                clump.centre[1] - crownCentre[1],
                clump.centre[2] - crownCentre[2],
            ) + clump.radius,
        )
    }

    return {limbs, clumps, crownCentre, crownRadius}
}

let lastKey = ''
let lastPlan: TreePlan | null = null

export function planPaintedTree(parameters: PaintedTreeParameters, seed: number): TreePlan {
    const key = JSON.stringify([parameters, seed])

    if (!lastPlan || key !== lastKey) {
        lastPlan = buildPlan(parameters, seed)
        lastKey = key
    }

    return lastPlan
}
