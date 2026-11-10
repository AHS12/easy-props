/**
 * The bark mesh, in two kinds of geometry that meet out of sight.
 *
 * Heavy wood is sculpted: the blended wood field is sampled on a sparse grid
 * and turned into a surface by surface nets, then settled onto the exact field.
 * That is the only way a joint can be a true fillet; tube rings are too far
 * apart to hold one. Normals come from the field, so it shades as one piece.
 *
 * Thin wood is swept: tapered tubes of a few sides, ending in a point. A tube
 * starts inside the sculpted wood, so the change of method is never seen, and
 * a fine branch costs a few triangles instead of a very fine grid.
 *
 * Building one is split into stages, so the heavy stage can run on many threads
 * at once. `buildBark` runs them all in place.
 */

import * as THREE from 'three'
import {joinChunks, packedCell as packed, sculptCells, type MeshBuffers, type SurfaceChunk} from '../../shared/surface-nets'
import {resolvePalette, type PaintedTreeParameters} from './parameters'
import {cross, normalize, perpendicularTo, type Limb, type TreePlan, type Vec3} from './plan'
import {createWoodField, type WoodCut, type WoodField} from './wood-field'
import {mossFacing, weatherPaint} from '../../shared/weather'

/** Below these shares of full detail, the thin wood they name is left out. */
const TWIGS_DROPPED_BELOW = 0.2
/** The least detail the viewport ever asks for. Below it is an export's lighter level. */
const FULL_FLOOR_DETAIL = 0.68
const BRANCHES_DROPPED_BELOW = 0.13
/** Grid size against trunk radius, at full detail. */
const CELL_SHARE = 0.27
const MIN_CELL = 0.05
/** Wood thinner than this many cells cannot be sculpted cleanly. */
const SCULPT_MIN_CELLS = 1.15
/** Thinner than this, a trunk is a bush's stem, and a tube suits it. */
const SLIM_TRUNK_MIN = 0.12
/** How far out occlusion looks, as a share of the trunk radius. */
const OCCLUSION_REACH = 0.42
const MOSS_COLOUR = '#6c9a3c'
/** How shut in a point must be before it counts as a crease, and over how much that takes hold. */
const CREASE_FROM = 0.3
const CREASE_SPAN = 0.3
const CREASE_STRENGTH = 0.6
const CREASE_DARKNESS = 0.6
/** How late along a thin limb its tip's ink sets in. Above 1 keeps most of it the colour of the wood. */
const INK_CURVE = 2

/** How far inside the sculpted wood a tube runs before it comes out, against its own radius. */
const TUBE_TUCK = 0.8
/**
 * The thickest a tube may start, against the wood it grows out of. Thin wood keeps
 * a least thickness, so a twig can be as thick as its branch, and its open end
 * would show through the branch's side, all the more where that has few sides.
 */
const BASE_IN_HOST = 0.5
/** How far down a branching trunk's top narrows into the limb that carries on, against its radius there. */
const TRUNK_TOP_REACH = 4
/** How far either side of a join the sculpted wood is shaded fully, then partly, as a plain limb, against the radius. */
const JOIN_SHADE_FULL = 1
const JOIN_SHADE_REACH = 1.8

/**
 * How many sides a tube gets, by its radius where it starts.
 *
 * A tube that carries on from sculpted wood keeps as many sides as the round wood
 * needs, or its corners poke through the wood in stripes where the two meet.
 */
function sidesFor(radius: number, level: number, detail: number, fromSculpted: boolean): number {
    if (level === 3) {
        return 3
    }

    const sides = Math.round((radius > 0.1 ? 8 : radius > 0.04 ? 6 : 4) * detail)

    return Math.max(level === 0 && radius > 0.15 ? 5 : 3, fromSculpted ? Math.round(8 * Math.min(detail, 1)) : 0, sides)
}

function tangentAt(limb: Limb, ring: number): Vec3 {
    const last = limb.points.length - 1
    const a = limb.points[Math.max(ring - 1, 0)]
    const b = limb.points[Math.min(ring + 1, last)]

    return normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]])
}

/** Everything the stages of one bark share. Built the same way on every thread. */
export interface BarkContext {
    readonly plan: TreePlan
    readonly tree: PaintedTreeParameters
    readonly detail: number
    readonly field: WoodField
    readonly cell: number
    readonly sculptMin: number
    readonly isSculpted: (limb: Limb, segment: number) => boolean
    readonly sculptedSegments: readonly {a: Vec3; b: Vec3; radius: number}[]
    /** Turns a direction into how it will face once the wood is laid where it goes. */
    readonly orient: (v: Vec3) => Vec3
    /** Where the wood is sawn through, for a piece cut from a tree. */
    readonly cuts: readonly WoodCut[]
}

