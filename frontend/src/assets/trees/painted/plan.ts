/**
 * The plan of a painted tree: where its wood runs and where its leaves sit.
 *
 * Everything drawn is derived from this, so bark and leaves agree by
 * construction. It is a pure function of the parameters and the seed, and the
 * last one is kept, because every part of one tree asks for it in turn.
 *
 * Every limb and clump has a stable name and draws from its own random stream,
 * named after it. So adding a branch adds a branch instead of reshuffling the
 * tree, and a hand edit has something lasting to attach to.
 */

import {createSeededRandom, hashSeed, randomRange} from '../../shared/random'
import {parseEdits, type ClumpEdit, type PaintedEdits} from './edits'
import type {PaintedTreeParameters} from './parameters'

export type Vec3 = readonly [number, number, number]

export interface Limb {
    readonly id: number
    /** Its stable name: `t`, `r2`, `l1`, `l1b0`, `l1b0t1`. */
    readonly key: string
    /** 0 is the trunk, 1 a heavy limb or root, 2 a branch, 3 a twig. */
    readonly level: number
    readonly points: readonly Vec3[]
    readonly radii: readonly number[]
    /** Where along the limb its drag handles sit, 0 to 1. */
    readonly controlTs: readonly number[]
    /** Where those handles would be if they had not been dragged. */
    readonly controlBase: readonly Vec3[]
    /** Where they are now. */
    readonly controls: readonly Vec3[]
    readonly lengthScale: number
    readonly thicknessScale: number
}

/** A mass of leaves: an ellipsoid whose surface the seed breaks up. */
export interface Clump {
    readonly key: string
    /** Where it would sit if it had not been moved. */
    readonly base: Vec3
    readonly centre: Vec3
    readonly radius: number
    /** The vertical radius over the horizontal one. On a frond, how hard it arches. */
    readonly flatten: number
    readonly seed: number
    readonly edit: ClumpEdit
    /** A mass of leaves, or a palm frond whose radius is its length. */
    readonly kind: 'mass' | 'frond'
    /** How far the rim of a mass sags below its middle, as a share of its radius. */
    readonly sag: number
    /** Which way a frond leaves the trunk. */
    readonly azimuth: number
    /** How steeply a frond leaves the trunk, in radians. */
    readonly elevation: number
}

export interface TreePlan {
    readonly limbs: readonly Limb[]
    readonly clumps: readonly Clump[]
    readonly crownCentre: Vec3
    readonly crownRadius: number
}

/** The golden angle, so limbs around a parent never line up. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const DEGREES = Math.PI / 180
/** How far along a root it starts to sink, and how deep its tip ends, against the trunk's radius. */
const ROOT_SINKS_FROM = 0.6
const ROOT_SINK_DEPTH = 0.55

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

/** Turns a part's name into a number to seed its own randomness with. */
export function hashKey(key: string): number {
    let hash = 2166136261

    for (let index = 0; index < key.length; index++) {
        hash = Math.imul(hash ^ key.charCodeAt(index), 16777619)
    }

    return hash >>> 0
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
    readonly controlTs: readonly number[]
    /** Applied to the finished path, before any hand edit. */
    readonly shape?: (point: Vec3, t: number) => Vec3
}

/** How much of each dragged handle's move reaches a point `t` along the limb. */
function offsetAt(t: number, controlTs: readonly number[], offsets: readonly Vec3[]): Vec3 {
    let previousT = 0
    let previous: Vec3 = [0, 0, 0]

    for (let index = 0; index < controlTs.length; index++) {
        const nextT = controlTs[index]
        const next = offsets[index] ?? [0, 0, 0]

        if (t <= nextT) {
            const f = nextT - previousT < 1e-6 ? 1 : (t - previousT) / (nextT - previousT)
            const eased = f * f * (3 - 2 * f)

            return add(previous, [next[0] - previous[0], next[1] - previous[1], next[2] - previous[2]], eased)
        }

        previousT = nextT
        previous = next
    }

    return previous
}

/**
 * Walks a limb from its base.
 *
 * The heading drifts by a slow sum of sines rather than a random walk: a walk
 * makes every limb jitter, and two slow waves make it bend with intent.
 */
