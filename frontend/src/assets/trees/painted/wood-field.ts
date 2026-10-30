/**
 * The wood of a tree as one continuous shape.
 *
 * A signed distance function: negative inside the wood, positive outside.
 * Limbs are melted together by a smooth minimum, so a joint is a soft fillet
 * instead of one tube poking through another, and the trunk's twisted ridges
 * are simply part of the function. The mesh is then fitted to this shape, so
 * it keeps the clean rings of a swept tube and the look of a sculpted one.
 */

import type {Limb, Vec3} from './plan'

/** How wide a fillet is, as a share of the thinner limb's radius. */
const BLEND = 1.25
const CELL = 0.5
/** Twist of the trunk's ridges, in radians per metre. */
const RIDGE_TWIST = 0.85
const RIDGE_COUNT = 5
/** Ridge depth as a share of the local trunk radius. */
const RIDGE_DEPTH = 0.2
/** How much the trunk swells where it meets the ground, as a share of its radius. */
const FLARE = 0.34
const GRADIENT_STEP = 0.006

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

export function createWoodField(
    limbs: readonly Limb[],
    gnarl: number,
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
            const reach = Math.max(ra, rb) * (1 + BLEND + FLARE) + 0.3

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
    const ridgeFade = (y: number) => Math.min(1, Math.max(0, 1 - y / (trunkTop * 0.95)))
    const ridgeWave = (x: number, y: number, z: number, cx: number, cz: number) =>
        Math.sin(RIDGE_COUNT * Math.atan2(z - cz, x - cx) + y * RIDGE_TWIST * (0.35 + gnarl))

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
                d -= r * RIDGE_DEPTH * (0.45 + 0.55 * gnarl) * ridgeFade(cy) * ridgeWave(x, y, z, cx, cz)
                d -= r * FLARE * Math.exp(-Math.max(y, 0) / Math.max(r * 0.8, 0.05))
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
            const h = Math.max(k - Math.abs(result - d), 0) / k

            result = Math.min(result, d) - h * h * k * 0.25
            radius = Math.max(r, radius)
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
            if (!trunk) {
                return 0
            }

            const last = trunk.points.length - 1
            const position = Math.min(Math.max(y / Math.max(trunkTop, 1e-6), 0), 1) * last
            const index = Math.min(Math.floor(position), last - 1)
            const a = trunk.points[index]
            const b = trunk.points[index + 1]
            const f = position - index
            const wave = ridgeWave(x, y, z, a[0] + (b[0] - a[0]) * f, a[2] + (b[2] - a[2]) * f)

            return (0.5 - 0.5 * wave) * ridgeFade(y)
        },
    }
}
