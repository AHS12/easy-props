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
 */

import * as THREE from 'three'
import {resolvePalette, type PaintedTreeParameters} from './parameters'
import {cross, normalize, perpendicularTo, type Limb, type TreePlan, type Vec3} from './plan'
import {createWoodField, type WoodField} from './wood-field'

/** Grid size against trunk radius, at full detail. */
const CELL_SHARE = 0.27
const MIN_CELL = 0.05
/** Wood thinner than this many cells cannot be sculpted cleanly. */
const SCULPT_MIN_CELLS = 1.15
const SETTLE_ITERATIONS = 2
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

    return Math.max(3, Math.round((radius > 0.1 ? 8 : radius > 0.04 ? 6 : 4) * detail))
}

function tangentAt(limb: Limb, ring: number): Vec3 {
    const last = limb.points.length - 1
    const a = limb.points[Math.max(ring - 1, 0)]
    const b = limb.points[Math.min(ring + 1, last)]

    return normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]])
}

interface MeshBuffers {
    readonly positions: number[]
    readonly normals: number[]
    readonly colors: number[]
    readonly indices: number[]
}

/** Grid corners are packed into one number so the sample cache is a plain map. */
const OFFSET = 1 << 9
const SPAN = 1 << 10
const packed = (i: number, j: number, k: number) =>
    i + OFFSET + (j + OFFSET) * SPAN + (k + OFFSET) * SPAN * SPAN

/**
 * Sculpts the field into a mesh with surface nets.
 *
 * Each grid cell the surface passes through gets one vertex, at the average of
 * where the surface crosses its edges. Each grid edge the surface crosses gets
 * one quad, joining the four cells around it.
 */