function growLimb(
    id: number,
    key: string,
    recipe: LimbRecipe,
    seed: number,
    edits: PaintedEdits,
): Limb {
    const random = createSeededRandom(hashSeed(seed, hashKey(key)))
    const edit = edits.limbs[key] ?? {}
    const lengthScale = edit.lengthScale ?? 1
    const thicknessScale = edit.thicknessScale ?? 1
    const {steps, tipRadius, taperPower} = recipe
    const length = recipe.length * lengthScale
    const baseRadius = recipe.baseRadius * thicknessScale
    const side = perpendicularTo(recipe.direction)
    const other = cross(recipe.direction, side)
    const phaseA = random() * Math.PI * 2
    const phaseB = random() * Math.PI * 2
    const waves = randomRange(random, 0.8, 1.4)

    const path: Vec3[] = [recipe.start]
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
        path.push(at)
        radii.push(tipRadius + (baseRadius - tipRadius) * Math.pow(1 - t, taperPower))
    }

    const shaped = recipe.shape ? path.map((point, step) => recipe.shape!(point, step / steps)) : path
    const offsets = edit.offsets ?? []
    const points = shaped.map((point, step) => add(point, offsetAt(step / steps, recipe.controlTs, offsets)))
    const sampled = (from: readonly Vec3[]) => recipe.controlTs.map((t) => sampleAt(from, t))

    return {
        id,
        key,
        level: recipe.level,
        points,
        radii,
        controlTs: recipe.controlTs,
        controlBase: sampled(shaped),
        controls: sampled(points),
        lengthScale,
        thicknessScale,
    }
}

function sampleAt(points: readonly Vec3[], t: number): Vec3 {
    const last = points.length - 1
    const position = Math.min(Math.max(t, 0), 1) * last
    const index = Math.min(Math.floor(position), last - 1)
    const a = points[index]
    const b = points[index + 1]

    return add(a, [b[0] - a[0], b[1] - a[1], b[2] - a[2]], position - index)
}

/** A point partway along a limb, with its radius and heading. */
function along(limb: Limb, t: number): {point: Vec3; radius: number; heading: Vec3} {
    const last = limb.points.length - 1
    const position = Math.min(Math.max(t, 0), 1) * last
    const index = Math.min(Math.floor(position), last - 1)
    const a = limb.points[index]
    const b = limb.points[index + 1]

    return {
        point: sampleAt(limb.points, t),
        radius: limb.radii[index] + (limb.radii[index + 1] - limb.radii[index]) * (position - index),
        heading: normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]),
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

/** How much of Height a trunk reaches, with the leaves making up the rest. */
const TOP_OF_PALM_TRUNK = 0.86
const TOP_OF_CONIFER_TRUNK = 0.97
const CONIFER_SPOKES = 3

interface Tier {
    readonly index: number
    readonly y: number
    readonly radius: number
    readonly flatten: number
}

/** A conifer's skirts, widest at the bottom, with the top one drawn up into a point. */
function coniferTiers(tree: PaintedTreeParameters): Tier[] {
    const count = tree.clumpCount
    const low = tree.height * tree.forkHeight * 0.7
    const width = tree.spread * 0.5 * tree.clumpSize
    const radiusOf = (index: number) => width * (1 - (count === 1 ? 0 : index / (count - 1)) * 0.82)
    let totalGap = 0

    for (let index = 0; index < count - 1; index++) {
        totalGap += radiusOf(index)
    }

    let climbed = 0

    return Array.from({length: count}, (_, index) => {
        const radius = radiusOf(index)
        const flatten = index === count - 1 ? 1.15 : 1 - tree.clumpFlatten * 0.75
        // The top tier ends exactly at Height.
        const top = tree.height - radius * flatten
        // A small tier sits closer to the next, so the top never comes apart.
        const y = low + (top - low) * (totalGap > 0 ? climbed / totalGap : 0)

        climbed += radius

        return {index, y, radius, flatten}
    })
}

