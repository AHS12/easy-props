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
import {createWoodField, type WoodField} from './wood-field'

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

/** How many sides a tube gets, by its radius where it starts. */
function sidesFor(radius: number, level: number, detail: number): number {
    if (level === 3) {
        return 3
    }

    return Math.max(level === 0 && radius > 0.15 ? 5 : 3, Math.round((radius > 0.1 ? 8 : radius > 0.04 ? 6 : 4) * detail))
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
}

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
function woodPainter({field, tree}: BarkContext): (x: number, y: number, z: number, n: Vec3) => THREE.Color {
    const palette = resolvePalette(tree)
    const deep = new THREE.Color(palette.barkDeep)
    const light = new THREE.Color(palette.barkLight)
    const paint = new THREE.Color()
    const moss = new THREE.Color(MOSS_COLOUR)
    const crease = deep.clone().multiplyScalar(CREASE_DARKNESS)
    const occlusionReach = tree.trunkRadius * OCCLUSION_REACH

    return (x, y, z, n) => {
        // Lit from above, dark in the ridges and in the crooks of the joints. How
        // open a point is comes straight from the field: step out along the normal
        // and see how far the wood really is.
        const open =
            field.distance(
                x + n[0] * occlusionReach,
                y + n[1] * occlusionReach,
                z + n[2] * occlusionReach,
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

        // Moss settles on what faces the sky, and more of it low down.
        const mossHere = tree.moss * Math.max(0, n[1] * 1.4 + blotch * 0.9 + 0.1)

        paint.lerp(moss, Math.min(1, mossHere))

        // Creases get a colour of their own, not just less light: the sharper this
        // turns, the more the wood reads as shapes rather than one soft gradient.
        const shut = 1 - Math.min(1, Math.max(0, open))
        const inCrease = Math.min(1, Math.max(0, (shut + field.valley(x, y, z) * 0.5 - CREASE_FROM) / CREASE_SPAN))

        return paint.lerp(crease, inCrease * inCrease * (3 - 2 * inCrease) * CREASE_STRENGTH)
    }
}

/** Sweeps the thin end of a limb, from `startRing` to a sharp tip. */
function sweep(
    limb: Limb,
    startRing: number,
    detail: number,
    field: WoodField,
    paintVertex: (x: number, y: number, z: number, n: Vec3, along: number) => void,
    buffers: MeshBuffers,
): void {
    const first = buffers.positions.length / 3
    const sides = sidesFor(limb.radii[startRing], limb.level, detail)
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
        const radius = ring === ringCount - 1 ? 0 : limb.radii[at]

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

export function prepareBark(
    plan: TreePlan,
    tree: PaintedTreeParameters,
    seed: number,
    detail: number,
): BarkContext {
    // A lighter level can go below what a fine surface needs, so its floor rises with it.
    const floor = MIN_CELL * Math.sqrt(Math.max(FULL_FLOOR_DETAIL / detail, 1))
    // A palm's slim trunk has no flare, and stays a sculpted surface at every level, not a bare tube.
    const trunkRadius = Math.max(...plan.limbs[0].radii)
    const coarse = Math.max((tree.trunkRadius * CELL_SHARE) / Math.sqrt(detail * tree.barkDetail), floor)
    // With no leaves to carry a level, the wood takes the whole saving.
    const bareScale = plan.clumps.length === 0 && detail < 0.15 ? 1.6 : 1
    const slim = trunkRadius > SLIM_TRUNK_MIN && plan.clumps.some((clump) => clump.kind === 'frond')
    const cell = slim ? Math.min(coarse, (trunkRadius / SCULPT_MIN_CELLS) * 0.9) : coarse * bareScale
    const sculptMin = cell * SCULPT_MIN_CELLS
    // A thick root stays sculpted to its end. Swept, its thin end would be a dark spike
    // lying on the ground, and stopping short would change the tree's footprint per level.
    const isThickRoot = (limb: Limb) => limb.key.startsWith('r') && limb.radii[0] >= sculptMin
    const isSculpted = (limb: Limb, segment: number) =>
        limb.level < 3 && (isThickRoot(limb) || Math.max(limb.radii[segment], limb.radii[segment + 1]) >= sculptMin)
    const wood = plan.limbs.map((limb) =>
        isThickRoot(limb) ? {...limb, radii: limb.radii.map((radius) => Math.max(radius, sculptMin))} : limb,
    )
    const sculptedSegments: {a: Vec3; b: Vec3; radius: number}[] = []

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
        field: createWoodField(wood, tree, seed, isSculpted),
        cell,
        sculptMin,
        isSculpted,
        sculptedSegments,
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

        sweep(
            limb,
            Math.max(start - 1, 0),
            detail,
            field,
            (x, y, z, n, along) => {
                ink.copy(deep).lerp(light, 0.1 + (n[1] * 0.5 + 0.5) * 0.5)

                // By how far along, not how thin: a twig is thin from its first ring,
                // and would start as a dark spike on the paler wood it grows from.
                const paint = paintWood(x, y, z, n).lerp(ink, along ** INK_CURVE)

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
): THREE.BufferGeometry {
    const context = prepareBark(plan, tree, seed, detail)
    const cells = listBarkCells(context)

    return barkGeometry(assembleBark(context, cells, [sculptBarkCells(context, cells)]))
}
