/**
 * Where a rock's chunks go, and what cuts them.
 *
 * A chunk is a convex solid: everything inside a list of planes. Recipes work in
 * a box one unit wide, deep and tall, and the plan is then stretched to the size
 * asked for, so the size controls are always exact.
 */

import {createSeededRandom, hashSeed, randomRange, type RandomSource} from '../shared/random'

export type Vec3 = readonly [number, number, number]

export type RockKind = 'boulder' | 'outcrop' | 'pillar' | 'cliff'

export interface RockPlanParameters {
    readonly kind: RockKind
    readonly width: number
    readonly height: number
    readonly depth: number
    readonly chunks: number
    /** How many planes cut each chunk, 0 to 1. */
    readonly faces: number
    /** How deep those planes reach, 0 to 1. */
    readonly cuts: number
}

export interface RockPlane {
    readonly n: Vec3
    readonly d: number
    /** A number of its own, so each face can be painted its own value. */
    readonly tone: number
    /** Bounds and caps are always kept. A cut has its place in line, for lighter levels. */
    readonly cut: number | null
    /** The plane at the ground: it trims the chunk but makes no face. */
    readonly ground?: boolean
}

export interface RockChunk {
    readonly centre: Vec3
    readonly planes: readonly RockPlane[]
}

export interface RockPlan {
    /** Largest first. */
    readonly chunks: readonly RockChunk[]
    /**
     * True when it isn't centred on its own middle, as when rubble lies to one side.
     * A lighter level is then left as it is, not stretched back to the size.
     */
    readonly uneven?: boolean
    readonly width: number
    readonly height: number
    readonly depth: number
}

const SEED_LAYOUT = 41
const SEED_CHUNK = 100
const MIN_CUTS = 4
const MAX_CUTS = 40
/** A small chunk needs fewer faces than the large one it leans on. */
const SMALL_CHUNK_CUTS = 0.6
/** How far a cut reaches at its shallowest, as a share of the chunk's size. */
const SHALLOW_CUT = 0.98
const DEEPEST_CUT = 0.4
/** The share of a chunk's cuts that shape it. The rest are chips off what they leave. */
const DEEP_SHARE = 0.3
const LOWEST_FACE = -0.08
const CHIP_SMALLEST = 0.18
const CHIP_GROWTH = 0.3
const CHIP_PICKS = 4
const CHIP_TILT = 0.35
const CHIP_FLOOR = 0.4
/** How far the base carries on below the ground, as a share of the height. */
const SINK = 0.04
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const AWAY = 100

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export function normalize(a: Vec3): Vec3 {
    const length = Math.hypot(a[0], a[1], a[2]) || 1

    return [a[0] / length, a[1] / length, a[2] / length]
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
]

/** Positive outside a chunk, negative inside. */
export function distanceToChunk(chunk: RockChunk, p: Vec3): number {
    const local: Vec3 = [p[0] - chunk.centre[0], p[1] - chunk.centre[1], p[2] - chunk.centre[2]]
    let distance = -Infinity

    for (const plane of chunk.planes) {
        distance = Math.max(distance, dot(plane.n, local) - plane.d)
    }

    return distance
}

/** Keeps the part of a polygon behind a plane. */
function clip(polygon: readonly Vec3[], plane: RockPlane): Vec3[] {
    const kept: Vec3[] = []

    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]
        const b = polygon[(i + 1) % polygon.length]
        const da = dot(plane.n, a) - plane.d
        const db = dot(plane.n, b) - plane.d

        if (da <= 0) {
            kept.push(a)
        }

        if (da < 0 !== db < 0) {
            const t = da / (da - db)

            kept.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
        }
    }

    return kept
}

export interface RockFace {
    readonly plane: RockPlane
    /** Corners in world space, turning anticlockwise seen from outside. */
    readonly corners: readonly Vec3[]
}

/**
 * The exact faces of a chunk: each plane starts as a huge square, and every other
 * plane trims it. No grid is involved, so an edge is as sharp as the maths.
 */
export function facesOfChunk(chunk: RockChunk): RockFace[] {
    const faces: RockFace[] = []

    for (const plane of chunk.planes) {
        if (plane.ground) {
            continue
        }

        const helper: Vec3 = Math.abs(plane.n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
        const u = normalize(cross(plane.n, helper))
        const v = cross(plane.n, u)
        const middle: Vec3 = [plane.n[0] * plane.d, plane.n[1] * plane.d, plane.n[2] * plane.d]
        let polygon: Vec3[] = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
        ].map(([a, b]) => [
            middle[0] + (u[0] * a + v[0] * b) * AWAY,
            middle[1] + (u[1] * a + v[1] * b) * AWAY,
            middle[2] + (u[2] * a + v[2] * b) * AWAY,
        ])

        for (const other of chunk.planes) {
            if (other !== plane && polygon.length > 0) {
                polygon = clip(polygon, other)
            }
        }

        if (polygon.length >= 3) {
            faces.push({
                plane,
                corners: polygon.map((p) => [p[0] + chunk.centre[0], p[1] + chunk.centre[1], p[2] + chunk.centre[2]]),
            })
        }
    }

    return faces
}

