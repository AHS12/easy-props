/**
 * The low-poly tree as joined surfaces, the way an artist would make one: a
 * smooth shape first, remeshed as one piece, then cut down to a few large flat
 * faces.
 *
 * Wood: the same blended wood field the painted bark is sculpted from, with
 * its fine carving left out, so limbs melt into the trunk at real joints
 * rather than pushing through it. Leaves: one field for the whole crown, every
 * clump's lobes melted together, so neighbouring masses meet along a seam
 * instead of cutting into each other. Each surface is pulled out of its field
 * by surface nets, then simplified by quadric error.
 *
 * The crown is one surface but each clump is still its own part, so it can be
 * picked and edited: every face goes to the clump whose shape it lies on.
 */

import * as THREE from 'three'
import {createSeededRandom, hashSeed, randomRange} from '../../shared/random'
import {simplifyMesh} from '../../shared/simplify'
import {joinChunks, packedCell, sculptCells, type MeshBuffers, type SurfaceField} from '../../shared/surface-nets'
import {resolvePalette, type PaintedTreeParameters} from './parameters'
import {cross, normalize, type Clump, type Limb, type TreePlan, type Vec3} from './plan'
import {createWoodField} from './wood-field'

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
/** The grid packs each axis into 1024 cells around the origin. */
const MAX_CELLS_ACROSS = 480
const GRADIENT_STEP = 0.004

/** Wood is sampled at this share of the trunk's radius, within these sizes in metres. */
const WOOD_CELL_SHARE = 0.3
const WOOD_CELL = [0.03, 0.16]
/** Thinner wood is thickened to this many cells across, so the grid catches it and it reads as solid. */
const WOOD_MIN_CELLS = 1.35
/** Below this share of full detail, only the trunk, heavy limbs and roots are kept. */
const BRANCHES_DROPPED_BELOW = 0.35
/** How far wood may move as it is simplified, against the size of a cell. */
const WOOD_ERROR = 0.24

/** Leaves are sampled at this share of a typical clump's radius. */
const LEAF_CELL_SHARE = 0.16
/** How softly lobes of one clump melt together, and clumps into each other, against a clump's radius. */
const LOBE_BLEND = 0.35
const CLUMP_BLEND = 0.12
/** How far leaves may move as they are simplified, against a clump's radius. */
const LEAF_ERROR = 0.07
/** About this many faces per clump at full detail. */
const LEAF_FACES = 90

type Lobe = {readonly centre: Vec3; readonly radius: number}

/** Smooth minimum: the two shapes melt into one with a fillet of about `k`. */
function smin(a: number, b: number, k: number): number {
    if (k <= 0) {
        return Math.min(a, b)
    }

    const h = Math.max(k - Math.abs(a - b), 0) / k

    return Math.min(a, b) - h * h * k * 0.25
}

function withGradient(distance: (x: number, y: number, z: number) => number): SurfaceField {
    return {
        distance,
        gradient(x, y, z) {
            const e = GRADIENT_STEP
            const gx = distance(x + e, y, z) - distance(x - e, y, z)
            const gy = distance(x, y + e, z) - distance(x, y - e, z)
            const gz = distance(x, y, z + e) - distance(x, y, z - e)
            const length = Math.hypot(gx, gy, gz)

            return length < 1e-12 ? [0, 1, 0] : [gx / length, gy / length, gz / length]
        },
    }
}

