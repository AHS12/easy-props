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
): WoodField {
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

    const trunk = limbs[0]
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
    const burls = Array.from({length: tree.burls}, () => {
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
        r: hollowAt.r * tree.hollow * 0.85,
    }

    const distance = (x: number, y: number, z: number): number => {
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

            result = smoothMin(result, d, Math.max(BLEND * Math.min(r, radius), 1e-6))
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

        if (hollow.r > 0.001) {
            // The negative of a smooth union with the opening's inside.
            const inside = Math.hypot(x - hollow.x, (y - hollow.y) * 0.6, z - hollow.z) - hollow.r

            result = -smoothMin(-result, inside, hollow.r * 0.5)
        }

        return result
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
    }
}