interface ChunkRecipe {
    readonly centre: Vec3
    readonly radii: Vec3
    /** Share of the rock's cuts this chunk gets. */
    readonly cutShare: number
    /** Below 1, faces stand closer to upright. */
    readonly upright: number
    /** A sloping plane across the top, for moss to sit on. */
    readonly cap?: Vec3
}

/** A cut never faces far downwards, or the stone is undercut and stands on a point. */
const planted = (n: Vec3): Vec3 => normalize([n[0], Math.max(n[1], LOWEST_FACE), n[2]])

function makeChunk(recipe: ChunkRecipe, cutCount: number, cuts: number, random: RandomSource): RockChunk {
    const {centre, radii, upright, cap} = recipe
    const reach = (n: Vec3) => Math.hypot(n[0] * radii[0], n[1] * radii[1], n[2] * radii[2])
    const deepest = SHALLOW_CUT - DEEPEST_CUT * cuts
    // Turned, so the sides of a chunk do not line up with the sides of its neighbours.
    const turn = random() * Math.PI * 2
    const across: Vec3 = [Math.cos(turn), 0, Math.sin(turn)]
    const along: Vec3 = [-Math.sin(turn), 0, Math.cos(turn)]
    const bounds: readonly Vec3[] = [across, along, [-across[0], 0, -across[2]], [-along[0], 0, -along[2]], [0, 1, 0]]
    const planes: RockPlane[] = bounds.map((n) => ({n, d: reach(n), tone: random(), cut: null}))

    planes.push({n: [0, -1, 0], d: centre[1], tone: 0, cut: null, ground: true})

    if (cap) {
        const n = normalize(cap)

        planes.push({n, d: reach(n) * 0.8, tone: random(), cut: null})
    }

    const deepCuts = Math.ceil(cutCount * DEEP_SHARE)

    for (let cut = 0; cut < deepCuts; cut++) {
        const n = planted([randomRange(random, -1, 1), randomRange(random, -1, 1) * upright, randomRange(random, -1, 1)])

        planes.push({n, d: reach(n) * randomRange(random, deepest, SHALLOW_CUT), tone: random(), cut})
    }

    // A random plane often misses what the deep cuts left. A chip always lands:
    // it takes off whichever of a few corners stands out furthest.
    const chipSize = Math.min(radii[0], radii[1], radii[2]) * (CHIP_SMALLEST + cuts * CHIP_GROWTH)

    for (let cut = deepCuts; cut < cutCount; cut++) {
        const corners = facesOfChunk({centre: [0, 0, 0], planes}).flatMap((face) => face.corners)
        let corner: Vec3 = corners[0]

        for (let pick = 0; pick < CHIP_PICKS; pick++) {
            const candidate = corners[Math.floor(random() * corners.length)]

            if (Math.hypot(candidate[0], candidate[1], candidate[2]) > Math.hypot(corner[0], corner[1], corner[2])) {
                corner = candidate
            }
        }

        const n = planted([
            corner[0] + randomRange(random, -CHIP_TILT, CHIP_TILT) * radii[0],
            corner[1] + randomRange(random, -CHIP_TILT, CHIP_TILT) * radii[1] * upright,
            corner[2] + randomRange(random, -CHIP_TILT, CHIP_TILT) * radii[2],
        ])

        // However many chips land in one place, some of the chunk always remains.
        const d = Math.max(dot(n, corner) - chipSize * randomRange(random, 0.5, 1.3), reach(n) * CHIP_FLOOR)

        planes.push({n, d, tone: random(), cut})
    }

    return {centre, planes}
}

function boulderRecipes(count: number, random: RandomSource): ChunkRecipe[] {
    const recipes: ChunkRecipe[] = [{centre: [0, 0.42, 0], radii: [0.5, 0.6, 0.5], cutShare: 1, upright: 1}]

    for (let i = 1; i < count; i++) {
        const azimuth = i * GOLDEN_ANGLE + random()
        // Far enough out to read as its own stone, near enough to lean on the rock.
        const out = randomRange(random, 0.38, 0.46)
        const size = randomRange(random, 0.2, 0.28)

        recipes.push({
            centre: [Math.cos(azimuth) * out, randomRange(random, 0.12, 0.22), Math.sin(azimuth) * out],
            radii: [size, randomRange(random, 0.2, 0.3), size],
            cutShare: SMALL_CHUNK_CUTS,
            upright: 1,
        })
    }

    return recipes
}

/** Stepping up a slope, flat enough on top to carry moss. */
function outcropRecipes(count: number, random: RandomSource): ChunkRecipe[] {
    return Array.from({length: count}, (_, i) => {
        const t = count === 1 ? 0.35 : i / (count - 1)
        const height = Math.max(0.25, 1 - Math.abs(t - 0.35) * 1.05) * randomRange(random, 0.85, 1)

        return {
            centre: [-0.38 + t * 0.76 + randomRange(random, -0.03, 0.03), height * 0.5, randomRange(random, -0.12, 0.12)],
            radii: [randomRange(random, 0.16, 0.26), height * 0.52, randomRange(random, 0.22, 0.34)],
            cutShare: 1 - t * (1 - SMALL_CHUNK_CUTS),
            upright: 0.55,
            cap: [randomRange(random, -0.35, 0.35), 1, randomRange(random, 0, 0.45)],
        } satisfies ChunkRecipe
    })
}

