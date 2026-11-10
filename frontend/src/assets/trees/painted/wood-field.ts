/**
 * The wood of a tree as one continuous shape.
 *
 * A signed distance function: negative inside the wood, positive outside.
 * Limbs are melted together by a smooth minimum, so a joint is a soft fillet
 * instead of one tube poking through another. The trunk's ridges, knots and
 * hollow are simply part of the function, which is why they blend too.
 */

import {createSeededRandom, hashSeed, randomRange} from '../../shared/random'
import type {PaintedTreeParameters} from './parameters'
import type {Split} from './damage'
import type {Limb, Vec3} from './plan'

/** How wide a fillet is, as a share of the thinner limb's radius. */
const BLEND = 1.25
const CELL = 0.5
const GRADIENT_STEP = 0.006
const SEED_BURLS = 21
const SEED_HOLLOW = 22
/** How far bumps reach, as a share of the local radius, at full Roughness. */
const ROUGHNESS_DEPTH = 0.09

interface Segment {
    readonly limb: number
    readonly ax: number
    readonly ay: number
    readonly az: number
    readonly bx: number
    readonly by: number
    readonly bz: number
    readonly ra: number
    readonly rb: number
}

export interface WoodField {
    /** The blended distance to the wood. */
    distance(x: number, y: number, z: number): number
    /** A unit vector pointing out of the wood. */
    gradient(x: number, y: number, z: number): Vec3
    /** How far into a ridge's valley a point is, 0 on a crest and 1 at the bottom. */
    valley(x: number, y: number, z: number): number
    /** How the bark pattern paints a point: positive is lighter, negative darker. */
    mark(x: number, y: number, z: number): number
    /**
     * Where a point on a cut face is, or null when the point is on bark: how far inside
     * the bark it is, so rings can follow the wood's outline, and for a break, how far
     * out of the break's middle it stands, 0 to 1, so splinters can be painted.
     */
    cutFace(x: number, y: number, z: number): CutFace | null
    /** How charred a point is, 0 to 1: the inside of a split trunk. */
    charred(x: number, y: number, z: number): number
}

export interface CutFace {
    readonly depth: number
    /** A break rather than a saw cut. */
    readonly broken: boolean
    /** How far out a splinter stands, 0 in the break's hollows and 1 at its tips. */
    readonly rise: number
}

/**
 * A flat cut through the wood, as a saw makes. Everything on the side its normal
 * points to is taken away.
 */
export interface WoodCut {
    readonly point: Vec3
    readonly normal: Vec3
    /**
     * How far splinters stand out of a break, in metres. Left out, a flat saw cut.
     * They run along the normal, as wood breaks along its grain.
     */
    readonly jag?: number
    /** How far apart the splinters are, in metres. */
    readonly grain?: number
    /** How far round its point the cut reaches. Left out, it cuts everything on its side. */
    readonly reach?: number
}

/** A cut with what's needed to work out its splinters, ready to be asked millions of times. */
interface PreparedCut extends WoodCut {
    readonly u: Vec3
    readonly v: Vec3
    readonly k: number
}

function prepareCut(cut: WoodCut): PreparedCut {
    const n = cut.normal
    const other: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const along = n[0] * other[0] + n[1] * other[1] + n[2] * other[2]
    const raw: Vec3 = [other[0] - n[0] * along, other[1] - n[1] * along, other[2] - n[2] * along]
    const length = Math.hypot(raw[0], raw[1], raw[2]) || 1
    const u: Vec3 = [raw[0] / length, raw[1] / length, raw[2] / length]
    const v: Vec3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]]

    return {...cut, u, v, k: (Math.PI * 2) / Math.max(cut.grain ?? 1, 1e-3)}
}