/**
 * Grows the wood.
 *
 * `stretch` is the vertical scale that fits the crown to the tree's height. It
 * is applied limb by limb around each limb's own start, so a child stays on
 * its parent and hand edits land exactly where they were dragged.
 */
function growWood(
    tree: PaintedTreeParameters,
    seed: number,
    stretch: number,
    edits: PaintedEdits,
): Limb[] {
    const random = createSeededRandom(hashSeed(seed, 11))
    const {height, spread, trunkRadius, forkHeight, limbCount, gnarl} = tree
    const limbs: Limb[] = []
    const forkY = height * forkHeight
    const leanAzimuth = random() * Math.PI * 2
    const lean = tree.lean * randomRange(random, 0.8, 1.2)
    const azimuthStart = random() * Math.PI * 2
    const turns = 1.25
    const windRadius = tree.corkscrew * trunkRadius * 1.1

    const fit = (start: Vec3) => (point: Vec3): Vec3 => [
        point[0],
        start[1] + (point[1] - start[1]) * stretch,
        point[2],
    ]

    // A palm's or a conifer's trunk is the whole height of the tree, and a
    // palm leaves the ground leaning and curves back up.
    const growTrunk = (length: number, trunkEdits: PaintedEdits): Limb => growLimb(
        0,
        't',
        {
            start: [0, 0, 0],
            direction: normalize([Math.cos(leanAzimuth) * lean, 1, Math.sin(leanAzimuth) * lean]),
            length,
            baseRadius: trunkRadius,
            tipRadius: trunkRadius * (tree.form === 'conifer' ? 0.05 : 0.6),
            level: 0,
            steps: 16,
            wander: tree.trunkBend * 0.8,
            rise: tree.form === 'palm' ? 0.1 + tree.lean * 2 : 0.1,
            taperPower: 0.9,
            controlTs: [0.34, 0.67, 1],
            // The corkscrew leaves the base where it is, and winds harder
            // towards the middle of the trunk.
            shape: (point, t) => {
                const angle = t * turns * Math.PI * 2 + leanAzimuth
                const reach = windRadius * Math.sin(Math.min(t * 1.6, 1) * Math.PI * 0.5)

                return [
                    point[0] + (Math.cos(angle) - Math.cos(leanAzimuth)) * reach,
                    point[1],
                    point[2] + (Math.sin(angle) - Math.sin(leanAzimuth)) * reach,
                ]
            },
        },
        seed,
        trunkEdits,
    )

    // The first pass finds how much height the trunk's lean costs, without hand
    // edits, so dragging the trunk does not change how long it is.
    const target = height * (tree.form === 'palm' ? TOP_OF_PALM_TRUNK * tree.stem : TOP_OF_CONIFER_TRUNK)
    const trunk =
        tree.form === 'crown'
            ? growTrunk(forkY * 1.22, edits)
            : growTrunk((target * target) / Math.max(tipOf(growTrunk(target, NO_EDITS))[1], 0.1), edits)

    limbs.push(trunk)

    // Roots: short, thick and low, so the trunk stands in the ground rather
    // than on it.
    for (let index = 0; index < tree.rootCount; index++) {
        const key = `r${index}`

        if (edits.limbs[key]?.removed) {
            continue
        }

        const azimuth = index * GOLDEN_ANGLE + leanAzimuth
        const own = createSeededRandom(hashSeed(seed, hashKey(key), 1))
        const root = growLimb(
            limbs.length,
            key,
            {
                start: [
                    Math.cos(azimuth) * trunkRadius * 0.45,
                    trunkRadius * randomRange(own, 0.55, 0.85),
                    Math.sin(azimuth) * trunkRadius * 0.45,
                ],
                direction: normalize([Math.cos(azimuth), -0.3, Math.sin(azimuth)]),
                length: trunkRadius * randomRange(own, 2.2, 3.4) * tree.rootLength,
                baseRadius: trunkRadius * randomRange(own, 0.42, 0.55),
                tipRadius: trunkRadius * 0.12,
                level: 1,
                steps: 5,
                wander: 0.08,
                rise: -0.6,
                taperPower: 0.9,
                controlTs: [0.5, 1],
                // A root runs along the ground, then sinks into it, so it has no end to see.
                shape: (point, t) => {
                    const sinking = Math.min(1, Math.max(0, (t - ROOT_SINKS_FROM) / (1 - ROOT_SINKS_FROM)))

                    return [point[0], Math.max(point[1], -0.04) - trunkRadius * ROOT_SINK_DEPTH * sinking * sinking * (3 - 2 * sinking), point[2]]
                },
            },
            seed,
            edits,
        )

        limbs.push(root)
    }

    if (tree.form === 'palm') {
        return limbs
    }

    if (tree.form === 'conifer') {
        for (const tier of coniferTiers(tree)) {
            const leaving = along(trunk, tier.y / Math.max(trunk.points[trunk.points.length - 1][1], 0.01))

            for (let spoke = 0; spoke < CONIFER_SPOKES; spoke++) {
                const key = `c${tier.index}s${spoke}`

                if (edits.limbs[key]?.removed) {
                    continue
                }

                const own = createSeededRandom(hashSeed(seed, hashKey(key), 1))
                const azimuth = azimuthStart + tier.index * GOLDEN_ANGLE + (spoke / CONIFER_SPOKES) * Math.PI * 2

                limbs.push(
                    growLimb(
                        limbs.length,
                        key,
                        {
                            start: leaving.point,
                            direction: normalize([Math.cos(azimuth), -0.1 - tree.droop * 0.4, Math.sin(azimuth)]),
                            length: tier.radius * randomRange(own, 0.7, 0.9),
                            baseRadius: Math.max(leaving.radius * 0.5, 0.025),
                            tipRadius: 0.008,
                            level: 2,
                            steps: 3,
                            wander: 0.03,
                            rise: -tree.droop * 0.3,
                            taperPower: 1.1,
                            controlTs: [0.5, 1],
                        },
                        seed,
                        edits,
                    ),
                )
            }
        }

        return limbs
    }

    // Heavy limbs: low ones reach out, high ones climb.
    for (let index = 0; index < limbCount; index++) {
        const key = `l${index}`

        if (edits.limbs[key]?.removed) {
            continue
        }

        const own = createSeededRandom(hashSeed(seed, hashKey(key), 1))
        const share = limbCount === 1 ? 0.5 : index / (limbCount - 1)
        const leaving = along(trunk, 0.66 + share * 0.34)
        const azimuth = azimuthStart + index * GOLDEN_ANGLE + randomRange(own, -0.3, 0.3)
        const elevation = (tree.limbAngle * (0.28 + share * 1.44) + randomRange(own, -6, 6)) * DEGREES
        const heavy = growLimb(
            limbs.length,
            key,
            {
                start: leaving.point,
                direction: normalize([
                    Math.cos(azimuth) * Math.cos(elevation),
                    Math.sin(elevation),
                    Math.sin(azimuth) * Math.cos(elevation),
                ]),
                length:
                    (spread * 0.5 * randomRange(own, 0.82, 1.05)) /
                    Math.max(Math.cos(elevation), 0.55),
                baseRadius: leaving.radius * randomRange(own, 0.62, 0.74),
                tipRadius: 0.018,
                level: 1,
                steps: 9,
                wander: 0.14 * (0.35 + gnarl),
                rise: 0.4 - tree.droop * 1.5,
                taperPower: 1.55,
                controlTs: [0.34, 0.67, 1],
                shape: fit(leaving.point),
            },
            seed,
            edits,
        )

        limbs.push(heavy)

        // Branches, then twigs. Children turn around their parent, and the
        // lower they leave, the longer they are.
        const heavyLength = pathLength(heavy)
        const branchStart = own() * Math.PI * 2

        for (let b = 0; b < tree.branchCount; b++) {
            const branchKey = `${key}b${b}`

            if (edits.limbs[branchKey]?.removed) {
                continue
            }

            const branchOwn = createSeededRandom(hashSeed(seed, hashKey(branchKey), 1))
            const t = 0.34 + (b / Math.max(tree.branchCount - 1, 1)) * 0.56
            const from = along(heavy, t)
            const branch = growLimb(
                limbs.length,
                branchKey,
                {
                    start: from.point,
                    direction: leaveAxis(
                        from.heading,
                        randomRange(branchOwn, 0.55, 0.85),
                        branchStart + b * GOLDEN_ANGLE,
                    ),
                    length: heavyLength * (0.56 - t * 0.22) * randomRange(branchOwn, 0.85, 1.15),
                    baseRadius: Math.max(from.radius * 0.72, 0.022),
                    tipRadius: 0.01,
                    level: 2,
                    steps: 5,
                    wander: 0.14 * (0.35 + gnarl),
                    rise: 0.45 - tree.droop * 1.2,
                    taperPower: 1.3,
                    controlTs: [0.5, 1],
                    shape: fit(from.point),
                },
                seed,
                edits,
            )

            limbs.push(branch)

            const branchLength = pathLength(branch)
            const twigStart = branchOwn() * Math.PI * 2

            for (let twig = 0; twig < tree.twigCount; twig++) {
                const twigKey = `${branchKey}t${twig}`
                const twigOwn = createSeededRandom(hashSeed(seed, hashKey(twigKey), 1))
                const leaving = along(branch, 0.35 + ((twig + 0.5) / tree.twigCount) * 0.6)

                limbs.push(
                    growLimb(
                        limbs.length,
                        twigKey,
                        {
                            start: leaving.point,
                            direction: leaveAxis(
                                leaving.heading,
                                randomRange(twigOwn, 0.55, 0.95),
                                twigStart + twig * 2.4,
                            ),
                            length: branchLength * randomRange(twigOwn, 0.3, 0.46),
                            baseRadius: Math.max(leaving.radius * 0.75, 0.012),
                            tipRadius: 0.006,
                            level: 3,
                            steps: 2,
                            wander: 0.1,
                            rise: 0.2,
                            taperPower: 1,
                            controlTs: [1],
                        },
                        seed,
                        edits,
                    ),
                )
            }
        }
    }

    return limbs
}

