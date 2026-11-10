/**
 * A rock's damage: cracks through it, and an edge crumbled away.
 *
 * Applied to the finished plan, so an undamaged rock is exactly as it was.
 *
 * A crack splits each chunk it crosses into two, a narrow gap apart. The painter
 * already darkens stone near a seam between chunks, so the gap reads as a dark crack
 * with no colour of its own. The two halves are marked as one, so a lighter level
 * never keeps one without the other.
 *
 * A crumbled edge takes chips off one side, and leaves a few small chunks of the same
 * stone at the rock's foot on that side.
 */

import {createSeededRandom, hashSeed, randomRange} from '../shared/random'
import {dot, facesOfChunk, normalize, type RockChunk, type RockPlan, type RockPlane, type Vec3} from './rock-plan'

export interface RockDamage {
    /** How cracked, 0 to 1: up to three cracks, each a little wider. */
    readonly cracks: number
    /** How much of one edge has crumbled away, 0 to 1. */
    readonly crumble: number
}

const SEED_CRACKS = 61
const SEED_CRUMBLE = 62
/** How wide a crack opens, against the rock's size. */
const CRACK_GAP = 0.012
/** A chunk has to stand at least this share of its thickness either side of a crack to split. */
const CRACK_MARGIN = 0.25
/** How far a crack may tilt off upright. */
const CRACK_TILT = 0.3
/** How deep the crumbled chips reach into a chunk, against the rock's size. */
const CRUMBLE_DEPTH = 0.12
/** The size of a piece of rubble, smallest and largest, against the rock's size. */
const RUBBLE_SMALL = 0.05
const RUBBLE_LARGE = 0.13

/** A chunk split by a crack keeps the crack's number, so both halves stay together. */
export interface CrackedChunk extends RockChunk {
    readonly crack?: number
    /** A piece of rubble: kept at every level, as dropping it would change the outline. */
    readonly rubble?: boolean
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

const cornersOf = (chunk: RockChunk): Vec3[] => facesOfChunk(chunk).flatMap((face) => face.corners)

function sizeOf(plan: RockPlan): number {
    return (plan.width + plan.height + plan.depth) / 3
}

function crack(chunks: readonly CrackedChunk[], plan: RockPlan, number: number, amount: number, random: () => number): CrackedChunk[] {
    const size = sizeOf(plan)
    const azimuth = random() * Math.PI * 2
    const n = normalize([Math.cos(azimuth), randomRange(random, -CRACK_TILT, CRACK_TILT), Math.sin(azimuth)])
    const through: Vec3 = [randomRange(random, -0.2, 0.2) * plan.width, plan.height * randomRange(random, 0.35, 0.65), randomRange(random, -0.2, 0.2) * plan.depth]
    const gap = size * CRACK_GAP * (0.6 + amount * 0.8)
    const tone = random()

    return chunks.flatMap((chunk) => {
        const sides = cornersOf(chunk).map((corner) => dot(n, sub(corner, through)))

        // Only a chunk the crack runs well through splits. One it grazes stays whole.
        const across = Math.max(...sides) - Math.min(...sides)

        if (Math.max(...sides) < across * CRACK_MARGIN || Math.min(...sides) > -across * CRACK_MARGIN) {
            return [chunk]
        }

        const d = dot(n, sub(through, chunk.centre))
        const face = (normal: Vec3, offset: number): RockPlane => ({n: normal, d: offset, tone, cut: null})
        const group = chunk.crack ?? number

        return [
            {...chunk, crack: group, planes: [...chunk.planes, face(n, d - gap / 2)]},
            {...chunk, crack: group, planes: [...chunk.planes, face([-n[0], -n[1], -n[2]], -d - gap / 2)]},
        ]
    })
}

/** A small, rough chunk of stone lying at `at`. */
function rubble(at: Vec3, radius: number, random: () => number): RockChunk {
    // A box turned at random, so it is always closed, then chipped.
    const turn = random() * Math.PI * 2
    const tip = randomRange(random, -0.4, 0.4)
    const u = normalize([Math.cos(turn), tip, Math.sin(turn)])
    const w = normalize([-Math.sin(turn), randomRange(random, -0.3, 0.3), Math.cos(turn)])
    const v = normalize([u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]])
    const planes: RockPlane[] = []