function pillarRecipes(count: number, random: RandomSource): ChunkRecipe[] {
    const recipes: ChunkRecipe[] = [
        {centre: [0, 0.5, 0], radii: [0.42, 0.55, 0.42], cutShare: 1, upright: 0.25, cap: [randomRange(random, -0.5, 0.5), 1, randomRange(random, -0.5, 0.5)]},
    ]

    for (let i = 1; i < count; i++) {
        const azimuth = i * GOLDEN_ANGLE + random()
        const height = randomRange(random, 0.12, 0.45)

        recipes.push({
            centre: [Math.cos(azimuth) * 0.3, height * 0.5, Math.sin(azimuth) * 0.3],
            radii: [randomRange(random, 0.12, 0.2), height * 0.55, randomRange(random, 0.12, 0.2)],
            cutShare: SMALL_CHUNK_CUTS,
            upright: 0.35,
            cap: [randomRange(random, -0.5, 0.5), 1, randomRange(random, -0.5, 0.5)],
        })
    }

    return recipes
}

/** One large mass with wedges standing against it, so it reads as a wall and not a row of posts. */
function cliffRecipes(count: number, random: RandomSource): ChunkRecipe[] {
    const recipes: ChunkRecipe[] = [
        {centre: [0, 0.46, -0.1], radii: [0.5, 0.52, 0.36], cutShare: 1.6, upright: 0.45, cap: [randomRange(random, -0.3, 0.3), 1, 0.7]},
    ]
    const wedges = count - 1

    for (let i = 0; i < wedges; i++) {
        const x = -0.46 + ((i + random()) / wedges) * 0.92
        const edge = Math.abs(x) * 2
        const height = randomRange(random, 0.35, 0.85) * (1 - edge * edge * 0.4)

        // Wide and shallow, overlapping their neighbours: they are the wall's
        // faces, and only stand clear of it near the ground.
        recipes.push({
            centre: [x, height * 0.5, randomRange(random, 0.02, 0.1)],
            radii: [randomRange(random, 0.09, 0.17), height * 0.54, randomRange(random, 0.14, 0.2)],
            cutShare: SMALL_CHUNK_CUTS,
            upright: 0.55,
            cap: [randomRange(random, -1.2, 1.2), 1, randomRange(random, 0.6, 1.6)],
        })
    }

    return recipes
}

const RECIPES: Readonly<Record<RockKind, (count: number, random: RandomSource) => ChunkRecipe[]>> = {
    boulder: boulderRecipes,
    outcrop: outcropRecipes,
    pillar: pillarRecipes,
    cliff: cliffRecipes,
}

/**
 * Stretches a chunk. A plane stays a plane: its normal takes the inverse of the
 * stretch, and its distance is rescaled to match.
 */
function stretched(chunk: RockChunk, offset: Vec3, scale: Vec3, sink: number): RockChunk {
    return {
        centre: [(chunk.centre[0] - offset[0]) * scale[0], (chunk.centre[1] - offset[1]) * scale[1], (chunk.centre[2] - offset[2]) * scale[2]],
        planes: chunk.planes.map((plane) => {
            const inverse: Vec3 = [plane.n[0] / scale[0], plane.n[1] / scale[1], plane.n[2] / scale[2]]
            const length = Math.hypot(inverse[0], inverse[1], inverse[2])

            return {
                ...plane,
                n: normalize(inverse),
                d: plane.d / length + (plane.ground ? sink : 0),
            }
        }),
    }
}

export function planRock(rock: RockPlanParameters, seed: number): RockPlan {
    const count = Math.max(1, Math.round(rock.chunks))
    const recipes = RECIPES[rock.kind](count, createSeededRandom(hashSeed(seed, SEED_LAYOUT)))
    const mainCuts = MIN_CUTS + rock.faces * (MAX_CUTS - MIN_CUTS)
    const unit = recipes.map((recipe, index) =>
        // Each chunk has its own stream, so one more chunk does not reshape the others.
        makeChunk(recipe, Math.round(mainCuts * recipe.cutShare), rock.cuts, createSeededRandom(hashSeed(seed, SEED_CHUNK + index))),
    )

    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]

    for (const chunk of unit) {
        for (const {corners} of facesOfChunk(chunk)) {
            for (const corner of corners) {
                for (let axis = 0; axis < 3; axis++) {
                    min[axis] = Math.min(min[axis], corner[axis])
                    max[axis] = Math.max(max[axis], corner[axis])
                }
            }
        }
    }

    const offset: Vec3 = [(min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2]
    const scale: Vec3 = [rock.width / (max[0] - min[0]), rock.height / max[1], rock.depth / (max[2] - min[2])]
    const sink = rock.height * SINK

    return {
        chunks: unit.map((chunk) => stretched(chunk, offset, scale, sink)),
        width: rock.width,
        height: rock.height,
        depth: rock.depth,
    }
}