const tipOf = (limb: Limb) => limb.points[limb.points.length - 1]

interface Seat {
    readonly point: Vec3
    /** The branches whose tips this clump sits over. */
    readonly keys: readonly string[]
}

/**
 * Decides which branch tips share a clump.
 *
 * Every branch tip wants a clump. The closest pairs merge until the count is
 * right: a crown is a few big shapes with air between them, not an even coat.
 */
function groupTips(limbs: readonly Limb[], target: number): Seat[] {
    let seats: Seat[] = limbs
        .filter((limb) => limb.level === 2)
        .map((limb) => ({point: tipOf(limb), keys: [limb.key]}))

    while (seats.length > Math.max(1, target)) {
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
        const wa = a.keys.length
        const wb = b.keys.length
        const point: Vec3 = [
            (a.point[0] * wa + b.point[0] * wb) / (wa + wb),
            (a.point[1] * wa + b.point[1] * wb) / (wa + wb),
            (a.point[2] * wa + b.point[2] * wb) / (wa + wb),
        ]

        seats = seats.filter((_, index) => index !== bestA && index !== bestB)
        seats.push({point, keys: [...a.keys, ...b.keys]})
    }

    return seats
}

/** Puts a clump over each group of tips, wherever those tips are now. */
function placeClumps(
    limbs: readonly Limb[],
    seats: readonly Seat[],
    tree: PaintedTreeParameters,
    seed: number,
    edits: PaintedEdits,
): Clump[] {
    const tips = new Map(limbs.filter((limb) => limb.level === 2).map((limb) => [limb.key, tipOf(limb)]))
    const baseRadius = (tree.spread * 0.17 + tree.height * 0.03) * tree.clumpSize
    const countScale = Math.sqrt(11 / Math.max(tree.clumpCount, 1))
    const placed: {seat: Seat; point: Vec3}[] = []

    for (const seat of seats) {
        const live = seat.keys.map((key) => tips.get(key)).filter((tip): tip is Vec3 => tip !== undefined)

        if (live.length > 0) {
            const sum = live.reduce<Vec3>((total, tip) => add(total, tip), [0, 0, 0])

            placed.push({seat, point: [sum[0] / live.length, sum[1] / live.length, sum[2] / live.length]})
        }
    }

    const count = Math.max(placed.length, 1)
    const middle = placed.reduce<Vec3>((total, {point}) => add(total, point, 1 / count), [0, 0, 0])
    const clumps: Clump[] = []

    for (const {seat, point} of placed) {
        const key = [...seat.keys].sort()[0]
        const edit = edits.clumps[key] ?? {}

        if (edit.removed) {
            continue
        }

        const random = createSeededRandom(hashSeed(seed, hashKey(key), 2))
        const radius =
            baseRadius *
            countScale *
            (1 + tree.clumpMerge * 0.35) *
            (0.72 + 0.16 * Math.min(seat.keys.length, 3)) *
            randomRange(random, 0.85, 1.15) *
            (edit.sizeScale ?? 1)
        // Merging pulls clumps together, and flatter clumps sit lower.
        const pull = tree.clumpMerge * 0.32
        const base: Vec3 = [
            point[0] + (middle[0] - point[0]) * pull,
            point[1] + (middle[1] - point[1]) * pull + radius * 0.34,
            point[2] + (middle[2] - point[2]) * pull,
        ]
        const offset = edit.offset ?? [0, 0, 0]

        clumps.push({
            key,
            base,
            centre: add(base, offset),
            radius,
            flatten:
                Math.min(Math.max((1 - tree.clumpFlatten * 0.75) * randomRange(random, 0.92, 1.08) * (edit.flattenScale ?? 1), 0.25), 1.4),
            seed: Math.floor(random() * 2147483647),
            edit,
            kind: 'mass',
            sag: 0,
            azimuth: 0,
            elevation: 0,
        })
    }

    return clumps
}