/** Every grid cell within a box around each shape: a tree is mostly air. */
function cellsAround(boxes: readonly {min: Vec3; max: Vec3}[], cell: number): Int32Array {
    const seen = new Set<number>()
    const cells: number[] = []

    for (const {min, max} of boxes) {
        const low = min.map((value) => Math.floor(value / cell) - 1)
        const high = max.map((value) => Math.floor(value / cell) + 1)

        for (let i = low[0]; i <= high[0]; i++) {
            for (let j = low[1]; j <= high[1]; j++) {
                for (let k = low[2]; k <= high[2]; k++) {
                    const key = packedCell(i, j, k)

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

/** One surface out of a field, cut down to its few faces. */
function lowPolySurface(field: SurfaceField, cells: Int32Array, cell: number, maxError: number, targetFaces: number) {
    const chunk = sculptCells(field, cells, cell, (_x, _y, _z, _n, colors) => colors.push(0, 0, 0))
    const buffers: MeshBuffers = {positions: [], normals: [], colors: [], indices: []}

    joinChunks(cells, [chunk], buffers, -Infinity)

    return simplifyMesh(buffers.positions, buffers.indices, {targetFaces, maxError: maxError * maxError})
}

const cellFor = (wanted: number, extent: number) => Math.max(wanted, extent / MAX_CELLS_ACROSS)

const extentOf = (points: readonly Vec3[]) =>
    Math.max(...points.flatMap((point) => point.map(Math.abs))) * 2

type Faces = {positions: number[]; normals: number[]; colors: number[]}

/** Faces as a thread hands them back. */
export type FaceArrays = {readonly positions: ArrayLike<number>; readonly normals: ArrayLike<number>; readonly colors: ArrayLike<number>}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

function pushFace(out: Faces, a: Vec3, b: Vec3, c: Vec3, colour: THREE.Color, offset: Vec3 = [0, 0, 0]) {
    const n = normalize(cross(sub(b, a), sub(c, a)))

    for (const p of [a, b, c]) {
        out.positions.push(p[0] - offset[0], p[1] - offset[1], p[2] - offset[2])
        out.normals.push(n[0], n[1], n[2])
        out.colors.push(colour.r, colour.g, colour.b)
    }
}

const cornerOf = (positions: readonly number[], index: number): Vec3 => [
    positions[index * 3],
    positions[index * 3 + 1],
    positions[index * 3 + 2],
]

/** Whether a branch starts on wood that is still drawn: within a point's thickness and spacing of a thicker limb. */
function growsFrom(limb: Limb, kept: readonly Limb[]): boolean {
    const base = limb.points[0]

    return kept.some(
        (other) =>
            other.level < limb.level &&
            other.points.some((point, at) => {
                const spacing = Math.hypot(...sub(other.points[Math.min(at + 1, other.points.length - 1)], other.points[Math.max(at - 1, 0)]))

                return Math.hypot(...sub(point, base)) < other.radii[at] + spacing
            }),
    )
}

/** The wood of a low-poly tree: trunk, limbs, branches and roots as one joined surface. */
export function buildLowPolyWood(plan: TreePlan, tree: PaintedTreeParameters, seed: number, detail: number): THREE.BufferGeometry {
    const keep = detail < BRANCHES_DROPPED_BELOW ? 1 : 2
    const trunkRadius = Math.max(...plan.limbs[0].radii)
    const extent = extentOf(plan.limbs.flatMap((limb) => limb.points))
    const cell = cellFor(
        Math.min(Math.max(trunkRadius * WOOD_CELL_SHARE, WOOD_CELL[0]), WOOD_CELL[1]) / Math.sqrt(Math.max(detail, 0.1)),
        extent,
    )
    const thinnest = cell * WOOD_MIN_CELLS
    const shapes = plan.clumps.filter((clump) => clump.kind === 'mass').map((clump) => clumpField(clump, tree))
    const typical = shapes.length > 0 ? shapes.reduce((sum, shape) => sum + shape.clump.radius, 0) / shapes.length : 1
    const leavesAt = (point: Vec3) => Math.min(Infinity, ...shapes.map((shape) => shape.distance(point[0], point[1], point[2])))
    const limbs: Limb[] = plan.limbs
        .filter((limb) => limb.level <= keep && limb.points.length > 1)
        .map((limb) => {
            const radii = limb.radii.map((radius) => Math.max(radius, thinnest))
            // Thickened to hold its shape, a branch that runs deep into the leaves
            // would poke its end out through them. So it ends at its last point deep
            // inside, where the flat faces the leaves are cut down to still cover it.
            // One that only reaches the leaves is kept whole, so it still meets them.
            const deep = limb.points.map((point, index) => leavesAt(point) < -(radii[index] + typical * LEAF_ERROR))
            const last = deep.lastIndexOf(true)
            const end = last >= 0 ? last + 1 : limb.points.length

            return {...limb, points: limb.points.slice(0, end), radii: radii.slice(0, end)}
        })
        .filter((limb) => limb.points.length > 1)
        // A branch whose parent was cut short before it would float, so it goes too.
        .filter((limb, _index, kept) => limb.level === 0 || growsFrom(limb, kept))
    // The shape, not the carving: no ridges, knots, hollow or pattern on a low-poly tree.
    const plain: PaintedTreeParameters = {...tree, ridgeDepth: 0, burls: 0, hollow: 0, roughness: 0, patternDepth: 0, barkPattern: 'none'}
    const wood = createWoodField(limbs, plain, seed, () => true)
    const boxes = limbs.flatMap((limb) =>
        limb.points.slice(1).map((b, index) => {
            const a = limb.points[index]
            // The wood, its fillets, and at the foot of the trunk its flare.
            const reach = Math.max(limb.radii[index], limb.radii[index + 1]) * (1.5 + (limb.level === 0 ? tree.flare : 0)) + cell * 1.5

            return {
                min: [0, 1, 2].map((axis) => Math.min(a[axis], b[axis]) - reach) as unknown as Vec3,
                max: [0, 1, 2].map((axis) => Math.max(a[axis], b[axis]) + reach) as unknown as Vec3,
            }
        }),
    )
    const surface = lowPolySurface(wood, cellsAround(boxes, cell), cell, cell * WOOD_ERROR, 0)
    const palette = resolvePalette(tree)
    const deep = new THREE.Color(palette.barkDeep)
    const light = new THREE.Color(palette.barkLight)
    const paint = new THREE.Color()
    const random = createSeededRandom(hashSeed(seed, 71))
    const out: Faces = {positions: [], normals: [], colors: []}

    for (let at = 0; at < surface.indices.length; at += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => cornerOf(surface.positions, surface.indices[at + k]))
        const n = normalize(cross(sub(b, a), sub(c, a)))
        // Plain wood, a little lighter on faces turned up, each face a shade of its own.
        const value = 0.42 + 0.22 * n[1] + randomRange(random, -0.1, 0.1) * (0.5 + tree.colourVariation)

        pushFace(out, a, b, c, paint.copy(deep).lerp(light, Math.min(Math.max(value, 0), 1)))
    }

    return facesToGeometry(out)
}

export function facesToGeometry({positions, normals, colors}: FaceArrays): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(positions), 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from(normals), 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(Array.from(colors), 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2))
    geometry.computeBoundingSphere()

    return geometry
}

/** Lumps on a clump, as a share of its radius, from a direction. As the painted clump's, so both match. */
function lumpAt(d: Vec3, seed: number): number {
    const a = seed * 0.37
    const b = seed * 0.71

    return (
        0.1 * Math.sin(d[0] * 3.1 + a) * Math.sin(d[1] * 2.7 + b) +
        0.08 * Math.sin(d[1] * 5.3 + b) * Math.sin(d[2] * 4.9 + a) +
        0.06 * Math.sin(d[2] * 7.7 + a + b) * Math.sin(d[0] * 6.1 + b)
    )
}

/** The lobes a clump is made of, laid out from its seed as the painted clump's are. */
export function lobesOf(clump: Clump, tree: PaintedTreeParameters): Lobe[] {
    const random = createSeededRandom(clump.seed)
    const lobeCount =
        clump.sag > 0 ? 1 : 1 + Math.round(Math.min(tree.lumpiness * (clump.edit.lumpinessScale ?? 1), 1) * 4)

    return Array.from({length: lobeCount}, (_, lobe) => {
        const azimuth = lobe * GOLDEN_ANGLE + random() * 6.28
        const lift = randomRange(random, -0.25, 0.7)
        const reach = lobe === 0 ? 0 : randomRange(random, 0.42, 0.62) * clump.radius

        return {
            centre: [Math.cos(azimuth) * reach, lift * reach * clump.flatten, Math.sin(azimuth) * reach],
            radius: clump.radius * (lobe === 0 ? (lobeCount === 1 ? 1 : 0.68) : randomRange(random, 0.42, 0.6)),
        }
    })
}

/** The most a lobe's lumps push its surface out, as a share of its radius. */
const MOST_LUMP = 0.24

interface ClumpShape {
    readonly clump: Clump
    /** No part of the clump lies farther than this from its centre. */
    readonly reach: number
    readonly distance: (x: number, y: number, z: number) => number
}

/** A clump's own shape, in the tree's space: its lobes melted into one mass. */
export function clumpField(clump: Clump, tree: PaintedTreeParameters): ClumpShape {
    const lobes = lobesOf(clump, tree)
    const lumpSeed = (clump.seed % 1000) / 100
    const blend = clump.radius * LOBE_BLEND
    const stretch = Math.max(clump.flatten, 1)
    const reach =
        Math.max(...lobes.map((lobe) => Math.hypot(...lobe.centre) + lobe.radius * (1 + MOST_LUMP) * stretch)) + clump.sag * clump.radius

    return {clump, reach, distance: (x, y, z) => {
        const lx = x - clump.centre[0]
        const lz = z - clump.centre[2]
        // The rim of a skirt sags: a conifer's tier hangs at its edge.
        const ly = y - clump.centre[1] + (clump.sag * (lx * lx + lz * lz)) / clump.radius
        let d = Infinity

        for (const lobe of lobes) {
            const px = lx - lobe.centre[0]
            const py = (ly - lobe.centre[1]) / clump.flatten
            const pz = lz - lobe.centre[2]
            const length = Math.hypot(px, py, pz)
            const flat = Math.min(clump.flatten, 1)

            // Too far for this lobe to change the answer: no need to work out its lumps.
            if ((length - lobe.radius * (1 + MOST_LUMP)) * flat > d + blend) {
                continue
            }

            const direction: Vec3 = length < 1e-9 ? [0, 1, 0] : [px / length, py / length, pz / length]
            const own = length - lobe.radius * (1 + lumpAt(direction, lumpSeed))

            d = smin(d, own * flat, blend)
        }

        return d
    }}
}

export interface Crown {
    /** Each clump's faces, in the tree's space, by its key. */
    readonly faces: ReadonlyMap<string, ArrayLike<number>>
}

const crowns = new Map<string, Crown>()
const CROWNS_KEPT = 8

const crownKey = (tree: PaintedTreeParameters, seed: number, detail: number) => JSON.stringify([tree, seed, Math.round(detail * 1000)])

function keepCrown(key: string, crown: Crown) {
    crowns.set(key, crown)

    while (crowns.size > CROWNS_KEPT) {
        crowns.delete(crowns.keys().next().value!)
    }
}

/** Keeps a crown worked out on another thread, so the clumps that ask for it next find it. */
export function rememberCrown(tree: PaintedTreeParameters, seed: number, detail: number, crown: Crown): void {
    keepCrown(crownKey(tree, seed, detail), crown)
}

/**
 * The whole crown as one surface, its faces shared out among the clumps. Every
 * clump of a tree asks for it in turn, so it is worked out once and kept.
 */
export function lowPolyCrown(plan: TreePlan, tree: PaintedTreeParameters, seed: number, detail: number): Crown {
    const key = crownKey(tree, seed, detail)
    const kept = crowns.get(key)

    if (kept) {
        return kept
    }

    const masses = plan.clumps.filter((clump) => clump.kind === 'mass')
    const fields = masses.map((clump) => clumpField(clump, tree))
    const typical = masses.length > 0 ? masses.reduce((sum, clump) => sum + clump.radius, 0) / masses.length : 1
    const blend = typical * CLUMP_BLEND
    const extent = extentOf(masses.flatMap((clump) => [sub(clump.centre, [clump.radius * 2, clump.radius * 2, clump.radius * 2]), [clump.centre[0] + clump.radius * 2, clump.centre[1] + clump.radius * 2, clump.centre[2] + clump.radius * 2]]))
    const cell = cellFor((typical * LEAF_CELL_SHARE) / Math.sqrt(Math.max(detail, 0.1)), extent)
    const field = withGradient((x, y, z) => {
        let d = Infinity

        for (const shape of fields) {
            const {centre} = shape.clump

            // A clump this far off cannot reach the point, so its lobes are not asked.
            if (Math.hypot(x - centre[0], y - centre[1], z - centre[2]) - shape.reach > d + blend) {
                continue
            }

            d = smin(d, shape.distance(x, y, z), blend)
        }

        return d
    })
    const boxes = fields.map(({clump, reach}) => ({
        min: [clump.centre[0] - reach, clump.centre[1] - reach, clump.centre[2] - reach] as Vec3,
        max: [clump.centre[0] + reach, clump.centre[1] + reach, clump.centre[2] + reach] as Vec3,
    }))
    const surface =
        masses.length > 0
            ? lowPolySurface(field, cellsAround(boxes, cell), cell, typical * LEAF_ERROR / Math.sqrt(Math.max(detail, 0.1)), Math.round(masses.length * LEAF_FACES * detail))
            : {positions: [], indices: []}
    const faces = new Map<string, number[]>(masses.map((clump) => [clump.key, []]))

    for (let at = 0; at < surface.indices.length; at += 3) {
        const corners = [0, 1, 2].map((k) => cornerOf(surface.positions, surface.indices[at + k]))
        const middle: Vec3 = [0, 1, 2].map((axis) => (corners[0][axis] + corners[1][axis] + corners[2][axis]) / 3) as unknown as Vec3
        let owner = 0
        let nearest = Infinity

        // A face belongs to the clump whose own shape it lies closest to.
        fields.forEach((shape, index) => {
            const d = shape.distance(middle[0], middle[1], middle[2])

            if (d < nearest) {
                nearest = d
                owner = index
            }
        })

        faces.get(masses[owner].key)!.push(...corners.flat())
    }

    const crown = {faces}

    keepCrown(key, crown)

    return crown
}