function sculpt(
    field: WoodField,
    sculpted: readonly {a: Vec3; b: Vec3; radius: number}[],
    cell: number,
    paintVertex: (x: number, y: number, z: number, n: Vec3) => void,
    buffers: MeshBuffers,
): void {
    const samples = new Map<number, number>()
    const sample = (i: number, j: number, k: number): number => {
        const key = packed(i, j, k)
        let value = samples.get(key)

        if (value === undefined) {
            value = field.distance(i * cell, j * cell, k * cell)
            samples.set(key, value)
        }

        return value
    }

    // Only the cells near the wood are ever sampled: a tree is mostly air.
    const cells = new Map<number, readonly [number, number, number]>()

    for (const {a, b, radius} of sculpted) {
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

                    if (!cells.has(key)) {
                        cells.set(key, [i, j, k])
                    }
                }
            }
        }
    }

    // --- One vertex per crossed cell --------------------------------------
    const vertexOf = new Map<number, number>()
    const corners = new Float64Array(8)

    for (const [key, [i, j, k]] of cells) {
        let inside = 0

        for (let c = 0; c < 8; c++) {
            corners[c] = sample(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))

            if (corners[c] < 0) {
                inside++
            }
        }

        if (inside === 0 || inside === 8) {
            continue
        }

        let sumX = 0
        let sumY = 0
        let sumZ = 0
        let crossings = 0

        for (let c = 0; c < 8; c++) {
            for (const bit of [1, 2, 4]) {
                if (c & bit) {
                    continue
                }

                const d = c | bit
                const from = corners[c]
                const to = corners[d]

                if (from < 0 === to < 0) {
                    continue
                }

                const t = from / (from - to)
                const x0 = c & 1
                const y0 = (c >> 1) & 1
                const z0 = (c >> 2) & 1

                sumX += x0 + ((d & 1) - x0) * t
                sumY += y0 + (((d >> 1) & 1) - y0) * t
                sumZ += z0 + (((d >> 2) & 1) - z0) * t
                crossings++
            }
        }

        let x = (i + sumX / crossings) * cell
        let y = (j + sumY / crossings) * cell
        let z = (k + sumZ / crossings) * cell

        for (let iteration = 0; iteration < SETTLE_ITERATIONS; iteration++) {
            const value = field.distance(x, y, z)
            const gradient = field.gradient(x, y, z)
            const step = Math.max(-cell, Math.min(cell, value))

            x -= gradient[0] * step
            y -= gradient[1] * step
            z -= gradient[2] * step
        }

        const n = field.gradient(x, y, z)

        vertexOf.set(key, buffers.positions.length / 3)
        buffers.positions.push(x, y, z)
        buffers.normals.push(n[0], n[1], n[2])
        paintVertex(x, y, z, n)
    }

    // --- One quad per crossed edge ----------------------------------------
    const pushTriangle = (a: number, b: number, c: number) => {
        const p = buffers.positions

        if (p[a * 3 + 1] < GROUND_LEVEL && p[b * 3 + 1] < GROUND_LEVEL && p[c * 3 + 1] < GROUND_LEVEL) {
            return
        }

        const abx = p[b * 3] - p[a * 3]
        const aby = p[b * 3 + 1] - p[a * 3 + 1]
        const abz = p[b * 3 + 2] - p[a * 3 + 2]
        const acx = p[c * 3] - p[a * 3]
        const acy = p[c * 3 + 1] - p[a * 3 + 1]
        const acz = p[c * 3 + 2] - p[a * 3 + 2]
        const nx = aby * acz - abz * acy
        const ny = abz * acx - abx * acz
        const nz = abx * acy - aby * acx
        const n = buffers.normals
        const facing = nx * n[a * 3] + ny * n[a * 3 + 1] + nz * n[a * 3 + 2]

        // The field already says which way is out, so winding never has to be
        // worked out edge by edge.
        if (facing >= 0) {
            buffers.indices.push(a, b, c)
        } else {
            buffers.indices.push(a, c, b)
        }
    }

    const quadAround = (around: readonly number[]) => {
        const a = vertexOf.get(around[0])
        const b = vertexOf.get(around[1])
        const c = vertexOf.get(around[2])
        const d = vertexOf.get(around[3])

        if (a === undefined || b === undefined || c === undefined || d === undefined) {
            return
        }

        pushTriangle(a, b, c)
        pushTriangle(a, c, d)
    }

    for (const [i, j, k] of cells.values()) {
        const here = sample(i, j, k) < 0

        if (here !== sample(i + 1, j, k) < 0) {
            quadAround([packed(i, j - 1, k - 1), packed(i, j, k - 1), packed(i, j, k), packed(i, j - 1, k)])
        }

        if (here !== sample(i, j + 1, k) < 0) {
            quadAround([packed(i - 1, j, k - 1), packed(i, j, k - 1), packed(i, j, k), packed(i - 1, j, k)])
        }

        if (here !== sample(i, j, k + 1) < 0) {
            quadAround([packed(i - 1, j - 1, k), packed(i, j - 1, k), packed(i, j, k), packed(i - 1, j, k)])
        }
    }
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
    const ringCount = limb.points.length - startRing
    const buried: boolean[] = []
    let frame = perpendicularTo(tangentAt(limb, startRing))

    for (let ring = 0; ring < ringCount; ring++) {
        const at = startRing + ring
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

export function buildBark(
    plan: TreePlan,
    tree: PaintedTreeParameters,
    seed: number,
    detail: number,
): THREE.BufferGeometry {
    const {trunkRadius} = tree
    const palette = resolvePalette(tree)
    const cell = Math.max((trunkRadius * CELL_SHARE) / Math.sqrt(detail * tree.barkDetail), MIN_CELL)
    const sculptMin = cell * SCULPT_MIN_CELLS
    const isSculpted = (limb: Limb, segment: number) =>
        limb.level < 3 && Math.max(limb.radii[segment], limb.radii[segment + 1]) >= sculptMin
    const field = createWoodField(plan.limbs, tree, seed, isSculpted)

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

    const deep = new THREE.Color(palette.barkDeep)
    const light = new THREE.Color(palette.barkLight)
    const paint = new THREE.Color()
    const moss = new THREE.Color(MOSS_COLOUR)
    const buffers: MeshBuffers = {positions: [], normals: [], colors: [], indices: []}
    const occlusionReach = trunkRadius * OCCLUSION_REACH

    const writeValue = (value: number) => {
        paint.copy(deep).lerp(light, Math.min(1, Math.max(0, value)))
        buffers.colors.push(paint.r, paint.g, paint.b)
    }

    // Lit from above, dark in the ridges and in the crooks of the joints. How
    // open a point is comes straight from the field: step out along the normal
    // and see how far the wood really is.
    sculpt(
        field,
        sculptedSegments,
        cell,
        (x, y, z, n) => {
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
                            Math.min(1, Math.max(0, open)) * 0.26 +
                            blotch * 0.18 * tree.roughness,
                    ),
                ),
            )

            // Moss settles on what faces the sky, and more of it low down.
            const mossHere = tree.moss * Math.max(0, n[1] * 1.4 + blotch * 0.9 + 0.1)

            paint.lerp(moss, Math.min(1, mossHere))
            buffers.colors.push(paint.r, paint.g, paint.b)
        },
        buffers,
    )

    // Thin wood goes dark as it thins, so the tips read as ink.
    for (const limb of plan.limbs) {
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

    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3))
    geometry.setIndex(buffers.indices)
    geometry.computeBoundingSphere()

    return geometry
}