/** How long a frond is against the height of a plant that is nearly all frond. */
const FROND_REACH = 1.4

/** A palm's crown: young fronds climb out of the top, old ones hang below them. */
function placeFronds(limbs: readonly Limb[], tree: PaintedTreeParameters, seed: number, edits: PaintedEdits): Clump[] {
    const trunk = limbs[0]
    const base = tipOf(trunk)
    const count = tree.clumpCount
    // The shorter the stem, the more of the height the fronds have to make up.
    const length = (tree.height * FROND_REACH + (tree.height * 0.3 + 0.7 - tree.height * FROND_REACH) * tree.stem) * tree.clumpSize
    const clumps: Clump[] = []

    for (let index = 0; index < count; index++) {
        const key = `f${index}`
        const edit = edits.clumps[key] ?? {}

        if (edit.removed) {
            continue
        }

        const random = createSeededRandom(hashSeed(seed, hashKey(key), 2))
        const age = count === 1 ? 0.5 : index / (count - 1)
        const scatter = tree.gnarl * 0.5

        clumps.push({
            key,
            base,
            centre: add(base, edit.offset ?? [0, 0, 0]),
            radius: length * randomRange(random, 0.85, 1.1) * (edit.sizeScale ?? 1),
            flatten: edit.flattenScale ?? 1,
            seed: Math.floor(random() * 2147483647),
            edit,
            kind: 'frond',
            sag: 0,
            azimuth: index * GOLDEN_ANGLE + randomRange(random, -scatter, scatter),
            elevation: (1.15 - age * 1.2) + randomRange(random, -scatter, scatter) * 0.4,
        })
    }

    return clumps
}

