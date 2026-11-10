/**
 * Flowering plants: stems with a head on top, and a few leaves at the foot.
 *
 * Everything is solid shapes with no texture, as grass is. A head is built in the
 * frame of the stem's tip, so it tilts as the stem leans. A shape is seen from both
 * sides over shared vertices, because a double-sided material would flip its normals.
 */

import * as THREE from 'three'
import type {SnowAndWet} from '../shared/weather'
import {createSeededRandom, hashSeed, randomRange, type RandomSource} from '../shared/random'
import {FLOWER_ROWS, rampOf, type OwnColourValues, type OwnColours} from '../style/own-colours'
import {FLOWER_CENTRE, PETAL_RAMPS, STEM_RAMP, type PetalPaletteId} from '../style/palettes'
import {colourRamp} from '../style/ramp'

export type PlantKind = 'daisy' | 'cup' | 'spike' | 'plume'
export type PlantBuild = 'painted' | 'low-poly'

export interface PlantParameters extends Partial<OwnColourValues<typeof FLOWER_ROWS>>, SnowAndWet {
    readonly kind: PlantKind
    readonly width: number
    readonly height: number
    readonly stems: number
    /** How far the stems bend over, 0 to 1. */
    readonly lean: number
    /** Across a flower, or how long a spike or plume is, in metres. */
    readonly headSize: number
    /** Leaves at the foot of each stem. */
    readonly leaves: number
    readonly palette: PetalPaletteId | OwnColours
    readonly build: PlantBuild
}

export type Vec3 = readonly [number, number, number]

export interface PlantBuffers {
    readonly positions: number[]
    readonly normals: number[]
    readonly colors: number[]
    readonly indices: number[]
}

export interface Stem {
    readonly x: number
    readonly z: number
    readonly facing: number
    readonly height: number
    readonly lean: number
    readonly seed: number
    readonly priority: number
}

const SEED_STEM = 7000
const STEM_PIECES = 3
export const STEM_WIDTH = 0.006
const LEAF_PIECES = 2
const DAISY_PETALS = 9
const CUP_PETALS = 6
const SPIKE_FLORETS = 15
const PLUME_FEATHERS = 36
/** How much of a stem's length a spike or plume takes up. */
export const SPIKE_SHARE = 0.38
export const PLUME_SHARE = 0.42
const MAX_HEAD_GROWTH = 1.5
const REACH_AT_MIDDLE = 0.25
const CURVE_AT_MIDDLE = 0.62
const LEAN_DROP = 0.35

const normalize = (a: Vec3): Vec3 => {
    const length = Math.hypot(a[0], a[1], a[2]) || 1

    return [a[0] / length, a[1] / length, a[2] / length]
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const along = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + b[0] * t, a[1] + b[1] * t, a[2] + b[2] * t]

function pushVertex(buffers: PlantBuffers, p: Vec3, n: Vec3, c: THREE.Color): number {
    const index = buffers.positions.length / 3

    buffers.positions.push(p[0], p[1], p[2])
    buffers.normals.push(n[0], n[1], n[2])
    buffers.colors.push(c.r, c.g, c.b)

    return index
}

const pushBothSides = (buffers: PlantBuffers, a: number, b: number, c: number) => buffers.indices.push(a, b, c, a, c, b)

/** A kite from `base` to `tip`, widest at `share` of the way along. */
function addKite(
    buffers: PlantBuffers,
    base: Vec3,
    tip: Vec3,
    across: Vec3,
    share: number,
    n: Vec3,
    baseColour: THREE.Color,
    tipColour: THREE.Color,
) {
    const middle: Vec3 = [base[0] + (tip[0] - base[0]) * share, base[1] + (tip[1] - base[1]) * share, base[2] + (tip[2] - base[2]) * share]
    const a = pushVertex(buffers, base, n, baseColour)
    const b = pushVertex(buffers, along(middle, across, 1), n, tipColour)
    const c = pushVertex(buffers, tip, n, tipColour)
    const d = pushVertex(buffers, along(middle, across, -1), n, tipColour)

    pushBothSides(buffers, a, b, c)
    pushBothSides(buffers, a, c, d)
}

export interface StemPath {
    point(t: number): Vec3
    tangent(t: number): Vec3
    readonly side: Vec3
}