/**
 * How a piece is cut from a tree: where it is sawn through, and how it will lie,
 * so light, moss and snow can be painted for where it ends up.
 */
export interface PieceCut {
    readonly cuts: readonly WoodCut[]
    /** Turns a direction in the tree into the same direction once the piece is laid down. */
    readonly orient: (v: Vec3) => Vec3
}

const UPRIGHT = (v: Vec3): Vec3 => v

/** A cut face, pale wood in rings that follow its outline, and a rim of bark. */
export const HEARTWOOD = new THREE.Color('#e4c391')
const RING = new THREE.Color('#a87a4a')
/** The narrowest a break's splinters may be, in grid cells. */
const SPLINTER_CELLS = 3.5
/** A break: fresh pale wood at the splinters' tips, darker down between them. */
const SPLINTER = new THREE.Color('#e2c896')
const SPLINTER_HOLLOW = new THREE.Color('#7a5a36')
/** The inside of a trunk split by lightning. */
const CHARRED = new THREE.Color('#1a1512')
/** How far apart the rings are, and how thick the bark at the rim is, against the trunk's radius. */
const RING_SPACING = 0.11
const RIM = 0.07

/** One slice of the sculpting, which can be worked on anywhere. */
export type BarkChunk = SurfaceChunk

/** A finished bark, as plain arrays that can cross between threads. */
export interface BarkArrays {
    readonly positions: Float32Array
    readonly normals: Float32Array
    readonly colors: Float32Array
    readonly uvs: Float32Array
    readonly indices: Uint32Array
}

/** How many times the bark texture wraps around a limb, by the limb's level, at Bark size 1. */
const BARK_WRAPS = [3, 2, 1, 1]
/** Below this a limb's end counts as this thick, so the mapping stays finite at a point. */
const MAPPED_RADIUS_FLOOR = 0.012

/** A limb, ready to have points on its surface placed on the bark texture. */
interface MappedLimb {
    readonly limb: Limb
    /** Which way "around" starts at each point, carried along so it never spins. */
    readonly frames: readonly Vec3[]
    /** How far along the texture each point is. */
    readonly along: readonly number[]
    readonly wraps: number
    readonly low: Vec3
    readonly high: Vec3
    readonly reach: number
}

function mapLimb(limb: Limb, barkSize: number): MappedLimb {
    const wraps = Math.max(1, Math.round((BARK_WRAPS[limb.level] ?? 1) / barkSize))
    const frames: Vec3[] = []
    const along = [0]
    let frame = perpendicularTo(tangentAt(limb, 0))

    for (let at = 0; at < limb.points.length; at++) {
        const tangent = tangentAt(limb, at)
        const drift = frame[0] * tangent[0] + frame[1] * tangent[1] + frame[2] * tangent[2]

        frame = normalize([frame[0] - tangent[0] * drift, frame[1] - tangent[1] * drift, frame[2] - tangent[2] * drift])
        frames.push(frame)

        if (at > 0) {
            const a = limb.points[at - 1]
            const b = limb.points[at]
            const radius = Math.max((limb.radii[at - 1] + limb.radii[at]) / 2, MAPPED_RADIUS_FLOOR)

            along.push(along[at - 1] + (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / radius) * (wraps / (Math.PI * 2)))
        }
    }

    const axis = (index: number) => limb.points.map((point) => point[index])

    return {
        limb,
        frames,
        along,
        wraps,
        low: [Math.min(...axis(0)), Math.min(...axis(1)), Math.min(...axis(2))],
        high: [Math.max(...axis(0)), Math.max(...axis(1)), Math.max(...axis(2))],
        reach: Math.max(...limb.radii),
    }
}

/** Where a point lands on a limb's texture, and how far outside the limb it is. */
function placeOnLimb({limb, frames, along, wraps}: MappedLimb, x: number, y: number, z: number) {
    let gap = Infinity
    let u = 0
    let v = 0

    for (let at = 0; at < limb.points.length - 1; at++) {
        const a = limb.points[at]
        const b = limb.points[at + 1]
        const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
        const raw = ((x - a[0]) * ab[0] + (y - a[1]) * ab[1] + (z - a[2]) * ab[2]) / Math.max(ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2], 1e-9)
        const share = Math.min(1, Math.max(0, raw))
        const here = Math.hypot(x - a[0] - ab[0] * share, y - a[1] - ab[1] * share, z - a[2] - ab[2] * share) - (limb.radii[at] + (limb.radii[at + 1] - limb.radii[at]) * share)

        if (here < gap) {
            // Past either end of the limb the texture carries on, or a flare or a rounded
            // tip would all land on one line of it and smear.
            const past = (at === 0 && raw < 0) || (at === limb.points.length - 2 && raw > 1) ? raw : share
            const off: Vec3 = [x - a[0] - ab[0] * past, y - a[1] - ab[1] * past, z - a[2] - ab[2] * past]
            const frame = frames[at]
            const side = cross(tangentAt(limb, at), frame)
            const angle = Math.atan2(off[0] * side[0] + off[1] * side[1] + off[2] * side[2], off[0] * frame[0] + off[1] * frame[1] + off[2] * frame[2])
            const radius = Math.max(limb.radii[at] + (limb.radii[at + 1] - limb.radii[at]) * share, MAPPED_RADIUS_FLOOR)

            gap = here
            u = (angle / (Math.PI * 2)) * wraps
            // Spreading outwards from the limb, as at a trunk's flare, counts as going back down it.
            v = along[at] + (along[at + 1] - along[at]) * past - (Math.max(here, 0) / radius) * (wraps / (Math.PI * 2))
        }
    }

    return {gap, u, v}
}

