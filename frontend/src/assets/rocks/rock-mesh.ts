/**
 * Turning a planned rock into a painted mesh.
 *
 * Chunks simply overlap, and the depth buffer draws the seam where they meet.
 * Whatever ends up inside another chunk is thrown away. The cost therefore
 * depends on how many planes there are and not on how big the rock is: a face
 * with an inset ring costs three triangles per edge, or `18 * planes - 36` in all.
 *
 * Three things keep it from reading as low poly: an inset ring whose outer normals
 * lean towards the neighbouring faces, so light rolls over each edge; a gentle warp
 * that bends the planes; and a value painted per face, with a gradient across it.
 */

import * as THREE from 'three'
import {valueNoise3} from '../shared/geometry-utils'
import {mossFacing, weatherPaint, type MossFrom} from '../shared/weather'
import {colourRamp} from '../style/ramp'
import {rampOf, STONE_ROWS, type OwnColours} from '../style/own-colours'
import {CALM_MOSS_RAMP, MOSS_RAMP, ROCK_RAMPS, type RockPaletteId} from '../style/palettes'
import type {CrackedChunk} from './rock-damage'
import {distanceToChunk, dot, facesOfChunk, normalize, type RockChunk, type RockPlan, type RockPlane, type Vec3} from './rock-plan'

export interface RockSurface {
    /** Softness of the edges, 0 to 1. */
    readonly edges: number
    /** How far the faces bend, 0 to 1. */
    readonly bend: number
    /** How much of the stone that faces the sky is moss, 0 to 1. */
    readonly moss: number
    /** How far one face strays from the next, 0 to 1. */
    readonly variation: number
    readonly palette: RockPaletteId | OwnColours
    /** Left out, none of these: a rock in the meadow has no weather. */
    readonly snow?: number
    readonly wet?: number
    readonly mossFrom?: MossFrom
    /** How strong the stone picture is, 0 to 1. Left out or 0, no picture, and the mesh is as it was. */
    readonly grain?: number
    /**
     * How far the light follows a smooth rounded body around each chunk, not its flat
     * faces, 0 to 1. Left out or 0, the rock is built as it was before it existed.
     */
    readonly rounded?: number
}

/** How far the warp moves a point at full Bend, as a share of the rock's size. */
const WARP_REACH = 0.025
const WARP_WAVES = 6.5
const EDGE_WIDTH = 0.04
/** An edge never takes more than this share of its face. */
const MAX_EDGE_SHARE = 0.45
/** How far an edge's normal leans towards the faces around it. */
const EDGE_LEAN = 0.55
const EDGE_LIGHT = 0.09
/** A carved rock's edge, wider and in two rows: the inner row leans this far. */
const CARVED_EDGE_WIDTH = 0.1
const CARVED_EDGE_LEAN = 0.45
/** Where the ring inside a carved face sits, as a share of the way out to its edge. */
const INNER_RING = 0.5
/** Only a face wider than this share of the rock's size gets that ring. */
const INNER_FROM = 0.14
/** How far a carved face swells at full Bend, as a share of its size. */
const PILLOW = 0.1
/** Moss starts on the flattest stone and creeps down the slopes as it grows. */
const MOSS_REACH = 0.6
/** How far darkness reaches from a seam or the ground, as a share of the size and the height. */
const SEAM_REACH = 0.1
const GROUND_REACH = 0.25
/** A carved rock's colour: how large its soft patches are against its size, and how strong. */
const PATCH_SIZE = 0.45
const PATCH_LIGHT = 0.1
/** How much of a face's own tone a carved rock keeps, fading to none at its edges. */
const CARVED_FACE_TONE = 0.4
/** How soft the line where moss gives way to stone is, in facing. */
const MOSS_SOFTNESS = 0.14
/** How far the patches push moss up or down a slope. */
const MOSS_PATCHES = 0.34
/** How much darker stone is just where moss begins. */
const MOSS_RIM = 0.12
/** Below this share of its detail, a rock has no edge rings. */
const RINGS_FROM = 0.7
/** A carved rock keeps a single wide edge down to this share, leaning this far. */
const CARVED_RINGS_FROM = 0.3
const CARVED_PLAIN_LEAN = 0.75
/** There, only a face wider than this share of the rock's size keeps its edge. */
const PLAIN_EDGE_FROM = 0.11
/** Below this, it keeps its largest chunks and its first cuts only. */
export const PLAIN_BELOW = 0.25
const PLAIN_CHUNKS = 0.75
/** The shares of its cuts a plain rock tries, keeping whichever lands nearest its target. */
export const PLAIN_CUTS: readonly number[] = [0.15, 0.25, 0.35, 0.45, 0.6, 0.8, 1]
const WELD = 500
/** How many metres one stone picture covers, so grain is the same size on a pebble and a cliff. */
const PICTURE_METRES = 1.6

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** A lighter level drops the small chunks and the last cuts of the rest. */
export function chunksAtDetail(plan: RockPlan, detail: number, cutShare: number, chunkShare = PLAIN_CHUNKS): readonly RockChunk[] {
    if (detail >= PLAIN_BELOW) {
        return plan.chunks
    }

    const largest = plan.chunks.slice(0, Math.max(1, Math.ceil(plan.chunks.length * chunkShare)))
    // Both halves of a cracked chunk, or neither: one alone would leave a hole.
    const cracks = new Set(largest.map((chunk) => (chunk as CrackedChunk).crack ?? -1))
    const kept = plan.chunks.filter((chunk) => largest.includes(chunk) || cracks.has((chunk as CrackedChunk).crack ?? -2) || (chunk as CrackedChunk).rubble)

    return kept.map((chunk) => {
        const cuts = chunk.planes.filter((plane) => plane.cut !== null).length
        const keep = Math.ceil(cuts * cutShare)

        return {...chunk, planes: chunk.planes.filter((plane) => plane.cut === null || plane.cut < keep)}
    })
}

