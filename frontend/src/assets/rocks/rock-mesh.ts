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
import {mossFacing, weatherPaint, type MossFrom} from '../shared/weather'
import {colourRamp} from '../style/ramp'
import {rampOf, STONE_ROWS, type OwnColours} from '../style/own-colours'
import {MOSS_RAMP, ROCK_RAMPS, type RockPaletteId} from '../style/palettes'
import type {CrackedChunk} from './rock-damage'
import {distanceToChunk, facesOfChunk, normalize, type RockChunk, type RockPlan, type RockPlane, type Vec3} from './rock-plan'

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
/** Moss starts on the flattest stone and creeps down the slopes as it grows. */
const MOSS_REACH = 0.6
/** How far darkness reaches from a seam or the ground, as a share of the size and the height. */
const SEAM_REACH = 0.1
const GROUND_REACH = 0.25
/** Below this share of its detail, a rock has no edge rings. */
const RINGS_FROM = 0.7
/** Below this, it keeps its largest chunks and its first cuts only. */
export const PLAIN_BELOW = 0.25
const PLAIN_CHUNKS = 0.75
/** The shares of its cuts a plain rock tries, keeping whichever lands nearest its target. */
export const PLAIN_CUTS: readonly number[] = [0.15, 0.25, 0.35, 0.45, 0.6, 0.8, 1]
const WELD = 500

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** A lighter level drops the small chunks and the last cuts of the rest. */
export function chunksAtDetail(plan: RockPlan, detail: number, cutShare: number): readonly RockChunk[] {
    if (detail >= PLAIN_BELOW) {
        return plan.chunks
    }

    const largest = plan.chunks.slice(0, Math.max(1, Math.ceil(plan.chunks.length * PLAIN_CHUNKS)))
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

export function buildRockMesh(plan: RockPlan, surface: RockSurface, seed: number, detail: number): THREE.BufferGeometry {
    if (detail >= PLAIN_BELOW) {
        return meshAt(plan, surface, seed, detail, 1)
    }

    const full = meshAt(plan, surface, seed, 1, 1)
    const target = (full.index!.count / 3) * detail
    let best: THREE.BufferGeometry = full

    full.dispose()

    for (const cutShare of PLAIN_CUTS) {
        const geometry = meshAt(plan, surface, seed, detail, cutShare)

        if (Math.abs(geometry.index!.count / 3 - target) < Math.abs(best.index!.count / 3 - target)) {
            best = geometry
        }
    }

    return best
}

/**
 * The colour of the stone at a point on a face: darker in a seam between chunks
 * and near the ground, mossy where it faces the sky or the shade, under any snow.
 */
export function rockPainter(plan: RockPlan, chunks: readonly RockChunk[], surface: RockSurface) {
    const size = (plan.width + plan.height + plan.depth) / 3
    const stone = colourRamp(rampOf(surface.palette, ROCK_RAMPS, surface, STONE_ROWS))
    const moss = colourRamp(MOSS_RAMP)
    const mossAbove = surface.moss > 0 ? 1 - surface.moss * MOSS_REACH : Infinity
    const seamReach = size * SEAM_REACH
    const groundReach = plan.height * GROUND_REACH
    const weather = {snow: surface.snow ?? 0, wet: surface.wet ?? 0, mossFrom: surface.mossFrom ?? 'sky'}

    const paintStone = (p: Vec3, plane: RockPlane, chunkIndex: number, onEdge: boolean): THREE.Color => {
        let seam = Infinity

        chunks.forEach((other, index) => {
            if (index !== chunkIndex) {
                seam = Math.min(seam, Math.abs(distanceToChunk(other, p)))
            }
        })

        const shade = (clamp01(seam / seamReach) * 0.35 + 0.65) * (clamp01(p[1] / groundReach) * 0.3 + 0.7)

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
    return (p: Vec3, plane: RockPlane, chunkIndex: number, onEdge: boolean): THREE.Color =>
        weatherPaint(paintStone(p, plane, chunkIndex, onEdge), plane.n[1], weather, plane.tone * 2 - 1)
}

function meshAt(plan: RockPlan, surface: RockSurface, seed: number, detail: number, cutShare: number): THREE.BufferGeometry {
    const size = (plan.width + plan.height + plan.depth) / 3
    const chunks = chunksAtDetail(plan, detail, cutShare)
    const withRings = detail >= RINGS_FROM && surface.edges > 0
    const edgeWidth = surface.edges * EDGE_WIDTH * size ** 0.6

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
    const indices: number[] = []

    const paint = rockPainter(plan, chunks, surface)

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

        const hidden = (a: Vec3, b: Vec3, c: Vec3) =>
            chunks.some(
                (other, index) =>
                    index !== chunkIndex &&
                    distanceToChunk(other, a) < 0 &&
                    distanceToChunk(other, b) < 0 &&
                    distanceToChunk(other, c) < 0,
            )

        for (const {plane, corners} of faces) {
            const count = corners.length
            const middle: Vec3 = [
                corners.reduce((sum, p) => sum + p[0], 0) / count,
                corners.reduce((sum, p) => sum + p[1], 0) / count,
                corners.reduce((sum, p) => sum + p[2], 0) / count,
            ]
            const radius = corners.reduce((sum, p) => sum + Math.hypot(p[0] - middle[0], p[1] - middle[1], p[2] - middle[2]), 0) / count
            const keep = 1 - Math.min(MAX_EDGE_SHARE, edgeWidth / Math.max(radius, 1e-6))
            const inner = corners.map((p): Vec3 => [
                middle[0] + (p[0] - middle[0]) * keep,
                middle[1] + (p[1] - middle[1]) * keep,
                middle[2] + (p[2] - middle[2]) * keep,
            ])
            // A vertex is written only if a triangle that stays uses it.
            const written = new Map<string, number>()
            const vertex = (slot: string, p: Vec3, n: Vec3, onEdge: boolean) => {
                let index = written.get(slot)

                if (index === undefined) {
                    const moved = warp(p)
                    const colour = paint(p, plane, chunkIndex, onEdge)

                    index = positions.length / 3
                    positions.push(moved[0], moved[1], moved[2])
                    normals.push(n[0], n[1], n[2])
                    colors.push(colour.r, colour.g, colour.b)
                    written.set(slot, index)
                }

                return index
            }
            const outerNormal = (p: Vec3): Vec3 => {
                const out = normalize(leaning.get(keyOf(p)) ?? plane.n)

                return normalize([
                    plane.n[0] * (1 - EDGE_LEAN) + out[0] * EDGE_LEAN,
                    plane.n[1] * (1 - EDGE_LEAN) + out[1] * EDGE_LEAN,
                    plane.n[2] * (1 - EDGE_LEAN) + out[2] * EDGE_LEAN,
                ])
            }

            if (detail < PLAIN_BELOW) {
                for (let i = 1; i < count - 1; i++) {
                    if (!hidden(corners[0], corners[i], corners[i + 1])) {
                        indices.push(
                            vertex('o0', corners[0], plane.n, false),
                            vertex(`o${i}`, corners[i], plane.n, false),
                            vertex(`o${i + 1}`, corners[i + 1], plane.n, false),
                        )
                    }
                }

                continue
            }

            for (let i = 0; i < count; i++) {
                const j = (i + 1) % count

                if (withRings) {
                    if (!hidden(corners[i], corners[j], inner[j])) {
                        indices.push(
                            vertex(`o${i}`, corners[i], outerNormal(corners[i]), true),
                            vertex(`o${j}`, corners[j], outerNormal(corners[j]), true),
                            vertex(`i${j}`, inner[j], plane.n, false),
                        )
                    }

                    if (!hidden(corners[i], inner[j], inner[i])) {
                        indices.push(
                            vertex(`o${i}`, corners[i], outerNormal(corners[i]), true),
                            vertex(`i${j}`, inner[j], plane.n, false),
                            vertex(`i${i}`, inner[i], plane.n, false),
                        )
                    }

                    if (!hidden(inner[i], inner[j], middle)) {
                        indices.push(
                            vertex(`i${i}`, inner[i], plane.n, false),
                            vertex(`i${j}`, inner[j], plane.n, false),
                            vertex('m', middle, plane.n, false),
                        )
                    }
                } else if (!hidden(corners[i], corners[j], middle)) {
                    indices.push(
                        vertex(`o${i}`, corners[i], plane.n, false),
                        vertex(`o${j}`, corners[j], plane.n, false),
                        vertex('m', middle, plane.n, false),
                    )
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
    geometry.setIndex(indices)
    geometry.computeBoundingSphere()

    return geometry
}