/**
 * Prints the bark texture along each limb, as real bark grows.
 *
 * Going around, it repeats a whole number of times, so it closes with no seam. Going
 * along, each step counts for its length over the limb's radius. That keeps a plate's
 * shape as the limb tapers, so plates simply shrink towards the twigs. A face belongs
 * to the nearest limb, and a vertex shared between two limbs or across the texture's
 * edge simply becomes two, leaving the number of faces alone.
 */
function printAlongLimbs(buffers: MeshBuffers, limbs: readonly Limb[], barkSize: number): {buffers: MeshBuffers; uvs: number[]} {
    const {positions: p, normals: n, colors: c, indices} = buffers
    const mapped = limbs.map((limb) => mapLimb(limb, barkSize))
    const out: MeshBuffers = {positions: [], normals: [], colors: [], indices: []}
    const uvs: number[] = []
    const owners = new Map<number, number>()
    const copies = new Map<number, number>()
    let lastOwner = 0

    const ownerOf = (vertex: number): number => {
        const known = owners.get(vertex)

        if (known !== undefined) {
            return known
        }

        const [x, y, z] = [p[vertex * 3], p[vertex * 3 + 1], p[vertex * 3 + 2]]
        // Neighbouring vertices mostly share a limb, so that one gives a close bound to
        // start from, and any limb whose box lies further away than that is skipped.
        let owner = lastOwner
        let least = placeOnLimb(mapped[owner], x, y, z).gap

        mapped.forEach((entry, index) => {
            const outside = Math.hypot(
                Math.max(entry.low[0] - x, 0, x - entry.high[0]),
                Math.max(entry.low[1] - y, 0, y - entry.high[1]),
                Math.max(entry.low[2] - z, 0, z - entry.high[2]),
            )

            if (index !== lastOwner && outside - entry.reach < least) {
                const {gap} = placeOnLimb(entry, x, y, z)

                if (gap < least) {
                    least = gap
                    owner = index
                }
            }
        })

        owners.set(vertex, owner)
        lastOwner = owner

        return owner
    }

    for (let at = 0; at < indices.length; at += 3) {
        const corners = [indices[at], indices[at + 1], indices[at + 2]]
        const owned = corners.map(ownerOf)
        const owner = owned[1] === owned[2] ? owned[1] : owned[0]
        const {wraps} = mapped[owner]
        const placed = corners.map((vertex) => placeOnLimb(mapped[owner], p[vertex * 3], p[vertex * 3 + 1], p[vertex * 3 + 2]))
        const furthest = Math.max(...placed.map(({u}) => u))

        for (let corner = 0; corner < 3; corner++) {
            const vertex = corners[corner]
            // A face across the texture's edge reads its low corners one whole round on.
            const onward = furthest - placed[corner].u > wraps / 2
            const key = (vertex * mapped.length + owner) * 2 + (onward ? 1 : 0)
            let copy = copies.get(key)

            if (copy === undefined) {
                copy = out.positions.length / 3
                copies.set(key, copy)
                out.positions.push(p[vertex * 3], p[vertex * 3 + 1], p[vertex * 3 + 2])
                out.normals.push(n[vertex * 3], n[vertex * 3 + 1], n[vertex * 3 + 2])
                out.colors.push(c[vertex * 3], c[vertex * 3 + 1], c[vertex * 3 + 2])
                uvs.push(placed[corner].u + (onward ? wraps : 0), placed[corner].v)
            }

            out.indices.push(copy)
        }
    }

    return {buffers: out, uvs}
}

/**
 * The cells near the wood, as i, j, k triples: a tree is mostly air.
 */