/** Stretches a lighter rock to the full size, so losing a chunk at an end does not change its outline. */
export function fitToPlan(positions: number[], plan: RockPlan) {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]

    for (let i = 0; i < positions.length; i++) {
        min[i % 3] = Math.min(min[i % 3], positions[i])
        max[i % 3] = Math.max(max[i % 3], positions[i])
    }

    const across = plan.width / Math.max(max[0] - min[0], 1e-6)
    const up = plan.height / Math.max(max[1], 1e-6)
    const along = plan.depth / Math.max(max[2] - min[2], 1e-6)

    for (let i = 0; i < positions.length; i += 3) {
        positions[i] = (positions[i] - (min[0] + max[0]) / 2) * across
        positions[i + 1] *= up
        positions[i + 2] = (positions[i + 2] - (min[2] + max[2]) / 2) * along
    }
}

/** Where the full rock reaches, from the corners of all its chunks. */
function outlineOf(chunks: readonly RockChunk[]): {min: number[]; max: number[]} {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]

    for (const chunk of chunks) {
        for (const {corners} of facesOfChunk(chunk)) {
            for (const corner of corners) {
                for (let axis = 0; axis < 3; axis++) {
                    min[axis] = Math.min(min[axis], corner[axis])
                    max[axis] = Math.max(max[axis], corner[axis])
                }
            }
        }
    }

    // Nothing shows below the ground.
    min[1] = Math.max(min[1], 0)

    return {min, max}
}

/**
 * Stretches a lighter rock onto the full rock's outline, for one that isn't centred on
 * its own middle, so losing a chunk does not change where it reaches.
 */
function fitToBox(positions: number[], box: {min: number[]; max: number[]}) {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]

    for (let i = 0; i < positions.length; i++) {
        min[i % 3] = Math.min(min[i % 3], positions[i])
        max[i % 3] = Math.max(max[i % 3], positions[i])
    }

    for (let i = 0; i < positions.length; i++) {
        const axis = i % 3
        const from = axis === 1 ? 0 : min[axis]
        const to = axis === 1 ? 0 : box.min[axis]

        positions[i] = to + ((positions[i] - from) * (box.max[axis] - to)) / Math.max(max[axis] - from, 1e-6)
    }
}

