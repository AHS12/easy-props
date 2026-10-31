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
/** Below this a face is underground and is not drawn. */
const GROUND_LEVEL = -0.02
/** How far out occlusion looks, as a share of the trunk radius. */
const OCCLUSION_REACH = 0.42
const MOSS_COLOUR = '#6c9a3c'

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
    readonly indices: Uint32Array
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
        const minJ = Math.max(Math.floor((Math.min(a[1], b[1]) - reach) / cell), -2)
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
    const {field, cell, tree} = context
    const palette = resolvePalette(tree)
    const deep = new THREE.Color(palette.barkDeep)
    const light = new THREE.Color(palette.barkLight)
    const paint = new THREE.Color()
    const moss = new THREE.Color(MOSS_COLOUR)
    const occlusionReach = tree.trunkRadius * OCCLUSION_REACH

    return sculptCells(field, cells, cell, (x, y, z, n, colors) => {
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
        colors.push(paint.r, paint.g, paint.b)
    })
}

/** Sweeps the thin end of a limb, from `startRing` to a sharp tip. */
function sweep(
    limb: Limb,
    startRing: number,
    detail: number,
    field: WoodField,
    paintVertex: (n: Vec3, radius: number) => void,
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
            paintVertex(out, limb.radii[at])
        }
    }

    for (let ring = 0; ring < ringCount - 1; ring++) {
        for (let side = 0; side < sides; side++) {
            const next = (side + 1) % sides
            const a = ring * sides + side
            const b = ring * sides + next
            const c = (ring + 1) * sides + next
            const d = (ring + 1) * sides + side

            if (!(buried[a] && buried[b] && buried[c])) {
                buffers.indices.push(first + a, first + c, first + b)
            }

            if (!(buried[a] && buried[c] && buried[d])) {
                buffers.indices.push(first + a, first + d, first + c)
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
    const isSculpted = (limb: Limb, segment: number) =>
        limb.level < 3 && Math.max(limb.radii[segment], limb.radii[segment + 1]) >= sculptMin
    const sculptedSegments: {a: Vec3; b: Vec3; radius: number}[] = []

    for (const limb of plan.limbs) {
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
        field: createWoodField(plan.limbs, tree, seed, isSculpted),
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
    const {plan, tree, detail, field, sculptMin, isSculpted} = context
    const palette = resolvePalette(tree)
    const deep = new THREE.Color(palette.barkDeep)
    const light = new THREE.Color(palette.barkLight)
    const paint = new THREE.Color()
    const buffers: MeshBuffers = {positions: [], normals: [], colors: [], indices: []}

    const writeValue = (value: number) => {
        paint.copy(deep).lerp(light, Math.min(1, Math.max(0, value)))
        buffers.colors.push(paint.r, paint.g, paint.b)
    }

    joinChunks(cells, chunks, buffers, GROUND_LEVEL)

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
            (n, radius) => {
                writeValue(0.1 + (n[1] * 0.5 + 0.5) * 0.5 + Math.min(radius / sculptMin, 1) * 0.15)
            },
            buffers,
        )
    }

    return {
        positions: Float32Array.from(buffers.positions),
        normals: Float32Array.from(buffers.normals),
        colors: Float32Array.from(buffers.colors),
        indices: Uint32Array.from(buffers.indices),
    }
}

export function barkGeometry({positions, normals, colors, indices}: BarkArrays): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
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