/** A curve from the root, leaning `facing` by `lean`, and rising to `height`. */
export function stemPath(x: number, z: number, facing: number, height: number, lean: number): StemPath {
    const fx = Math.cos(facing)
    const fz = Math.sin(facing)
    const reach = lean * height
    const top = height * (1 - LEAN_DROP * lean)

    return {
        side: [-fz, 0, fx],
        point(t) {
            const u = 1 - t
            const out = 2 * u * t * reach * REACH_AT_MIDDLE + t * t * reach

            return [x + fx * out, 2 * u * t * height * CURVE_AT_MIDDLE + t * t * top, z + fz * out]
        },
        tangent(t) {
            const u = 1 - t
            const out = 2 * u * reach * REACH_AT_MIDDLE + 2 * t * reach * (1 - REACH_AT_MIDDLE)
            const rise = 2 * u * height * CURVE_AT_MIDDLE + 2 * t * (top - height * CURVE_AT_MIDDLE)

            return normalize([fx * out, rise, fz * out])
        },
    }
}

/** A strip along a path, ending in a point if `pointed`. */
export function addStrip(
    buffers: PlantBuffers,
    path: StemPath,
    width: number,
    pieces: number,
    paint: (t: number) => THREE.Color,
    pointed: boolean,
    upTo = 1,
) {
    const first = buffers.positions.length / 3
    const n: Vec3 = normalize([0, 1, 0])

    for (let piece = 0; piece <= pieces; piece++) {
        const t = (piece / pieces) * upTo
        const p = path.point(t)
        const half = pointed ? (width / 2) * (1 - (piece / pieces) ** 1.6) : (width / 2) * (1 - 0.4 * (piece / pieces))
        const colour = paint(piece / pieces)

        pushVertex(buffers, along(p, path.side, half), n, colour)
        pushVertex(buffers, along(p, path.side, -half), n, colour)
    }

    for (let piece = 0; piece < pieces; piece++) {
        const a = first + piece * 2

        pushBothSides(buffers, a, a + 1, a + 3)
        pushBothSides(buffers, a, a + 3, a + 2)
    }
}