/** Two directions along a face, square to each other: the picture's across and up. */
function faceAxes(n: Vec3): [Vec3, Vec3] {
    // Up the face where it can, so grain on a standing face runs the way it would.
    const helper: Vec3 = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
    const across = normalize([helper[1] * n[2] - helper[2] * n[1], helper[2] * n[0] - helper[0] * n[2], helper[0] * n[1] - helper[1] * n[0]])
    const up: Vec3 = [n[1] * across[2] - n[2] * across[1], n[2] * across[0] - n[0] * across[2], n[0] * across[1] - n[1] * across[0]]

    return [across, up]
}

/**
 * The way out of a smooth egg fitted round a chunk's corners, at any point: the light a
 * pebble of the same size would have there.
 */
function roundBody(faces: readonly {corners: readonly Vec3[]}[]): (p: Vec3) => Vec3 {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]

    for (const {corners} of faces) {
        for (const corner of corners) {
            for (let axis = 0; axis < 3; axis++) {
                min[axis] = Math.min(min[axis], corner[axis])
                max[axis] = Math.max(max[axis], corner[axis])
            }
        }
    }

    const centre = [0, 1, 2].map((axis) => (min[axis] + max[axis]) / 2)
    const squared = [0, 1, 2].map((axis) => Math.max(((max[axis] - min[axis]) / 2) ** 2, 1e-6))

    return (p) => normalize([(p[0] - centre[0]) / squared[0], (p[1] - centre[1]) / squared[1], (p[2] - centre[2]) / squared[2]])
}

export function buildRockMesh(plan: RockPlan, surface: RockSurface, seed: number, detail: number): THREE.BufferGeometry {
    if (detail >= PLAIN_BELOW) {
        return meshAt(plan, surface, seed, detail, 1)
    }

    const full = meshAt(plan, surface, seed, 1, 1)
    const target = (full.index!.count / 3) * detail
    let best: THREE.BufferGeometry = full

    full.dispose()

    // A carved rock's full level is heavier, so its lightest may need every chunk to reach its share.
    for (const chunkShare of (surface.rounded ?? 0) > 0 ? [PLAIN_CHUNKS, 1] : [PLAIN_CHUNKS]) {
        for (const cutShare of PLAIN_CUTS) {
            const geometry = meshAt(plan, surface, seed, detail, cutShare, chunkShare)

            if (Math.abs(geometry.index!.count / 3 - target) < Math.abs(best.index!.count / 3 - target)) {
                best = geometry
            }
        }
    }

    return best
}

/** Where a carved rock's colour is read: the light at the point, and how far out towards its face's edge it sits. */
export interface CarvedPoint {
    readonly n: Vec3
    /** 0 at the middle of a face, 1 on its edge. */
    readonly at: number
}

const smoothstep = (from: number, to: number, value: number) => {
    const t = clamp01((value - from) / (to - from))

    return t * t * (3 - 2 * t)
}

/**
 * The colour of the stone at a point on a face: darker in a seam between chunks
 * and near the ground, mossy where it faces the sky or the shade, under any snow.
 *
 * Given where a carved rock's point is, the colour runs across the whole rock: from
 * the point's own light, its height and soft patches in space, so two faces meeting
 * at an edge share their colour there, and moss fades in and creeps over edges.
 */