    for (const axis of [u, v, w]) {
        planes.push({n: axis, d: radius * randomRange(random, 0.55, 1), tone: random(), cut: null})
        planes.push({n: [-axis[0], -axis[1], -axis[2]], d: radius * randomRange(random, 0.55, 1), tone: random(), cut: null})
    }

    for (let chip = 0; chip < 3; chip++) {
        const n = normalize([randomRange(random, -1, 1), randomRange(random, -0.2, 1), randomRange(random, -1, 1)])

        planes.push({n, d: radius * randomRange(random, 0.6, 0.9), tone: random(), cut: null})
    }

    // Trimmed at the ground, as the rock is.
    planes.push({n: [0, -1, 0], d: at[1], tone: 0, cut: null, ground: true})

    return {centre: at, planes, rubble: true} as CrackedChunk
}

function crumble(chunks: readonly CrackedChunk[], plan: RockPlan, amount: number, random: () => number): CrackedChunk[] {
    const size = sizeOf(plan)
    const azimuth = random() * Math.PI * 2
    const towards: Vec3 = [Math.cos(azimuth), 0, Math.sin(azimuth)]
    const chips = 2 + Math.round(amount * 5)

    const chipped = chunks.map((chunk) => {
        const planes = [...chunk.planes]

        for (let chip = 0; chip < chips; chip++) {
            const spread = azimuth + randomRange(random, -0.8, 0.8)
            const n = normalize([Math.cos(spread), randomRange(random, -0.1, 0.7), Math.sin(spread)])
            const reach = Math.max(...cornersOf({...chunk, planes}).map((corner) => dot(n, sub(corner, chunk.centre))))

            planes.push({n, d: reach - size * CRUMBLE_DEPTH * amount * randomRange(random, 0.4, 1), tone: random(), cut: null})
        }

        return {...chunk, planes}
    })

    // What came off lies at the foot on that side, against what's left.
    const edge = Math.max(...chipped.flatMap(cornersOf).filter((corner) => corner[1] < plan.height * 0.3).map((corner) => dot(towards, corner)))
    const pieces = 2 + Math.round(amount * 6)
    const lying: RockChunk[] = []

    for (let piece = 0; piece < pieces; piece++) {
        const radius = size * randomRange(random, RUBBLE_SMALL, RUBBLE_LARGE) * (0.6 + amount * 0.4)
        const out = edge + radius * randomRange(random, -0.2, 1.4)
        const across = randomRange(random, -0.35, 0.35) * Math.max(plan.width, plan.depth)
        const at: Vec3 = [towards[0] * out - towards[2] * across, radius * 0.4, towards[2] * out + towards[0] * across]

        lying.push(rubble(at, radius, createSeededRandom(hashSeed(Math.round(random() * 1e6), piece))))
    }

    return [...chipped, ...lying]
}

export const isRockDamaged = (damage: RockDamage): boolean => damage.cracks > 0 || damage.crumble > 0

/** The plan with its damage done. Undamaged, the same plan. */
export function damageRock(plan: RockPlan, damage: RockDamage, seed: number): RockPlan {
    if (!isRockDamaged(damage)) {
        return plan
    }

    let chunks: CrackedChunk[] = [...plan.chunks]

    if (damage.cracks > 0) {
        const random = createSeededRandom(hashSeed(seed, SEED_CRACKS))
        const count = 1 + Math.min(2, Math.floor(damage.cracks * 3))

        for (let number = 0; number < count; number++) {
            chunks = crack(chunks, plan, number, damage.cracks, random)
        }
    }

    if (damage.crumble > 0) {
        chunks = crumble(chunks, plan, damage.crumble, createSeededRandom(hashSeed(seed, SEED_CRUMBLE)))
    }

    return {...plan, chunks, uneven: damage.crumble > 0}
}