function placeTiers(tree: PaintedTreeParameters, seed: number, edits: PaintedEdits, limbs: readonly Limb[]): Clump[] {
    const trunk = limbs[0]
    const trunkTop = tipOf(trunk)[1]
    const clumps: Clump[] = []

    for (const tier of coniferTiers(tree)) {
        const key = `c${tier.index}`
        const edit = edits.clumps[key] ?? {}

        if (edit.removed) {
            continue
        }

        const random = createSeededRandom(hashSeed(seed, hashKey(key), 2))
        const at = along(trunk, tier.y / Math.max(trunkTop, 0.01)).point
        const base: Vec3 = [at[0], tier.y, at[2]]

        clumps.push({
            key,
            base,
            centre: add(base, edit.offset ?? [0, 0, 0]),
            radius: tier.radius * randomRange(random, 0.95, 1.05) * (edit.sizeScale ?? 1),
            flatten: Math.min(Math.max(tier.flatten * (edit.flattenScale ?? 1), 0.2), 1.4),
            seed: Math.floor(random() * 2147483647),
            edit,
            kind: 'mass',
            sag: 0.3 + tree.droop * 0.6,
            azimuth: 0,
            elevation: 0,
        })
    }

    return clumps
}

const NO_EDITS: PaintedEdits = {limbs: {}, clumps: {}}