export function listBarkCells({sculptedSegments, cell}: BarkContext): Int32Array {
    const seen = new Set<number>()
    const cells: number[] = []

    for (const {a, b, radius} of sculptedSegments) {
        const reach = radius * 2.2 + cell * 2
        const minI = Math.floor((Math.min(a[0], b[0]) - reach) / cell)
        const maxI = Math.floor((Math.max(a[0], b[0]) + reach) / cell)
        const minJ = Math.floor((Math.min(a[1], b[1]) - reach) / cell)
        const maxJ = Math.floor((Math.max(a[1], b[1]) + reach) / cell)
        const minK = Math.floor((Math.min(a[2], b[2]) - reach) / cell)
        const maxK = Math.floor((Math.max(a[2], b[2]) + reach) / cell)

        for (let i = minI; i <= maxI; i++) {
            for (let j = minJ; j <= maxJ; j++) {
                for (let k = minK; k <= maxK; k++) {
                    const key = packed(i, j, k)

                    if (!seen.has(key)) {
                        seen.add(key)
                        cells.push(i, j, k)
                    }
                }
            }
        }
    }

    return Int32Array.from(cells)
}

/**
 * Works out the surface inside a slice of the cells.
 *
 * Almost all of the time goes here, and no slice needs another's result, so
 * slices can run at once and be joined in order by `assembleBark`.
 */
export function sculptBarkCells(context: BarkContext, cells: Int32Array): BarkChunk {
    const paintWood = woodPainter(context)

    return sculptCells(context.field, cells, context.cell, (x, y, z, n, colors) => {
        const paint = paintWood(x, y, z, n)

        colors.push(paint.r, paint.g, paint.b)
    })
}

/**
 * How wood is coloured at a point. Sculpted and swept wood both start from this, so
 * the place one becomes the other cannot show as a change of colour.
 */
function woodPainter({field, tree, orient, cell}: BarkContext): (x: number, y: number, z: number, n: Vec3, ink?: THREE.Color, inkShare?: number) => THREE.Color {
    const palette = resolvePalette(tree)
    const deep = new THREE.Color(palette.barkDeep)
    const light = new THREE.Color(palette.barkLight)
    const paint = new THREE.Color()
    const moss = new THREE.Color(MOSS_COLOUR)
    const crease = deep.clone().multiplyScalar(CREASE_DARKNESS)
    const occlusionReach = tree.trunkRadius * OCCLUSION_REACH

    const ringLight = HEARTWOOD.clone()
    const ringDark = RING.clone()
    const rimColour = deep.clone()

    // A thin limb's ink goes under the snow, so snow still lies along a twig.
    return (x, y, z, inTree, ink, inkShare = 0) => {
        // Lit, mossed and snowed on as it will lie, which for a fallen piece isn't as it grew.
        const n = orient(inTree)
        const face = field.cutFace(x, y, z)

        if (face !== null) {
            const cutAt = face.depth
            const rim = tree.trunkRadius * RIM

            if (face.broken) {
                paint.copy(SPLINTER).lerp(SPLINTER_HOLLOW, (1 - face.rise) ** 2 * 0.7)
            } else {
                // Rings finer than the points could carry would only flicker, so a few wide ones stand for them.
                const ring = 0.5 + 0.5 * Math.sin((cutAt / Math.max(tree.trunkRadius * RING_SPACING, cell * 2.5)) * Math.PI * 2)

                paint.copy(ringLight).lerp(ringDark, ring ** 3 * 0.75)
            }

            if (cutAt < rim) {
                paint.lerp(rimColour, 1 - (cutAt / rim) ** 2)
            }

            return weatherPaint(paint, n[1], {snow: tree.snow, wet: tree.wet})
        }

        // Lit from above, dark in the ridges and in the crooks of the joints. How
        // open a point is comes straight from the field: step out along the normal
        // and see how far the wood really is.
        const open =
            field.distance(
                x + inTree[0] * occlusionReach,
                y + inTree[1] * occlusionReach,
                z + inTree[2] * occlusionReach,
            ) / occlusionReach

        // Blotches that do not line up with the grid, so bark and moss
        // both look like patches rather than bands.
        const blotch = Math.sin(x * 5.3 + z * 2.1) * Math.sin(y * 4.7 + x * 1.3) * Math.sin(z * 6.1 + y * 2.3)

        paint.copy(deep).lerp(
            light,
            Math.min(
                1,
                Math.max(
                    0,
                    0.08 +
                        (n[1] * 0.5 + 0.5) * 0.62 -
                        field.valley(x, y, z) * 0.5 +
                        field.mark(x, y, z) +
                        Math.min(1, Math.max(0, open)) * 0.26 +
                        blotch * 0.18 * tree.roughness,
                ),
            ),
        )

        // Moss settles on what faces the sky, or the shady side, and more of it low down.
        const mossHere = tree.moss * Math.max(0, mossFacing(n[0], n[1], n[2], tree.mossFrom) * 1.4 + blotch * 0.9 + 0.1)

        paint.lerp(moss, Math.min(1, mossHere))

        // Creases get a colour of their own, not just less light: the sharper this
        // turns, the more the wood reads as shapes rather than one soft gradient.
        const shut = 1 - Math.min(1, Math.max(0, open))
        const inCrease = Math.min(1, Math.max(0, (shut + field.valley(x, y, z) * 0.5 - CREASE_FROM) / CREASE_SPAN))

        paint.lerp(crease, inCrease * inCrease * (3 - 2 * inCrease) * CREASE_STRENGTH)

        if (ink && inkShare > 0) {
            paint.lerp(ink, inkShare)
        }

        // Inside a split the wood is burnt black.
        const charred = field.charred(x, y, z)

        if (charred > 0) {
            paint.lerp(CHARRED, charred * 0.9)
        }

        // Snow lies on top of the moss, but not down in the creases.
        return weatherPaint(paint, n[1] - shut * 0.6, tree, blotch)
    }
}