/** How far a break's splinters stand out at a point of its face, 0 to 1: a few long tips, crossed. */
function splinterAt(cut: PreparedCut, x: number, y: number, z: number): number {
    const dx = x - cut.point[0]
    const dy = y - cut.point[1]
    const dz = z - cut.point[2]
    const a = (dx * cut.u[0] + dy * cut.u[1] + dz * cut.u[2]) * cut.k
    const b = (dx * cut.v[0] + dy * cut.v[1] + dz * cut.v[2]) * cut.k
    const across = 0.5 + 0.5 * Math.sin(a + 1.7 * Math.sin(b * 0.83 + 0.4))
    const along = 0.5 + 0.5 * Math.sin(b * 1.31 + 1.3 * Math.sin(a * 0.71 + 1.1))
    // And one tall splinter in the middle, broad enough for every level to keep, so a
    // lighter level of a broken tree is as tall as the full one.
    const middle = Math.max(0, 1 - Math.hypot(a, b) / Math.PI) ** 2

    return Math.max((across * along) ** 1.5, middle)
}

/** A pattern's wavelength as a share of the trunk's radius: about four grid cells. */
const PATTERN_WAVELENGTH = 1.25
/** How far a pattern carves, as a share of the local radius, at full depth. */
const PATTERN_CARVE = 0.2

/** How quickly the pattern fades going into a join: at 1 it is gone only at the very middle. */
const JOIN_PATTERN_FADE = 1.6

/** How far below the ground the wood is sliced flat, against the trunk's radius. Deeper than a root's tip reaches. */
const BURIED_DEPTH = 0.6

/** How wide a split opens at its widest, against the trunk's radius there: wide enough for the grid to carry. */
const SPLIT_WIDTH = 0.42

/** How close to a cut a point must be to count as on its face, against the trunk's radius. */
const CUT_TOLERANCE = 0.04

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * A bark pattern at a point: how far it stands out, and how it paints.
 *
 * Built from waves in world space, so it needs no unwrapping and carries across
 * joints. It has to be big: both carving and paint live on the mesh's vertices,
 * so nothing finer than a few grid cells can show.
 */
function barkPatternAt(
    pattern: PaintedTreeParameters['barkPattern'],
    k: number,
    x: number,
    y: number,
    z: number,
    trunkX: number,
    trunkZ: number,
): {carve: number; paint: number} {
    switch (pattern) {
        case 'ringed': {
            const ring = Math.abs(Math.sin(y * k + Math.sin(x * k * 0.3) * 0.25))

            return {carve: Math.sqrt(ring) - 0.6, paint: ring - 0.75}
        }

        case 'plated': {
            const u = (x * 0.8 + z * 0.6 + y * 0.55) * k
            const v = (x * 0.6 - z * 0.8 - y * 0.55) * k + Math.sin(y * k * 0.4)
            const crack = 1 - clamp01(Math.min(Math.abs(Math.sin(u)), Math.abs(Math.sin(v))) / 0.45)

            return {carve: 0.35 - crack, paint: 0.2 - crack * 1.1}
        }

        case 'banded': {
            const wobble = Math.sin(x * 2.1 + z * 1.7) * 1.7
            const band = clamp01((Math.sin(y * k * 0.9 + wobble) - 0.45) / 0.35)
            const gap = clamp01((Math.sin(x * k * 0.7 - z * k * 0.6 + y * 0.8) + 0.2) / 0.4)
            const dash = band * gap

            return {carve: -dash * 0.4, paint: 0.3 - dash * 1.4}
        }

        case 'peeling': {
            const blotch =
                Math.sin(x * k * 0.6 + Math.sin(y * k * 0.5) * 1.3) *
                Math.sin(y * k * 0.45 + Math.sin(z * k * 0.6) * 1.1) *
                Math.sin(z * k * 0.55 + x * k * 0.3)
            const patch = clamp01(blotch * 3 + 0.5)

            return {carve: patch * 0.5 - 0.25, paint: patch * 1.1 - 0.4}
        }

        case 'fibrous': {
            const fibre = Math.sin(Math.atan2(z - trunkZ, x - trunkX) * 11 + y * k * 0.18 + Math.sin(y * k * 0.3))

            return {carve: fibre * 0.35, paint: fibre * 0.4}
        }

        case 'none':
            return {carve: 0, paint: 0}
    }
}

/**
 * How much of the bark pattern shows at a point, by how far into a join it is.
 *
 * In the narrow crotch between two limbs a carved mark reads as a hole, and the wood
 * left beside it as a sliver, so the pattern fades out where limbs blend.
 */