export function rockPainter(plan: RockPlan, chunks: readonly RockChunk[], surface: RockSurface, seed = 0) {
    const size = (plan.width + plan.height + plan.depth) / 3
    const stone = colourRamp(rampOf(surface.palette, ROCK_RAMPS, surface, STONE_ROWS))
    const moss = colourRamp(MOSS_RAMP)
    const calmMoss = colourRamp(CALM_MOSS_RAMP)
    const mossAbove = surface.moss > 0 ? 1 - surface.moss * MOSS_REACH : Infinity
    const seamReach = size * SEAM_REACH
    const groundReach = plan.height * GROUND_REACH
    const weather = {snow: surface.snow ?? 0, wet: surface.wet ?? 0, mossFrom: surface.mossFrom ?? 'sky'}
    const patchScale = 1 / (size * PATCH_SIZE)
    const stoneColour = new THREE.Color()

    const shadeAt = (p: Vec3, chunkIndex: number) => {
        let seam = Infinity

        chunks.forEach((other, index) => {
            if (index !== chunkIndex) {
                seam = Math.min(seam, Math.abs(distanceToChunk(other, p)))
            }
        })

        return (clamp01(seam / seamReach) * 0.35 + 0.65) * (clamp01(p[1] / groundReach) * 0.3 + 0.7)
    }

    const paintCarved = (p: Vec3, plane: RockPlane, chunkIndex: number, onEdge: boolean, {n, at}: CarvedPoint): THREE.Color => {
        const shade = shadeAt(p, chunkIndex)
        const patch = valueNoise3(p[0] * patchScale, p[1] * patchScale, p[2] * patchScale, seed)
        const fine = valueNoise3(p[0] * patchScale * 2.7, p[1] * patchScale * 2.7, p[2] * patchScale * 2.7, seed + 7)
        const height = clamp01(p[1] / plan.height)
        // A face keeps some tone of its own in its middle, none where it meets the next.
        const tone = (plane.tone - 0.5) * 0.56 * surface.variation * CARVED_FACE_TONE * (1 - at * at)
        const value =
            0.36 +
            (n[1] * 0.5 + 0.5) * 0.24 +
            tone +
            height * 0.18 +
            patch * PATCH_LIGHT +
            fine * PATCH_LIGHT * 0.4 +
            // A painted light line along the top edges only.
            (onEdge ? EDGE_LIGHT * clamp01(n[1] * 1.6) : 0)
        const facing =
            mossFacing(n[0], n[1], n[2], weather.mossFrom) + patch * MOSS_PATCHES + fine * MOSS_PATCHES * 0.4 + (weather.mossFrom === 'sky' ? (height - 0.5) * 0.12 : 0)
        const mossy = surface.moss > 0 ? smoothstep(mossAbove - MOSS_SOFTNESS, mossAbove + MOSS_SOFTNESS, facing) : 0
        // Stone darkens a little just where the moss begins.
        const rim = mossy * (1 - mossy) * 4

        stoneColour.copy(stone(value * shade * (1 - MOSS_RIM * rim)))

        if (mossy <= 0) {
            return stoneColour
        }

        return stoneColour.lerp(calmMoss((0.12 + (patch * 0.5 + 0.5) * 0.4 + (fine * 0.5 + 0.5) * 0.15 + n[1] * 0.12 + tone) * shade), mossy)
    }

    const paintStone = (p: Vec3, plane: RockPlane, chunkIndex: number, onEdge: boolean): THREE.Color => {
        const shade = shadeAt(p, chunkIndex)

        if (mossFacing(plane.n[0], plane.n[1], plane.n[2], weather.mossFrom) > mossAbove) {
            return moss(onEdge ? 0.75 : (0.3 + plane.tone * 0.45) * shade)
        }

        // Nothing here favours one side: a prop gets turned in a game, and the
        // sun belongs to the game.
        const value =
            0.34 +
            (plane.n[1] * 0.5 + 0.5) * 0.28 +
            (plane.tone - 0.5) * 0.56 * surface.variation +
            clamp01(p[1] / plan.height) * 0.2 +
            (onEdge ? EDGE_LIGHT : 0)

        return stone(value * shade)
    }

    // Snow and wet lie over moss and stone alike.
    return (p: Vec3, plane: RockPlane, chunkIndex: number, onEdge: boolean, carved?: CarvedPoint): THREE.Color =>
        carved
            ? weatherPaint(paintCarved(p, plane, chunkIndex, onEdge, carved), carved.n[1], weather, valueNoise3(p[0] * patchScale, p[1] * patchScale, p[2] * patchScale, seed + 3))
            : weatherPaint(paintStone(p, plane, chunkIndex, onEdge), plane.n[1], weather, plane.tone * 2 - 1)
}