/** How thick the wood a limb grows out of is where it leaves, or no limit for the trunk and roots. */
function hostRadius(limb: Limb, limbs: readonly Limb[]): number {
    if (limb.level === 0) {
        return Infinity
    }

    const [x, y, z] = limb.points[0]
    let nearest = Infinity
    let radius = Infinity

    for (const other of limbs) {
        if (other.level >= limb.level) {
            continue
        }

        for (let index = 0; index < other.points.length; index++) {
            const [px, py, pz] = other.points[index]
            const distance = Math.hypot(px - x, py - y, pz - z)

            if (distance < nearest) {
                nearest = distance
                radius = other.radii[index]
            }
        }
    }

    return radius
}

/**
 * Shades sculpted wood near where a limb turns into a tube as the plain limb it is.
 *
 * Sculpted wood ends in a rounded cap inside the tube, and the cap's light tilts
 * forward along the limb, so without this the join shows as a bright ring.
 */
function shadeJoins(buffers: MeshBuffers, limbs: readonly Limb[], isSculpted: BarkContext['isSculpted']): void {
    const joins: {centre: Vec3; axis: Vec3; radius: number}[] = []

    for (const limb of limbs) {
        let start = 0

        while (start < limb.points.length - 1 && isSculpted(limb, start)) {
            start++
        }

        if (start > 0 && start < limb.points.length - 1) {
            joins.push({centre: limb.points[start], axis: tangentAt(limb, start), radius: limb.radii[start]})
        }
    }

    const {positions, normals, indices} = buffers
    const before = normals.slice()

    for (let vertex = 0; vertex < positions.length / 3; vertex++) {
        const x = positions[vertex * 3]
        const y = positions[vertex * 3 + 1]
        const z = positions[vertex * 3 + 2]

        for (const {centre, axis, radius} of joins) {
            const dx = x - centre[0]
            const dy = y - centre[1]
            const dz = z - centre[2]
            const along = dx * axis[0] + dy * axis[1] + dz * axis[2]
            const reach = radius * JOIN_SHADE_REACH

            if (Math.abs(along) > reach) {
                continue
            }

            const ox = dx - axis[0] * along
            const oy = dy - axis[1] * along
            const oz = dz - axis[2] * along
            const out = Math.hypot(ox, oy, oz)

            // Only the limb's own surface, not a trunk or branch it meets.
            if (out < 1e-6 || out > radius * 1.5) {
                continue
            }

            const near = Math.min(1, (reach - Math.abs(along)) / (reach - radius * JOIN_SHADE_FULL))
            // The very end of the cap faces along the limb, hidden inside the tube. Turning
            // its light sideways would leave its faces lit from behind, so it is left alone.
            const sideways = (normals[vertex * 3] * ox + normals[vertex * 3 + 1] * oy + normals[vertex * 3 + 2] * oz) / out
            const weight = near * near * (3 - 2 * near) * Math.min(1, Math.max(0, (sideways - 0.6) / 0.3))
            const nx = normals[vertex * 3] + (ox / out - normals[vertex * 3]) * weight
            const ny = normals[vertex * 3 + 1] + (oy / out - normals[vertex * 3 + 1]) * weight
            const nz = normals[vertex * 3 + 2] + (oz / out - normals[vertex * 3 + 2]) * weight
            const length = Math.hypot(nx, ny, nz) || 1

            normals[vertex * 3] = nx / length
            normals[vertex * 3 + 1] = ny / length
            normals[vertex * 3 + 2] = nz / length
        }
    }

    // On deeply carved wood a few steep faces would end up lit from behind: those keep
    // their own light, which only matters on the end of the cap hidden in the tube.
    for (let pass = 0; pass < 3; pass++) {
        let restored = false

        for (let at = 0; at < indices.length; at += 3) {
            const corners = [indices[at], indices[at + 1], indices[at + 2]]

            if (corners.every((corner) => normals[corner * 3] === before[corner * 3] && normals[corner * 3 + 1] === before[corner * 3 + 1] && normals[corner * 3 + 2] === before[corner * 3 + 2])) {
                continue
            }

            const [a, b, c] = corners.map((corner) => [positions[corner * 3], positions[corner * 3 + 1], positions[corner * 3 + 2]] as Vec3)
            const face = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]])
            const lit = (from: readonly number[]) =>
                corners.reduce((sum, corner) => sum + face[0] * from[corner * 3] + face[1] * from[corner * 3 + 1] + face[2] * from[corner * 3 + 2], 0)

            if (lit(normals) < 0 && lit(before) >= 0) {
                for (const corner of corners) {
                    normals[corner * 3] = before[corner * 3]
                    normals[corner * 3 + 1] = before[corner * 3 + 1]
                    normals[corner * 3 + 2] = before[corner * 3 + 2]
                }

                restored = true
            }
        }

        if (!restored) {
            break
        }
    }
}