/** The top of the leaves, with no hand edits, or of the wood on a bare tree. */
function crownTop(limbs: readonly Limb[], seats: readonly Seat[], tree: PaintedTreeParameters, seed: number) {
    if (seats.length === 0) {
        return limbs.reduce((top, limb) => Math.max(top, tipOf(limb)[1]), 0)
    }

    return placeClumps(limbs, seats, tree, seed, NO_EDITS).reduce(
        (top, clump) => Math.max(top, clump.centre[1] + clump.radius * clump.flatten),
        0,
    )
}

/**
 * Finds the vertical scale that puts the top of the leaves at Height.
 *
 * Solved without the hand edits, so dragging one branch upward does not squash
 * the rest of the tree to make room.
 */
function fitToHeight(tree: PaintedTreeParameters, seed: number): {stretch: number; seats: Seat[]} {
    const first = growWood(tree, seed, 1, NO_EDITS)
    const seats = tree.clumpCount === 0 ? [] : groupTips(first, tree.clumpCount)
    const pivot = tree.height * tree.forkHeight
    let stretch = 1

    for (let pass = 0; pass < 4; pass++) {
        const limbs = pass === 0 ? first : growWood(tree, seed, stretch, NO_EDITS)
        const top = crownTop(limbs, seats, tree, seed)

        if (top <= pivot + 0.01) {
            break
        }

        stretch = Math.min(Math.max(stretch * ((tree.height - pivot) / (top - pivot)), 0.1), 4)
    }

    return {stretch, seats}
}

function buildPlan(tree: PaintedTreeParameters, seed: number): TreePlan {
    const edits = parseEdits(tree.edits)
    let limbs: readonly Limb[]
    let clumps: readonly Clump[]

    if (tree.form === 'crown') {
        const {stretch, seats} = cachedFit(tree, seed)

        limbs = growWood(tree, seed, stretch, edits)
        clumps = placeClumps(limbs, seats, tree, seed, edits)
    } else {
        limbs = growWood(tree, seed, 1, edits)
        clumps = tree.form === 'palm' ? placeFronds(limbs, tree, seed, edits) : placeTiers(tree, seed, edits, limbs)
    }

    let x = 0
    let y = 0
    let z = 0

    for (const clump of clumps) {
        x += clump.base[0]
        y += clump.base[1]
        z += clump.base[2]
    }

    const count = Math.max(clumps.length, 1)
    const crownCentre: Vec3 = [x / count, y / count, z / count]
    let crownRadius = 0.001

    for (const clump of clumps) {
        crownRadius = Math.max(
            crownRadius,
            Math.hypot(
                clump.base[0] - crownCentre[0],
                clump.base[1] - crownCentre[1],
                clump.base[2] - crownCentre[2],
            ) + clump.radius,
        )
    }

    return {limbs, clumps, crownCentre, crownRadius}
}

let fitKey = ''
let fitResult: {stretch: number; seats: Seat[]} | null = null

function cachedFit(tree: PaintedTreeParameters, seed: number) {
    const key = JSON.stringify([{...tree, edits: ''}, seed])

    if (!fitResult || key !== fitKey) {
        fitResult = fitToHeight(tree, seed)
        fitKey = key
    }

    return fitResult
}

let lastKey = ''
let lastPlan: TreePlan | null = null

export function planPaintedTree(tree: PaintedTreeParameters, seed: number): TreePlan {
    const key = JSON.stringify([tree, seed])

    if (!lastPlan || key !== lastKey) {
        lastPlan = buildPlan(tree, seed)
        lastKey = key
    }

    return lastPlan
}