function meshAt(plan: RockPlan, surface: RockSurface, seed: number, detail: number, cutShare: number, chunkShare = PLAIN_CHUNKS): THREE.BufferGeometry {
    const size = (plan.width + plan.height + plan.depth) / 3
    const chunks = chunksAtDetail(plan, detail, cutShare, chunkShare)
    const rounded = clamp01(surface.rounded ?? 0)
    // Rounded light is what marks a rock built since it existed, so one saved before stays exactly as it was.
    const carved = rounded > 0
    // A carved rock steps down through one plain wide edge before it has none.
    const withRings = detail >= (carved ? CARVED_RINGS_FROM : RINGS_FROM) && surface.edges > 0
    const fullyCarved = carved && detail >= RINGS_FROM
    const edgeWidth = surface.edges * (carved ? CARVED_EDGE_WIDTH : EDGE_WIDTH) * size ** 0.6

    const waves = WARP_WAVES / size
    const reach = surface.bend * WARP_REACH * size
    const phase = (seed % 1000) / 100
    // A function of where a point is, so corners shared by two faces move together.
    const warp = (p: Vec3): Vec3 => [
        p[0] + reach * Math.sin((p[1] + p[2] * 0.7) * waves + phase),
        p[1] + reach * 0.6 * Math.sin((p[0] * 0.8 + p[2] * 0.6) * waves + phase * 2.1),
        p[2] + reach * Math.sin((p[0] * 0.9 + p[1] * 0.6) * waves + phase * 0.4),
    ]

    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    const pictured = (surface.grain ?? 0) > 0

    const paint = rockPainter(plan, chunks, surface, seed)

    chunks.forEach((chunk, chunkIndex) => {
        const faces = facesOfChunk(chunk)
        const leaning = new Map<string, [number, number, number]>()
        const keyOf = (p: Vec3) => `${Math.round(p[0] * WELD)},${Math.round(p[1] * WELD)},${Math.round(p[2] * WELD)}`

        for (const {plane, corners} of faces) {
            for (const corner of corners) {
                const sum = leaning.get(keyOf(corner)) ?? [0, 0, 0]

                sum[0] += plane.n[0]
                sum[1] += plane.n[1]
                sum[2] += plane.n[2]
                leaning.set(keyOf(corner), sum)
            }
        }

        const body = roundBody(faces)
        const roundedLight = (n: Vec3, p: Vec3): Vec3 => {
            const towards = body(p)

            return normalize([n[0] * (1 - rounded) + towards[0] * rounded, n[1] * (1 - rounded) + towards[1] * rounded, n[2] * (1 - rounded) + towards[2] * rounded])
        }

        const hidden = (a: Vec3, b: Vec3, c: Vec3) =>
            chunks.some(
                (other, index) =>
                    index !== chunkIndex &&
                    distanceToChunk(other, a) < 0 &&
                    distanceToChunk(other, b) < 0 &&
                    distanceToChunk(other, c) < 0,
            )

        for (const {plane, corners} of faces) {
            const [across, up] = faceAxes(plane.n)
            const count = corners.length
            const middle: Vec3 = [
                corners.reduce((sum, p) => sum + p[0], 0) / count,
                corners.reduce((sum, p) => sum + p[1], 0) / count,
                corners.reduce((sum, p) => sum + p[2], 0) / count,
            ]
            const radius = corners.reduce((sum, p) => sum + Math.hypot(p[0] - middle[0], p[1] - middle[1], p[2] - middle[2]), 0) / count
            const share = Math.min(MAX_EDGE_SHARE, edgeWidth / Math.max(radius, 1e-6))
            const keep = 1 - share
            // How far in from its corners each ring sits, and how far its light leans
            // towards the faces around it. A carved face has a two-row edge that turns
            // the light a step at a time, and a ring inside so the light can roll across it.
            // Between, a carved rock gives only its larger faces an edge.
            const edged = withRings && (fullyCarved || !carved || radius > size * PLAIN_EDGE_FROM)
            const rings: readonly {at: number; lean: number}[] = !edged
                ? [{at: 1, lean: 0}]
                : fullyCarved
                  ? [
                        {at: 1, lean: 1},
                        {at: 1 - share * 0.45, lean: CARVED_EDGE_LEAN},
                        {at: keep, lean: 0},
                        // A small face is too small for the light to roll across.
                        ...(radius > size * INNER_FROM ? [{at: keep * INNER_RING, lean: 0}] : []),
                    ]
                  : [
                        {at: 1, lean: carved ? CARVED_PLAIN_LEAN : EDGE_LEAN},
                        {at: keep, lean: 0},
                    ]
            const ringPoints = rings.map(({at}) =>
                at === 1
                    ? corners
                    : corners.map((p): Vec3 => [middle[0] + (p[0] - middle[0]) * at, middle[1] + (p[1] - middle[1]) * at, middle[2] + (p[2] - middle[2]) * at]),
            )
            const pillow = carved ? surface.bend * PILLOW * radius : 0
            // A vertex is written only if a triangle that stays uses it.
            const written = new Map<string, number>()
            const vertex = (slot: string, p: Vec3, n: Vec3, onEdge: boolean, at = 0) => {
                let index = written.get(slot)

                if (index === undefined) {
                    // A carved face swells a little towards its middle; its edges stay put,
                    // so it still meets the next face.
                    const rise = pillow * (1 - at * at)
                    const moved = warp(rise > 0 ? [p[0] + plane.n[0] * rise, p[1] + plane.n[1] * rise, p[2] + plane.n[2] * rise] : p)
                    const lit = carved ? roundedLight(n, p) : n
                    const colour = paint(p, plane, chunkIndex, onEdge, carved ? {n: lit, at} : undefined)

                    index = positions.length / 3
                    positions.push(moved[0], moved[1], moved[2])
                    normals.push(lit[0], lit[1], lit[2])
                    colors.push(colour.r, colour.g, colour.b)

                    // Flat on the face's own plane: no point is shared with the next face,
                    // so the picture never stretches round a corner.
                    if (pictured) {
                        uvs.push(dot(p, across) / PICTURE_METRES, dot(p, up) / PICTURE_METRES)
                    }
                    written.set(slot, index)
                }

                return index
            }
            const outerNormal = (p: Vec3, lean: number): Vec3 => {
                if (lean === 0) {
                    return plane.n
                }

                const out = normalize(leaning.get(keyOf(p)) ?? plane.n)

                return normalize([plane.n[0] * (1 - lean) + out[0] * lean, plane.n[1] * (1 - lean) + out[1] * lean, plane.n[2] * (1 - lean) + out[2] * lean])
            }

            if (detail < PLAIN_BELOW) {
                for (let i = 1; i < count - 1; i++) {
                    if (!hidden(corners[0], corners[i], corners[i + 1])) {
                        indices.push(
                            vertex('o0', corners[0], plane.n, false, 1),
                            vertex(`o${i}`, corners[i], plane.n, false, 1),
                            vertex(`o${i + 1}`, corners[i + 1], plane.n, false, 1),
                        )
                    }
                }

                continue
            }

            // A point on ring r: its corner's normal leans as far as the ring says, and only
            // the outermost ring of an edged face counts as edge.
            const ringVertex = (r: number, i: number) => {
                return vertex(`${r}:${i}`, ringPoints[r][i], outerNormal(corners[i], rings[r].lean), edged && r === 0, rings[r].at)
            }
            const last = rings.length - 1

            for (let i = 0; i < count; i++) {
                const j = (i + 1) % count

                for (let r = 0; r < last; r++) {
                    const outer = ringPoints[r]
                    const inner = ringPoints[r + 1]

                    if (!hidden(outer[i], outer[j], inner[j])) {
                        indices.push(ringVertex(r, i), ringVertex(r, j), ringVertex(r + 1, j))
                    }

                    if (!hidden(outer[i], inner[j], inner[i])) {
                        indices.push(ringVertex(r, i), ringVertex(r + 1, j), ringVertex(r + 1, i))
                    }
                }

                if (!hidden(ringPoints[last][i], ringPoints[last][j], middle)) {
                    indices.push(ringVertex(last, i), ringVertex(last, j), vertex('m', middle, plane.n, false))
                }
            }
        }
    })

    if (detail < PLAIN_BELOW) {
        if (plan.uneven) {
            fitToBox(positions, outlineOf(plan.chunks))
        } else {
            fitToPlan(positions, plan)
        }
    }

    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

    if (pictured) {
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    }

    geometry.setIndex(indices)
    geometry.computeBoundingSphere()

    return geometry
}