/**
 * Sweeps the thin end of a limb, from `startRing` to a sharp tip.
 *
 * Rings before `emergeRing` lie inside sculpted wood. They are drawn smaller, so the
 * tube comes out of the wood where it ends instead of lying on its surface, where
 * the two would flicker against each other.
 */
function sweep(
    limb: Limb,
    startRing: number,
    emergeRing: number,
    baseLimit: number,
    detail: number,
    field: WoodField,
    paintVertex: (x: number, y: number, z: number, n: Vec3, along: number) => void,
    buffers: MeshBuffers,
): void {
    const first = buffers.positions.length / 3
    const sides = sidesFor(limb.radii[startRing], limb.level, detail, emergeRing > 0)
    // A lighter level takes every second or third ring, always keeping the tip.
    const stride = limb.level === 0 ? 1 : detail < 0.15 ? 3 : detail < 0.5 ? 2 : 1
    const rings: number[] = []

    for (let at = startRing; at < limb.points.length - 1; at += stride) {
        rings.push(at)
    }

    rings.push(limb.points.length - 1)

    const ringCount = rings.length
    const buried: boolean[] = []
    let frame = perpendicularTo(tangentAt(limb, startRing))

    for (let ring = 0; ring < ringCount; ring++) {
        const at = rings[ring]
        const tangent = tangentAt(limb, at)
        // Carry the frame along rather than rebuilding it, so rings never spin
        // against each other.
        const drift = frame[0] * tangent[0] + frame[1] * tangent[1] + frame[2] * tangent[2]

        frame = normalize([
            frame[0] - tangent[0] * drift,
            frame[1] - tangent[1] * drift,
            frame[2] - tangent[2] * drift,
        ])

        const binormal = cross(tangent, frame)
        const centre = limb.points[at]
        const radius =
            ring === ringCount - 1 ? 0 : at === 0 ? Math.min(limb.radii[0], baseLimit) : limb.radii[at] * (at < emergeRing ? TUBE_TUCK : 1)

        for (let side = 0; side < sides; side++) {
            const angle = (side / sides) * Math.PI * 2
            const cos = Math.cos(angle)
            const sin = Math.sin(angle)
            const out: Vec3 = [
                frame[0] * cos + binormal[0] * sin,
                frame[1] * cos + binormal[1] * sin,
                frame[2] * cos + binormal[2] * sin,
            ]
            const x = centre[0] + out[0] * radius
            const y = centre[1] + out[1] * radius
            const z = centre[2] + out[2] * radius

            buried.push(field.distance(x, y, z) < -0.02)
            buffers.positions.push(x, y, z)
            buffers.normals.push(out[0], out[1], out[2])
            paintVertex(x, y, z, out, ring / (ringCount - 1))
        }
    }

    for (let ring = 0; ring < ringCount - 1; ring++) {
        // The last ring is the tip, where every corner is one point, so the second
        // triangle of each side would have no area.
        const toTip = ring === ringCount - 2

        for (let side = 0; side < sides; side++) {
            const next = (side + 1) % sides
            const a = ring * sides + side
            const b = ring * sides + next
            const c = (ring + 1) * sides + next
            const d = (ring + 1) * sides + side

            if (!(buried[a] && buried[b] && buried[c])) {
                buffers.indices.push(first + a, first + b, first + c)
            }

            if (!toTip && !(buried[a] && buried[c] && buried[d])) {
                buffers.indices.push(first + a, first + c, first + d)
            }
        }
    }
}

/**
 * Narrows the top of a branching tree's trunk into the heavy limb that carries on from it.
 *
 * The trunk stops thicker than any limb that leaves its top, so sculpted, it ended in a
 * round knob with the thinner limb growing out of its side, which read as a cut.
 */