const clearOfJoin = (join: number) => {
    const t = clamp01(join * JOIN_PATTERN_FADE)

    return 1 - t * t * (3 - 2 * t)
}

const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`

const smoothMin = (a: number, b: number, k: number) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k

    return Math.min(a, b) - h * h * k * 0.25
}

export function createWoodField(
    limbs: readonly Limb[],
    tree: PaintedTreeParameters,
    seed: number,
    included: (limb: Limb, segment: number) => boolean,
    cuts: readonly WoodCut[] = [],
    split: Split | null = null,
): WoodField {
    const prepared = cuts.map(prepareCut)
    const segments: Segment[] = []
    const grid = new Map<string, number[]>()

    for (const limb of limbs) {
        for (let index = 1; index < limb.points.length; index++) {
            if (!included(limb, index - 1)) {
                continue
            }

            const a = limb.points[index - 1]
            const b = limb.points[index]
            const ra = limb.radii[index - 1]
            const rb = limb.radii[index]
            const id = segments.length
            const reach = Math.max(ra, rb) * (1 + BLEND + tree.flare + 0.6) + 0.3

            segments.push({
                limb: limb.id,
                ax: a[0],
                ay: a[1],
                az: a[2],
                bx: b[0],
                by: b[1],
                bz: b[2],
                ra,
                rb,
            })

            const low = [0, 1, 2].map((axis) => Math.floor((Math.min(a[axis], b[axis]) - reach) / CELL))
            const high = [0, 1, 2].map((axis) => Math.floor((Math.max(a[axis], b[axis]) + reach) / CELL))

            for (let x = low[0]; x <= high[0]; x++) {
                for (let y = low[1]; y <= high[1]; y++) {
                    for (let z = low[2]; z <= high[2]; z++) {
                        const key = cellKey(x, y, z)
                        const cell = grid.get(key)

                        if (cell) {
                            cell.push(id)
                        } else {
                            grid.set(key, [id])
                        }
                    }
                }
            }
        }
    }

    // A piece cut from one branch has no trunk: nothing is ridged, flared or knotted as one.
    const trunk = limbs[0]?.level === 0 ? limbs[0] : undefined
    const trunkTop = trunk ? trunk.points[trunk.points.length - 1][1] : 1
    const trunkAt = (y: number): {x: number; z: number; r: number} => {
        if (!trunk) {
            return {x: 0, z: 0, r: 0.1}
        }

        const last = trunk.points.length - 1
        const position = Math.min(Math.max(y / Math.max(trunkTop, 1e-6), 0), 1) * last
        const index = Math.min(Math.floor(position), last - 1)
        const a = trunk.points[index]
        const b = trunk.points[index + 1]
        const f = position - index

        return {
            x: a[0] + (b[0] - a[0]) * f,
            z: a[2] + (b[2] - a[2]) * f,
            r: trunk.radii[index] + (trunk.radii[index + 1] - trunk.radii[index]) * f,
        }
    }

    const ridgeFade = (y: number) => Math.min(1, Math.max(0, 1 - y / (trunkTop * 0.95)))
    const ridgeWave = (x: number, y: number, z: number, cx: number, cz: number) =>
        Math.sin(tree.ridgeCount * Math.atan2(z - cz, x - cx) + y * tree.ridgeTwist)

    // Knots sit on the surface of the trunk, between the roots and the fork.
    const burlRandom = createSeededRandom(hashSeed(seed, SEED_BURLS))
    const burls = Array.from({length: trunk ? tree.burls : 0}, () => {
        const y = trunkTop * randomRange(burlRandom, 0.2, 0.85)
        const azimuth = burlRandom() * Math.PI * 2
        const at = trunkAt(y)

        return {
            x: at.x + Math.cos(azimuth) * at.r * 0.92,
            y,
            z: at.z + Math.sin(azimuth) * at.r * 0.92,
            r: at.r * randomRange(burlRandom, 0.24, 0.42),
        }
    })

    const hollowRandom = createSeededRandom(hashSeed(seed, SEED_HOLLOW))
    const hollowAzimuth = hollowRandom() * Math.PI * 2
    const hollowAt = trunkAt(trunkTop * 0.3)
    const hollow = {
        x: hollowAt.x + Math.cos(hollowAzimuth) * hollowAt.r,
        y: trunkTop * 0.3,
        z: hollowAt.z + Math.sin(hollowAzimuth) * hollowAt.r,
        r: trunk ? hollowAt.r * tree.hollow * 0.85 : 0,
    }

    const patternK = Math.PI / (PATTERN_WAVELENGTH * tree.trunkRadius * tree.patternScale)
    const patternAt = (x: number, y: number, z: number) => {
        const at = trunkAt(y)

        return barkPatternAt(tree.barkPattern, patternK, x, y, z, at.x, at.z)
    }

    /** How far a point is from the split's open wedge: negative inside it. Infinity where there's none. */
    const splitAt = (x: number, y: number, z: number): {slot: number; open: boolean} => {
        if (!split || y < split.low || y > split.high) {
            return {slot: Infinity, open: false}
        }

        const at = trunkAt(y)
        const shape = Math.sin((Math.PI * (y - split.low)) / (split.high - split.low))
        const cos = Math.cos(split.azimuth)
        const sin = Math.sin(split.azimuth)
        const lateral = Math.abs(-(x - at.x) * sin + (z - at.z) * cos)
        const along = (x - at.x) * cos + (z - at.z) * sin
        const floor = at.r * (1 - split.depth * shape)

        return {slot: Math.max(lateral - at.r * SPLIT_WIDTH * shape, floor - along), open: along > floor - at.r * 0.15}
    }

    // How far into a join between two limbs the last point measured was, 0 to 1. Kept
    // here rather than returned, as the distance is asked for millions of times.
    let lastJoin = 0
    // And how far the last point was from the uncut wood, and from the cuts.
    let lastUncut = 1
    let lastCut = -Infinity
    let lastCutBy: PreparedCut | null = null
    let lastRise = 0

    const distance = (x: number, y: number, z: number): number => {
        lastJoin = 0
        lastCut = -Infinity
        lastCutBy = null
        lastRise = 0

        const cell = grid.get(
            cellKey(Math.floor(x / CELL), Math.floor(y / CELL), Math.floor(z / CELL)),
        )

        if (!cell) {
            return 1
        }

        // The nearest point of each limb first, so the joints between one
        // limb's own segments are never blended into a bulge.
        const limbIds: number[] = []
        const limbDistances: number[] = []
        const limbRadii: number[] = []

        for (const id of cell) {
            const s = segments[id]
            const abx = s.bx - s.ax
            const aby = s.by - s.ay
            const abz = s.bz - s.az
            const lengthSquared = abx * abx + aby * aby + abz * abz
            const t =
                lengthSquared < 1e-12
                    ? 0
                    : Math.min(
                          1,
                          Math.max(
                              0,
                              ((x - s.ax) * abx + (y - s.ay) * aby + (z - s.az) * abz) / lengthSquared,
                          ),
                      )
            const cx = s.ax + abx * t
            const cy = s.ay + aby * t
            const cz = s.az + abz * t
            const r = s.ra + (s.rb - s.ra) * t
            let d = Math.hypot(x - cx, y - cy, z - cz) - r

            if (trunk && s.limb === trunk.id) {
                d -= r * tree.ridgeDepth * ridgeFade(cy) * ridgeWave(x, y, z, cx, cz)
                d -= r * tree.flare * Math.exp(-Math.max(y, 0) / Math.max(r * 0.8, 0.05))
            }

            const known = limbIds.indexOf(s.limb)

            if (known < 0) {
                limbIds.push(s.limb)
                limbDistances.push(d)
                limbRadii.push(r)
            } else if (d < limbDistances[known]) {
                limbDistances[known] = d
                limbRadii[known] = r
            }
        }

        if (limbIds.length === 0) {
            return 1
        }

        let result = limbDistances[0]
        let radius = limbRadii[0]

        for (let index = 1; index < limbIds.length; index++) {
            const d = limbDistances[index]
            const r = limbRadii[index]

            const k = Math.max(BLEND * Math.min(r, radius), 1e-6)

            lastJoin = Math.max(lastJoin, Math.max(k - Math.abs(result - d), 0) / k)
            result = smoothMin(result, d, k)
            radius = Math.max(r, radius)
        }

        for (const burl of burls) {
            result = smoothMin(
                result,
                Math.hypot(x - burl.x, y - burl.y, z - burl.z) - burl.r,
                burl.r * 0.9,
            )
        }

        if (tree.roughness > 0) {
            result -=
                radius *
                ROUGHNESS_DEPTH *
                tree.roughness *
                Math.sin(x * 7.3 + y * 2.1) *
                Math.sin(y * 6.1 + z * 3.7) *
                Math.sin(z * 8.3 + x * 2.9)
        }

        if (tree.barkPattern !== 'none') {
            result -= radius * PATTERN_CARVE * tree.patternDepth * patternAt(x, y, z).carve * clearOfJoin(lastJoin)
        }

        if (hollow.r > 0.001) {
            // The negative of a smooth union with the opening's inside.
            const inside = Math.hypot(x - hollow.x, (y - hollow.y) * 0.6, z - hollow.z) - hollow.r

            result = -smoothMin(-result, inside, hollow.r * 0.5)
        }

        if (split) {
            result = Math.max(result, -splitAt(x, y, z).slot)
        }

        // A flat base, so the wood is closed however high a prop is placed, and spends
        // nothing on carrying its flare on down out of sight.
        result = Math.max(result, -y - tree.trunkRadius * BURIED_DEPTH)
        lastUncut = result

        for (const cut of prepared) {
            const dx = x - cut.point[0]
            const dy = y - cut.point[1]
            const dz = z - cut.point[2]

            if (cut.reach !== undefined && dx * dx + dy * dy + dz * dz > cut.reach * cut.reach) {
                continue
            }

            const rise = cut.jag ? splinterAt(cut, x, y, z) : 0
            const d = dx * cut.normal[0] + dy * cut.normal[1] + dz * cut.normal[2] - rise * (cut.jag ?? 0)

            if (d > lastCut) {
                lastCut = d
                lastCutBy = cut
                lastRise = rise
            }
        }

        return Math.max(result, lastCut)
    }

    return {
        distance,

        gradient(x, y, z) {
            // A tetrahedron of samples: four evaluations, no axis bias.
            const e = GRADIENT_STEP
            const a = distance(x + e, y - e, z - e)
            const b = distance(x - e, y - e, z + e)
            const c = distance(x - e, y + e, z - e)
            const d = distance(x + e, y + e, z + e)
            const gx = a - b - c + d
            const gy = -a - b + c + d
            const gz = -a + b - c + d
            const length = Math.hypot(gx, gy, gz)

            return length < 1e-9 ? [0, 1, 0] : [gx / length, gy / length, gz / length]
        },

        valley(x, y, z) {
            const at = trunkAt(y)

            return (0.5 - 0.5 * ridgeWave(x, y, z, at.x, at.z)) * ridgeFade(y)
        },

        mark(x, y, z) {
            if (tree.barkPattern === 'none') {
                return 0
            }

            distance(x, y, z)

            return patternAt(x, y, z).paint * tree.patternDepth * clearOfJoin(lastJoin)
        },

        charred(x, y, z) {
            const {slot, open} = splitAt(x, y, z)

            return open ? clamp01(1 - Math.abs(slot) / (tree.trunkRadius * 0.3)) : 0
        },

        cutFace(x, y, z) {
            if (prepared.length === 0) {
                return null
            }

            distance(x, y, z)

            // On a cut face the cut is what holds the surface, and the wood runs on past it.
            if (!lastCutBy || lastCut <= lastUncut - CUT_TOLERANCE * tree.trunkRadius) {
                return null
            }

            return {depth: Math.max(-lastUncut, 0), broken: (lastCutBy.jag ?? 0) > 0, rise: lastRise}
        },
    }
}