/** Flat petals around a golden middle. */
export function addDaisy(
    buffers: PlantBuffers,
    tip: Vec3,
    axis: Vec3,
    across: number,
    petals: number,
    paint: (value: number) => THREE.Color,
    random: RandomSource,
) {
    const radius = across / 2
    const u = normalize(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
    const v = cross(axis, u)
    const turn = random() * Math.PI * 2
    const n = normalize([axis[0], axis[1] + 0.6, axis[2]])

    for (let i = 0; i < petals; i++) {
        const angle = turn + (i / petals) * Math.PI * 2
        const out: Vec3 = [
            u[0] * Math.cos(angle) + v[0] * Math.sin(angle),
            u[1] * Math.cos(angle) + v[1] * Math.sin(angle),
            u[2] * Math.cos(angle) + v[2] * Math.sin(angle),
        ]
        const side = cross(axis, out)
        const base = along(tip, out, radius * 0.14)
        const end = along(along(tip, out, radius), axis, -radius * 0.12)
        const widest = (radius * Math.PI * 0.62) / petals

        addKite(buffers, base, end, [side[0] * widest, side[1] * widest, side[2] * widest], 0.6, n, paint(0.35).clone(), paint(0.5 + random() * 0.5).clone())
    }

    const centre = new THREE.Color(FLOWER_CENTRE)
    const middle = pushVertex(buffers, along(tip, axis, radius * 0.1), n, centre)
    const ring = Array.from({length: 5}, (_, i) => {
        const angle = turn + (i / 5) * Math.PI * 2
        const c = Math.cos(angle) * radius * 0.26
        const s = Math.sin(angle) * radius * 0.26

        return pushVertex(buffers, [tip[0] + u[0] * c + v[0] * s, tip[1] + u[1] * c + v[1] * s, tip[2] + u[2] * c + v[2] * s], n, centre)
    })

    ring.forEach((corner, i) => pushBothSides(buffers, middle, corner, ring[(i + 1) % ring.length]))
}

/** Petals closed upwards, like a flame. */
function addCup(buffers: PlantBuffers, tip: Vec3, axis: Vec3, across: number, paint: (value: number) => THREE.Color, random: RandomSource) {
    const u = normalize(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
    const v = cross(axis, u)
    const radius = across / 2
    const tall = across * 1.5
    const turn = random() * Math.PI * 2

    for (let i = 0; i < CUP_PETALS; i++) {
        const angle = turn + (i / CUP_PETALS) * Math.PI * 2
        const out: Vec3 = [
            u[0] * Math.cos(angle) + v[0] * Math.sin(angle),
            u[1] * Math.cos(angle) + v[1] * Math.sin(angle),
            u[2] * Math.cos(angle) + v[2] * Math.sin(angle),
        ]
        const side = cross(axis, out)
        const lean = i % 2 === 0 ? 0.22 : 0.42
        const end = along(along(tip, axis, tall), out, radius * lean)
        const widest = radius * 0.62
        const n = normalize([out[0] + axis[0] * 0.5, out[1] + axis[1] * 0.5 + 0.3, out[2] + axis[2] * 0.5])
        const bulged = along(tip, out, radius * 0.75)

        addKite(buffers, bulged, end, [side[0] * widest, side[1] * widest, side[2] * widest], 0.22, n, paint(0.15).clone(), paint(0.7 + random() * 0.3).clone())
        addKite(buffers, tip, bulged, [side[0] * widest * 0.5, side[1] * widest * 0.5, side[2] * widest * 0.5], 0.6, n, paint(0).clone(), paint(0.15).clone())
    }
}

/** Small florets in whorls up the end of the stem, shrinking towards the tip. */
function addSpike(buffers: PlantBuffers, path: StemPath, length: number, paint: (value: number) => THREE.Color, random: RandomSource) {
    for (let i = 0; i < SPIKE_FLORETS; i++) {
        const share = i / (SPIKE_FLORETS - 1)
        const t = 1 - SPIKE_SHARE * (1 - share)
        const at = path.point(t)
        const axis = path.tangent(t)
        const u = normalize(cross(axis, [0.3, 1, 0.2]))
        const v = cross(axis, u)
        const angle = i * 2.4 + random()
        const out: Vec3 = normalize([
            u[0] * Math.cos(angle) + v[0] * Math.sin(angle) + axis[0] * 0.6,
            u[1] * Math.cos(angle) + v[1] * Math.sin(angle) + axis[1] * 0.6,
            u[2] * Math.cos(angle) + v[2] * Math.sin(angle) + axis[2] * 0.6,
        ])
        const size = length * 0.2 * (1.1 - share * 0.75)
        const side = cross(axis, out)
        const n = normalize([out[0], out[1] + 0.5, out[2]])

        addKite(buffers, at, along(at, out, size), [side[0] * size * 0.32, side[1] * size * 0.32, side[2] * size * 0.32], 0.5, n, paint(share * 0.4).clone(), paint(0.5 + share * 0.5).clone())
    }
}

/** Pale feathers up the end of a stem, fullest in the middle and combed to its lean. */
function addPlume(buffers: PlantBuffers, path: StemPath, length: number, paint: (value: number) => THREE.Color, random: RandomSource) {
    for (let i = 0; i < PLUME_FEATHERS; i++) {
        const share = i / (PLUME_FEATHERS - 1)
        const t = 1 - PLUME_SHARE * (1 - share)
        const at = path.point(t)
        const axis = path.tangent(t)
        const u = normalize(cross(axis, [0.3, 1, 0.2]))
        const v = cross(axis, u)
        const angle = i * 2.4 + random() * 0.6
        const fullness = Math.sin(Math.min(1, share * 1.1 + 0.08) * Math.PI) ** 0.7
        const out: Vec3 = normalize([
            (u[0] * Math.cos(angle) + v[0] * Math.sin(angle)) * 0.6 + axis[0],
            (u[1] * Math.cos(angle) + v[1] * Math.sin(angle)) * 0.6 + axis[1],
            (u[2] * Math.cos(angle) + v[2] * Math.sin(angle)) * 0.6 + axis[2],
        ])
        const size = length * (0.14 + 0.28 * fullness) * randomRange(random, 0.8, 1.15)
        const side = normalize(cross(axis, out))
        const wide = size * 0.2
        const n = normalize([out[0] * 0.5, out[1] * 0.5 + 0.8, out[2] * 0.5])

        addKite(buffers, at, along(at, out, size), [side[0] * wide, side[1] * wide, side[2] * wide], 0.45, n, paint(0.2 + share * 0.2).clone(), paint(0.6 + random() * 0.4).clone())
    }
}

function planStems(plant: PlantParameters, seed: number): readonly Stem[] {
    const radius = plant.width / 2

    return Array.from({length: Math.max(1, Math.round(plant.stems))}, (_, index) => {
        const stemSeed = hashSeed(seed, SEED_STEM + index)
        const random = createSeededRandom(stemSeed)
        const azimuth = random() * Math.PI * 2
        const out = Math.sqrt(random()) * radius

        return {
            x: Math.cos(azimuth) * out,
            z: Math.sin(azimuth) * out,
            // Leans away from the middle, as a clump of flowers opens out.
            facing: azimuth + randomRange(random, -0.8, 0.8),
            height: plant.height * randomRange(random, 0.7, 1),
            lean: plant.lean * randomRange(random, 0.5, 1.2),
            seed: stemSeed,
            priority: random(),
        }
    })
}

/** Always keeps the stems at the extent, so the outline holds. */
function stemsAtDetail(stems: readonly Stem[], count: number): readonly Stem[] {
    const edges = new Set<Stem>()
    const tipX = (stem: Stem) => stem.x + Math.cos(stem.facing) * stem.lean * stem.height
    const tipZ = (stem: Stem) => stem.z + Math.sin(stem.facing) * stem.lean * stem.height

    for (const measure of [(s: Stem) => s.height * (1 - LEAN_DROP * s.lean), tipX, (s: Stem) => -tipX(s), tipZ, (s: Stem) => -tipZ(s)]) {
        edges.add(stems.reduce((best, stem) => (measure(stem) > measure(best) ? stem : best)))
    }

    const rest = stems.filter((stem) => !edges.has(stem)).sort((a, b) => a.priority - b.priority)

    return [...edges, ...rest.slice(0, Math.max(0, count - edges.size))]
}

/**
 * The stems kept at this detail, built by `build`. Heads grow as stems are dropped,
 * and a lighter plant is stretched to the full one's extent.
 */
export function plantAtDetail(
    plant: PlantParameters,
    seed: number,
    detail: number,
    build: (stems: readonly Stem[], growth: number) => THREE.BufferGeometry,
): THREE.BufferGeometry {
    const all = planStems(plant, seed)
    const stems = detail < 1 ? stemsAtDetail(all, Math.round(all.length * detail)) : all
    const geometry = build(stems, Math.min(Math.sqrt(all.length / stems.length), MAX_HEAD_GROWTH))

    if (detail < 1) {
        const full = build(all, 1)

        full.computeBoundingBox()
        fitToExtent(geometry, full.boundingBox!)
        full.dispose()
    }

    geometry.computeBoundingSphere()

    return geometry
}

export function buildPlantMesh(plant: PlantParameters, seed: number, detail: number): THREE.BufferGeometry {
    return plantAtDetail(plant, seed, detail, (stems, growth) => {
        const petal = colourRamp(rampOf(plant.palette, PETAL_RAMPS, plant, FLOWER_ROWS))
        const green = colourRamp(STEM_RAMP)
        const buffers: PlantBuffers = {positions: [], normals: [], colors: [], indices: []}
        const head = plant.headSize * growth

        for (const stem of stems) {
            const random = createSeededRandom(hashSeed(stem.seed, 1))
            const path = stemPath(stem.x, stem.z, stem.facing, stem.height, stem.lean)
            const stemWidth = STEM_WIDTH * (1 + plant.height) * growth

            addStrip(buffers, path, stemWidth, STEM_PIECES, (t) => green(0.2 + t * 0.5), false)

            for (let leaf = 0; leaf < Math.round(plant.leaves); leaf++) {
                const leafPath = stemPath(
                    stem.x,
                    stem.z,
                    stem.facing + randomRange(random, -3, 3),
                    stem.height * randomRange(random, 0.3, 0.55),
                    randomRange(random, 0.5, 1),
                )

                addStrip(buffers, leafPath, plant.headSize * 0.45 * growth + stemWidth, LEAF_PIECES, (t) => green(0.15 + t * 0.8), true)
            }

            const tip = path.point(1)
            const axis = path.tangent(1)

            switch (plant.kind) {
                case 'daisy':
                    addDaisy(buffers, tip, axis, head, DAISY_PETALS, petal, random)
                    break
                case 'cup':
                    addCup(buffers, tip, axis, head, petal, random)
                    break
                case 'spike':
                    addSpike(buffers, path, head, petal, random)
                    break
                case 'plume':
                    addPlume(buffers, path, head, petal, random)
                    break
            }
        }

        const geometry = new THREE.BufferGeometry()

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3))
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3))
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3))
        geometry.setIndex(buffers.indices)

        return geometry
    })
}

/** Stretches a lighter plant to the full size: a leaf it dropped may have set the outline. */
function fitToExtent(geometry: THREE.BufferGeometry, extent: THREE.Box3) {
    geometry.computeBoundingBox()

    const box = geometry.boundingBox!
    const position = geometry.getAttribute('position')
    const fit = (value: number, axis: 'x' | 'y' | 'z') => {
        const span = box.max[axis] - box.min[axis]

        return span > 1e-6 ? extent.min[axis] + ((value - box.min[axis]) / span) * (extent.max[axis] - extent.min[axis]) : value
    }

    for (let i = 0; i < position.count; i++) {
        position.setXYZ(i, fit(position.getX(i), 'x'), fit(position.getY(i), 'y'), fit(position.getZ(i), 'z'))
    }

    geometry.computeBoundingBox()
}