function narrowTrunkTop(limbs: readonly Limb[], tree: PaintedTreeParameters): readonly Limb[] {
    const [trunk] = limbs

    if (tree.form !== 'crown' || trunk.level !== 0) {
        return limbs
    }

    const last = trunk.points.length - 1
    const top = trunk.points[last]
    const topRadius = trunk.radii[last]
    let carry = 0

    for (const limb of limbs) {
        const [x, y, z] = limb.points[0]

        // A moved limb no longer leaves the top, and a root never does.
        if (limb.level === 1 && !limb.key.startsWith('r') && Math.hypot(x - top[0], y - top[1], z - top[2]) < topRadius) {
            carry = Math.max(carry, limb.radii[0])
        }
    }

    if (carry === 0 || carry >= topRadius) {
        return limbs
    }

    const reach = topRadius * TRUNK_TOP_REACH
    const radii = [...trunk.radii]
    let fromTop = 0

    for (let index = last; index >= 0 && fromTop < reach; index--) {
        if (index < last) {
            const [ax, ay, az] = trunk.points[index]
            const [bx, by, bz] = trunk.points[index + 1]

            fromTop += Math.hypot(bx - ax, by - ay, bz - az)
        }

        const t = Math.min(fromTop / reach, 1)

        radii[index] = Math.min(radii[index], carry + (radii[index] - carry) * t * t * (3 - 2 * t))
    }

    return [{...trunk, radii}, ...limbs.slice(1)]
}

export function prepareBark(
    plan: TreePlan,
    tree: PaintedTreeParameters,
    seed: number,
    detail: number,
    piece?: PieceCut,
): BarkContext {
    // A lighter level can go below what a fine surface needs, so its floor rises with it.
    const floor = MIN_CELL * Math.sqrt(Math.max(FULL_FLOOR_DETAIL / detail, 1))
    // A palm's slim trunk has no flare, and stays a sculpted surface at every level, not a bare tube.
    const trunkRadius = Math.max(...plan.limbs[0].radii)
    const coarse = Math.max((tree.trunkRadius * CELL_SHARE) / Math.sqrt(detail * tree.barkDetail), floor)
    // With no leaves to carry a level, the wood takes the whole saving.
    const bareScale = plan.clumps.length === 0 && detail < 0.15 ? 1.6 : 1
    // A palm snapped below its crown is still a palm.
    const slim = trunkRadius > SLIM_TRUNK_MIN && (plan.clumps.some((clump) => clump.kind === 'frond') || tree.form === 'palm')
    const cell = slim ? Math.min(coarse, (trunkRadius / SCULPT_MIN_CELLS) * 0.9) : coarse * bareScale
    const sculptMin = cell * SCULPT_MIN_CELLS
    // A thick root stays sculpted to its end. Swept, its thin end would be a dark spike
    // lying on the ground, and stopping short would change the tree's footprint per level.
    const isThickRoot = (limb: Limb) => limb.key.startsWith('r') && limb.radii[0] >= sculptMin
    // A broken limb stays sculpted up to its break, so every level carves the break
    // rather than ending the wood in a thin point short of it.
    const endsInBreak = (limb: Limb) => {
        const [x, y, z] = limb.points[limb.points.length - 1]

        return (plan.cuts ?? []).some((cut) => Math.hypot(x - cut.point[0], y - cut.point[1], z - cut.point[2]) < (cut.reach ?? Infinity))
    }
    const isSculpted = (limb: Limb, segment: number) =>
        limb.level < 3 && (isThickRoot(limb) || (limb.level <= 1 && endsInBreak(limb)) || Math.max(limb.radii[segment], limb.radii[segment + 1]) >= sculptMin)
    const wood = narrowTrunkTop(plan.limbs, tree).map((limb) =>
        isThickRoot(limb) ? {...limb, radii: limb.radii.map((radius) => Math.max(radius, sculptMin))} : limb,
    )
    const sculptedSegments: {a: Vec3; b: Vec3; radius: number}[] = []
    // A piece's saw cuts, and the tree's own breaks. A break's splinters are never
    // narrower than the grid can carry, or a lighter level would lose them and come out short.
    const cuts = [...(plan.cuts ?? []), ...(piece?.cuts ?? [])].map((cut) =>
        cut.jag && cut.grain !== undefined && cut.grain < cell * SPLINTER_CELLS ? {...cut, grain: cell * SPLINTER_CELLS} : cut,
    )

    for (const limb of wood) {
        for (let segment = 0; segment < limb.points.length - 1; segment++) {
            if (isSculpted(limb, segment)) {
                sculptedSegments.push({
                    a: limb.points[segment],
                    b: limb.points[segment + 1],
                    radius: Math.max(limb.radii[segment], limb.radii[segment + 1]),
                })
            }
        }
    }

    return {
        plan,
        tree,
        detail,
        field: createWoodField(wood, tree, seed, isSculpted, cuts, plan.split ?? null),
        cell,
        sculptMin,
        isSculpted,
        sculptedSegments,
        orient: piece?.orient ?? UPRIGHT,
        cuts,
    }
}

/** Joins the sculpted slices and adds the thin wood. */
export function assembleBark(
    context: BarkContext,
    cells: Int32Array,
    chunks: readonly BarkChunk[],
): BarkArrays {
    const {plan, tree, detail, field, isSculpted} = context
    const palette = resolvePalette(tree)
    const deep = new THREE.Color(palette.barkDeep)
    const light = new THREE.Color(palette.barkLight)
    const ink = new THREE.Color()
    const paintWood = woodPainter(context)
    const buffers: MeshBuffers = {positions: [], normals: [], colors: [], indices: []}

    // Nothing is left out below the ground, so the wood is whole however high a prop is placed.
    joinChunks(cells, chunks, buffers, -Infinity)
    shadeJoins(buffers, plan.limbs, isSculpted)

    // Thin wood goes dark as it thins, so the tips read as ink.
    for (const limb of plan.limbs) {
        // The finest wood goes first as a level gets lighter, smallest first.
        // A branch goes only if its tip is lost in the leaves. Otherwise it is
        // part of the outline, as every branch of a bare tree is.
        const tip = limb.points[limb.points.length - 1]
        const hidden = plan.clumps.some(
            (clump) => Math.hypot(tip[0] - clump.centre[0], tip[1] - clump.centre[1], tip[2] - clump.centre[2]) < clump.radius,
        )

        const bare = plan.clumps.length === 0

        if (
            (limb.level === 3 && detail < TWIGS_DROPPED_BELOW && (hidden || bare)) ||
            (limb.level === 2 && detail < BRANCHES_DROPPED_BELOW && hidden)
        ) {
            continue
        }

        let start = 0

        while (start < limb.points.length - 1 && isSculpted(limb, start)) {
            start++
        }

        if (start >= limb.points.length - 1) {
            continue
        }

        // Thin wood stops where a cut goes through it: what was past it went with the rest of the tree.
        const past = (point: Vec3) =>
            context.cuts.some(
                (cut) =>
                    (cut.reach === undefined || Math.hypot(point[0] - cut.point[0], point[1] - cut.point[1], point[2] - cut.point[2]) < cut.reach) &&
                    (point[0] - cut.point[0]) * cut.normal[0] + (point[1] - cut.point[1]) * cut.normal[1] + (point[2] - cut.point[2]) * cut.normal[2] > 0,
            )
        let end = limb.points.length

        if (context.cuts.length > 0) {
            end = start

            while (end < limb.points.length && !past(limb.points[end])) {
                end++
            }
        }

        if (end - start < 2) {
            continue
        }

        const kept = end === limb.points.length ? limb : {...limb, points: limb.points.slice(0, end), radii: limb.radii.slice(0, end)}

        sweep(
            kept,
            Math.max(start - 1, 0),
            start,
            start === 0 ? hostRadius(kept, plan.limbs) * BASE_IN_HOST : Infinity,
            detail,
            field,
            (x, y, z, n, along) => {
                ink.copy(deep).lerp(light, 0.1 + (context.orient(n)[1] * 0.5 + 0.5) * 0.5)

                // By how far along, not how thin: a twig is thin from its first ring,
                // and would start as a dark spike on the paler wood it grows from.
                const paint = paintWood(x, y, z, n, ink, along ** INK_CURVE)

                buffers.colors.push(paint.r, paint.g, paint.b)
            },
            buffers,
        )
    }

    const printed = printAlongLimbs(buffers, plan.limbs, tree.patternScale)

    return {
        positions: Float32Array.from(printed.buffers.positions),
        normals: Float32Array.from(printed.buffers.normals),
        colors: Float32Array.from(printed.buffers.colors),
        uvs: Float32Array.from(printed.uvs),
        indices: Uint32Array.from(printed.buffers.indices),
    }
}

export function barkGeometry({positions, normals, colors, uvs, indices}: BarkArrays): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setIndex(
        positions.length / 3 < 65535
            ? new THREE.Uint16BufferAttribute(indices, 1)
            : new THREE.BufferAttribute(indices, 1),
    )
    geometry.computeBoundingSphere()

    return geometry
}

export function buildBark(
    plan: TreePlan,
    tree: PaintedTreeParameters,
    seed: number,
    detail: number,
    piece?: PieceCut,
): THREE.BufferGeometry {
    const context = prepareBark(plan, tree, seed, detail, piece)
    const cells = listBarkCells(context)

    return barkGeometry(assembleBark(context, cells, [sculptBarkCells(context, cells)]))
}
