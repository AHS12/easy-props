/**
 * Cacti: a ribbed column with arms, a barrel, or a stack of flat pads.
 *
 * Every stem is a tube swept along a centre line, its outline pinched into
 * ridges with sharp valleys between them, and closed in a dome at the top. Pads
 * are flattened ovals. Spines are small three-sided points in rows along the
 * ridges, or scattered over a pad, so they stand out from any side. Colour is
 * painted into the vertices, as on bushes and flowers, so nothing needs a texture.
 *
 * Low-poly is the same cactus drawn coarsely: a star of a few ridges, a few rings,
 * faceted pads and fewer spines, each face flat and one colour.
 */

import * as THREE from 'three'
import type {SnowAndWet} from '../shared/weather'
import {createSeededRandom, hashSeed, randomRange, type RandomSource} from '../shared/random'
import {CACTUS_ROWS, FLOWER_ROWS, rampOf, type OwnColourValues, type OwnColours} from '../style/own-colours'
import {CACTUS_RAMPS, PETAL_RAMPS, type CactusPaletteId, type PetalPaletteId} from '../style/palettes'
import {colourRamp} from '../style/ramp'

export type CactusKind = 'column' | 'barrel' | 'paddle'
export type CactusBuild = 'painted' | 'low-poly'

export interface CactusParameters extends Partial<OwnColourValues<typeof CACTUS_ROWS> & OwnColourValues<typeof FLOWER_ROWS>>, SnowAndWet {
    readonly kind: CactusKind
    readonly height: number
    /** Across the main stem, or across a pad. */
    readonly thickness: number
    readonly ribs: number
    /** How deep the valleys between the ridges are, 0 to 1. */
    readonly ribDepth: number
    readonly arms: number
    /** How many of its arms have fallen off and lie at its foot. */
    readonly fallenArms?: number
    /** Where the lowest arm leaves the stem, as a share of the height. */
    readonly armHeight: number
    readonly pads: number
    readonly lean: number
    /** How thickly the spines grow, 0 to 1. */
    readonly spines: number
    readonly flowers: number
    readonly palette: CactusPaletteId | OwnColours
    readonly flowerColour: PetalPaletteId | OwnColours
    readonly build: CactusBuild
}

type Vec3 = readonly [number, number, number]

/** What each vertex is, so it can be painted once the shape's light is known. */
const enum Paint {
    Skin,
    Spine,
    Petal,
}

interface Buffers {
    readonly positions: number[]
    readonly indices: number[]
    readonly paint: Paint[]
    /** For skin, how near the top of a ridge it is. For a petal, how far out. */
    readonly shade: number[]
}

const SEED_ARMS = 9100
const SEED_PADS = 9200
const SEED_SPINES = 9300
const SEED_FLOWERS = 9400
const SEED_LEAN = 9500
const SEED_FALLEN = 9600
/** Golden angle, so arms and pads never line up. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const SUN: Vec3 = normalize([0.4, 1, 0.3])
/** How far into the stem a valley cuts at full Ridge depth, as a share of the radius. */
const VALLEY = 0.32
/** Rows of spines along a ridge, per radius of length, at full Spines. */
const SPINE_ROWS = 1.6
const SPINE_SPACING_FLOOR = 0.15
const FLOWER_PETALS = 7
/** Petals on a flower seen from far off. */
const FAR_PETALS = 3
/** Low-poly: at most this many ridges, so each one is a face you can see. */
const LOW_POLY_RIBS = 10
/** Low-poly: the share of rings kept up a stem, and of the spines. */
const LOW_POLY_RINGS = 0.3
const LOW_POLY_SPINES = 0.35
const LOW_POLY_PETALS = 5

function normalize(a: Vec3): Vec3 {
    const length = Math.hypot(a[0], a[1], a[2]) || 1

    return [a[0] / length, a[1] / length, a[2] / length]
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const add = (a: Vec3, b: Vec3, scale = 1): Vec3 => [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

function anyPerpendicular(v: Vec3): Vec3 {
    return normalize(cross(v, Math.abs(v[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
}

function vertex(buffers: Buffers, p: Vec3, paint: Paint, shade: number): number {
    buffers.positions.push(p[0], p[1], p[2])
    buffers.paint.push(paint)
    buffers.shade.push(shade)

    return buffers.positions.length / 3 - 1
}

/** 1 on top of a ridge, 0 in the bottom of a valley, which is sharp as a cactus's is. */
const ridgeAt = (ribs: number, angle: number) => (ribs < 3 ? 1 : Math.abs(Math.cos((ribs * angle) / 2)))

interface Stem {
    /** The centre line, base to tip. */
    readonly path: readonly Vec3[]
    /** The radius at each point of the path. The last is the top of the dome. */
    readonly radii: readonly number[]
    /** Corners round each ring. */
    readonly around: number
}

/**
 * How finely a stem is drawn, so its faces follow the share of detail asked for.
 *
 * Sides come in whole numbers per ridge, so the rings make up the rest: `rings`
 * scales how many there are.
 */
function resolution(radius: number, ribs: number, detail: number, lowPoly: boolean): {around: number; rings: number} {
    if (lowPoly) {
        const rings = LOW_POLY_RINGS * Math.sqrt(detail)

        // A ridge and a valley each, until far off, where the ridges are only corners.
        return ribs < 3 ? {around: Math.max(Math.round(8 * Math.sqrt(detail)), 5), rings} : {around: ridgesOf(ribs, true) * (detail >= 0.3 ? 2 : 1), rings}
    }

    if (ribs < 3) {
        return {around: Math.max(Math.round(14 * Math.sqrt(detail)), 6), rings: Math.sqrt(detail)}
    }

    // Only a thick stem's ridges are big enough to need more than a sharp fold each.
    const full = radius > 0.25 ? 4 : 2
    const perRidge = detail >= 0.3 ? full : detail >= 0.15 ? Math.max(full / 2, 1) : 1

    return {around: ribs * perRidge, rings: Math.min((detail * full) / perRidge, 1)}
}

const ridgesOf = (ribs: number, lowPoly: boolean) => (lowPoly && ribs >= 3 ? Math.min(ribs, LOW_POLY_RIBS) : ribs)

/** Where each ring of a stem sits, its frame carried along so the ridges never twist. */
function frames(path: readonly Vec3[]): {tangent: Vec3; side: Vec3; other: Vec3}[] {
    const result: {tangent: Vec3; side: Vec3; other: Vec3}[] = []
    let side: Vec3 | null = null

    for (let index = 0; index < path.length; index++) {
        const a = path[Math.max(index - 1, 0)]
        const b = path[Math.min(index + 1, path.length - 1)]
        const tangent = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]])

        side = side ? normalize(add(side, tangent, -dot(side, tangent))) : anyPerpendicular(tangent)
        result.push({tangent, side, other: cross(tangent, side)})
    }

    return result
}

/** A ribbed stem, open at its base, which sits in the ground or in another stem. */
function stemMesh(buffers: Buffers, stem: Stem, ribs: number, ribDepth: number): void {
    const {around} = stem
    const rings = frames(stem.path)
    const last = stem.path.length - 1
    const first = buffers.positions.length / 3

    for (let ring = 0; ring < last; ring++) {
        const {side, other} = rings[ring]
        const centre = stem.path[ring]

        for (let step = 0; step < around; step++) {
            const angle = (step / around) * Math.PI * 2
            const ridge = ridgeAt(ribs, angle)
            const radius = stem.radii[ring] * (1 - ribDepth * VALLEY * (1 - ridge))
            const out = add(add([0, 0, 0], side, Math.cos(angle)), other, Math.sin(angle))

            vertex(buffers, add(centre, out, radius), Paint.Skin, ridge)
        }
    }

    const apex = vertex(buffers, stem.path[last], Paint.Skin, 1)

    for (let ring = 0; ring < last - 1; ring++) {
        for (let step = 0; step < around; step++) {
            const next = (step + 1) % around
            const a = first + ring * around + step
            const b = first + ring * around + next
            const c = a + around
            const d = b + around

            buffers.indices.push(a, b, d, a, d, c)
        }
    }

    for (let step = 0; step < around; step++) {
        const top = first + (last - 1) * around

        buffers.indices.push(top + step, top + ((step + 1) % around), apex)
    }
}

/** A small three-sided point, standing out from the surface. */
function spine(buffers: Buffers, at: Vec3, out: Vec3, length: number, random: RandomSource): void {
    const side = anyPerpendicular(out)
    const other = cross(out, side)
    const tilt = add(side, other, randomRange(random, -1, 1))
    const tip = vertex(buffers, add(add(at, out, length * 0.45), normalize(tilt), length * 0.85), Paint.Spine, 1)
    const width = length * 0.16
    const base = [0, 1, 2].map((corner) => {
        const angle = (corner / 3) * Math.PI * 2
        const p = add(add(at, side, Math.cos(angle) * width), other, Math.sin(angle) * width)

        return vertex(buffers, add(p, out, -width), Paint.Spine, 0)
    })

    buffers.indices.push(base[0], base[1], tip, base[1], base[2], tip, base[2], base[0], tip)
}

/** Rows of spines along every ridge, spaced by distance, so they do not follow the rings. */
function stemSpines(buffers: Buffers, stem: Stem, ribs: number, density: number, random: RandomSource): void {
    if (density <= 0) {
        return
    }

    const ringFrames = frames(stem.path)
    const ridges = ribs < 3 ? 8 : ribs
    const spacing = (radius: number) => Math.max(radius, SPINE_SPACING_FLOOR) / (SPINE_ROWS * density)
    let travelled = 0
    let row = 0
    // Half a gap in, so a stem's base gets no row of its own that never thins out.
    let next = spacing(stem.radii[0]) / 2

    for (let ring = 1; ring < stem.path.length - 1; ring++) {
        const a = stem.path[ring - 1]
        const b = stem.path[ring]
        const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])

        while (next <= travelled + length) {
            const share = length > 0 ? (next - travelled) / length : 0
            const radius = stem.radii[ring - 1] + (stem.radii[ring] - stem.radii[ring - 1]) * share

            if (radius < stem.radii[0] * 0.2) {
                return
            }

            const centre = add(a, [b[0] - a[0], b[1] - a[1], b[2] - a[2]], share)
            const from = ringFrames[ring - 1]
            const to = ringFrames[ring]
            const side = normalize(add(from.side, add(to.side, from.side, -1), share))
            const other = normalize(add(from.other, add(to.other, from.other, -1), share))

            // Each row takes every other ridge, as a cactus's spines are staggered.
            for (let ridge = row % 2; ridge < ridges; ridge += 2) {
                const angle = (ridge / ridges) * Math.PI * 2
                const out = add(add([0, 0, 0], side, Math.cos(angle)), other, Math.sin(angle))

                spine(buffers, add(centre, out, radius), out, Math.min(Math.max(radius * 0.16, 0.008), 0.04), random)
            }

            // Never closer than on a stem of a hand's width, or thin stems bristle.
            next += spacing(radius)
            row++
        }

        travelled += length
    }
}

/** A cup of petals facing `up`. */
function flower(buffers: Buffers, at: Vec3, up: Vec3, size: number, petals: number, bothSides: boolean, random: RandomSource): void {
    const side = anyPerpendicular(up)
    const other = cross(up, side)
    const centre = vertex(buffers, add(at, up, size * 0.15), Paint.Petal, 0)
    const ring: number[] = []
    const turn = random() * Math.PI * 2

    for (let point = 0; point < petals * 2; point++) {
        const angle = turn + (point / (petals * 2)) * Math.PI * 2
        const tip = point % 2 === 0
        const reach = tip ? size : size * 0.45
        const around = add(add([0, 0, 0], side, Math.cos(angle)), other, Math.sin(angle))

        ring.push(vertex(buffers, add(add(at, around, reach), up, reach * 0.6), Paint.Petal, tip ? 1 : 0.5))
    }

    for (let point = 0; point < ring.length; point++) {
        buffers.indices.push(centre, ring[point], ring[(point + 1) % ring.length])
    }

    // Up close the cup is seen from below too. The back has corners of its own, lit
    // from its own side, or an export would take it for a copy of the front.
    if (bothSides) {
        const copy = (index: number) => {
            const p: Vec3 = [buffers.positions[index * 3], buffers.positions[index * 3 + 1], buffers.positions[index * 3 + 2]]

            return vertex(buffers, add(p, up, -size * 0.02), Paint.Petal, buffers.shade[index])
        }
        const backCentre = copy(centre)
        const backRing = ring.map(copy)

        for (let point = 0; point < backRing.length; point++) {
            buffers.indices.push(backCentre, backRing[(point + 1) % backRing.length], backRing[point])
        }
    }
}

/** A flat oval pad, standing on its base. */
function pad(
    buffers: Buffers,
    base: Vec3,
    up: Vec3,
    across: Vec3,
    size: {width: number; height: number; depth: number},
    detail: number,
    lowPoly: boolean,
): void {
    const facing = cross(up, across)
    const centre = add(base, up, size.height / 2)
    const rings = lowPoly ? 4 : Math.max(3, Math.ceil(9 * Math.sqrt(detail)))
    const around = lowPoly ? Math.max(5, Math.round(8 * Math.sqrt(detail))) : Math.max(6, Math.round(16 * Math.sqrt(detail)))
    const first = buffers.positions.length / 3
    const bottom = vertex(buffers, add(centre, up, -size.height / 2), Paint.Skin, 0.6)

    for (let ring = 1; ring < rings; ring++) {
        const polar = (ring / rings) * Math.PI
        const along = -Math.cos(polar)
        const width = Math.sin(polar)

        for (let step = 0; step < around; step++) {
            const angle = (step / around) * Math.PI * 2
            const p = add(
                add(add(centre, up, (along * size.height) / 2), across, (Math.cos(angle) * width * size.width) / 2),
                facing,
                (Math.sin(angle) * width * size.depth) / 2,
            )

            // The rim catches light the flat faces do not.
            vertex(buffers, p, Paint.Skin, 0.6 + 0.4 * Math.abs(Math.cos(angle)))
        }
    }

    const top = vertex(buffers, add(centre, up, size.height / 2), Paint.Skin, 1)
    const ringStart = (ring: number) => first + 1 + (ring - 1) * around

    for (let step = 0; step < around; step++) {
        const next = (step + 1) % around

        buffers.indices.push(bottom, ringStart(1) + next, ringStart(1) + step)
        buffers.indices.push(ringStart(rings - 1) + step, ringStart(rings - 1) + next, top)
    }

    for (let ring = 1; ring < rings - 1; ring++) {
        for (let step = 0; step < around; step++) {
            const next = (step + 1) % around
            const a = ringStart(ring) + step
            const b = ringStart(ring) + next

            buffers.indices.push(a, b, b + around, a, b + around, a + around)
        }
    }
}

/** Spines dotted over both faces of a pad. */
function padSpines(
    buffers: Buffers,
    base: Vec3,
    up: Vec3,
    across: Vec3,
    size: {width: number; height: number; depth: number},
    density: number,
    random: RandomSource,
): void {
    const facing = cross(up, across)
    const centre = add(base, up, size.height / 2)
    const count = Math.round(14 * density)

    for (let face = -1; face <= 1; face += 2) {
        for (let index = 0; index < count; index++) {
            // Spread evenly over the oval, so no two bunch up.
            const radius = Math.sqrt((index + 0.5) / count) * 0.85
            const angle = index * GOLDEN + face
            const u = Math.cos(angle) * radius
            const v = Math.sin(angle) * radius
            const bulge = Math.sqrt(Math.max(1 - u * u - v * v, 0))
            const at = add(add(add(centre, across, (u * size.width) / 2), up, (v * size.height) / 2), facing, (face * bulge * size.depth) / 2)
            const out = normalize(add(add(facing, across, u * 0.6 * face), up, v * 0.6 * face))

            spine(buffers, at, face > 0 ? out : ([-out[0], -out[1], -out[2]] as Vec3), Math.min(size.width * 0.07, 0.03), random)
        }
    }
}

/** The centre line of a stem rising from `base`, bending over with `lean`. */
function risingPath(base: Vec3, height: number, along: readonly number[], lean: number, azimuth: number): Vec3[] {
    return along.map((t) => {
        const drift = lean * height * t * t

        return [base[0] + Math.cos(azimuth) * drift, base[1] + height * t, base[2] + Math.sin(azimuth) * drift] as Vec3
    })
}

/** Radii for a stem of even thickness that ends in a round dome. */
function domedRadii(path: readonly Vec3[], radius: number, flare: number): number[] {
    let length = 0
    const lengths = path.map((point, index) => {
        if (index > 0) {
            const before = path[index - 1]

            length += Math.hypot(point[0] - before[0], point[1] - before[1], point[2] - before[2])
        }

        return length
    })

    return lengths.map((at, index) => {
        if (index === path.length - 1) {
            return 0
        }

        const fromTop = length - at
        const dome = fromTop < radius ? Math.sqrt(Math.max(1 - ((radius - fromTop) / radius) ** 2, 0)) : 1

        return radius * (1 + flare * (1 - at / length) ** 3) * Math.max(dome, 0.05)
    })
}

/**
 * Where the rings of a stem sit, 0 at the base to 1 at the top. A straight stem
 * needs few, and the dome many, so they are spaced out below it and close in it.
 */
function ringsFor(length: number, radius: number, scale: number): number[] {
    const domeStart = Math.max(length - radius, 0)
    // A thin stem is as straight as a thick one, so needs no more rings.
    const body = Math.min(Math.max(Math.round((domeStart / Math.max(radius, 0.2)) * 0.35 * scale), 1), 12)
    // Far off, a dome can be a point.
    const dome = Math.max(scale < 0.3 ? 1 : 2, Math.round(6 * scale))
    const rings = Array.from({length: body + 1}, (_, ring) => ((ring / body) * domeStart) / length)

    for (let ring = 1; ring <= dome; ring++) {
        rings.push((domeStart + (length - domeStart) * Math.sin(((ring / dome) * Math.PI) / 2)) / length)
    }

    return rings
}

/** Where a rising path is at a height, between its points, so it is the same at any detail. */
function pointAtHeight(path: readonly Vec3[], y: number): Vec3 {
    for (let index = 1; index < path.length; index++) {
        const a = path[index - 1]
        const b = path[index]

        if (b[1] >= y) {
            const share = b[1] - a[1] > 1e-9 ? (y - a[1]) / (b[1] - a[1]) : 0

            return add(a, [b[0] - a[0], b[1] - a[1], b[2] - a[2]], share)
        }
    }

    return path[path.length - 1]
}

/** Which arms have fallen, picked by the seed, so more fallen arms only adds to them. */
function fallenArmsOf(arms: number, count: number, seed: number): ReadonlySet<number> {
    const random = createSeededRandom(hashSeed(seed, SEED_FALLEN))
    const order = Array.from({length: arms}, (_, arm) => ({arm, key: random()})).sort((a, b) => a.key - b.key)

    return new Set(order.slice(0, Math.min(count, arms)).map(({arm}) => arm))
}

/** An arm that fell, laid on the ground beside the stem, its broken end closed. */
function lyingArm(path: readonly Vec3[], armRadius: number, outward: Vec3, stemRadius: number, around: number, random: () => number): Stem {
    const start = path[0]
    const end = path[path.length - 1]
    const along = normalize([end[0] - start[0], end[1] - start[1], end[2] - start[2]])
    // Lying across from the stem rather than straight out, so it doesn't read as one bent shape.
    const swing = (random() < 0.5 ? -1 : 1) * randomRange(random, 0.9, 1.4)
    const target = normalize([outward[0] * Math.cos(swing) - outward[2] * Math.sin(swing), 0, outward[2] * Math.cos(swing) + outward[0] * Math.sin(swing)])
    // Turned about the axis between where it pointed and where it lies.
    const axis = normalize([along[1] * target[2] - along[2] * target[1], along[2] * target[0] - along[0] * target[2], along[0] * target[1] - along[1] * target[0]])
    const angle = Math.acos(Math.min(Math.max(along[0] * target[0] + along[1] * target[1] + along[2] * target[2], -1), 1))
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const turn = (v: Vec3): Vec3 => {
        const k = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2]
        const c: Vec3 = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]]

        return [v[0] * cos + c[0] * sin + axis[0] * k * (1 - cos), v[1] * cos + c[1] * sin + axis[1] * k * (1 - cos), v[2] * cos + c[2] * sin + axis[2] * k * (1 - cos)]
    }
    const turned = path.map((point) => turn([point[0] - start[0], point[1] - start[1], point[2] - start[2]]))
    const lowest = Math.min(...turned.map((point) => point[1]))
    const away = stemRadius + armRadius * randomRange(random, 2.5, 4)
    const laid = turned.map((point): Vec3 => [point[0] + outward[0] * away, point[1] - lowest + armRadius * 0.85, point[2] + outward[2] * away])
    // Closed where it broke: a point just behind the first ring.
    const back: Vec3 = [laid[0][0] - target[0] * armRadius * 0.35, laid[0][1], laid[0][2] - target[2] * armRadius * 0.35]
    const lying = [back, ...laid]
    const radii = domedRadii(lying, armRadius, 0)

    // Nearly closed: a ring of nothing would leave faces with no area.
    radii[0] = armRadius * 0.05

    return {path: lying, radii, around}
}

function columnStems(parameters: CactusParameters, seed: number, detail: number, lowPoly: boolean): {stems: Stem[]; tops: {at: Vec3; up: Vec3}[]} {
    const {height, thickness, lean} = parameters
    const radius = thickness / 2
    const leanRandom = createSeededRandom(hashSeed(seed, SEED_LEAN))
    const leanAzimuth = leanRandom() * Math.PI * 2
    const ribs = Math.round(parameters.ribs)
    const trunk = resolution(radius, ribs, detail, lowPoly)
    const trunkPath = risingPath([0, -radius * 0.3, 0], height + radius * 0.3, ringsFor(height + radius * 0.3, radius, trunk.rings), lean, leanAzimuth)
    const stems: Stem[] = [{path: trunkPath, radii: domedRadii(trunkPath, radius, 0.12), around: trunk.around}]
    const tops = [{at: trunkPath[trunkPath.length - 1], up: [0, 1, 0] as Vec3}]
    const arms = Math.round(parameters.arms)
    const armRadius = radius * 0.72
    const armDetail = resolution(armRadius, ribs, detail, lowPoly)
    const fallen = fallenArmsOf(arms, Math.round(parameters.fallenArms ?? 0), seed)

    for (let arm = 0; arm < arms; arm++) {
        const random = createSeededRandom(hashSeed(seed, SEED_ARMS, arm))
        // Spaced by the golden ratio, not by the count, so adding an arm leaves the others where they were.
        const share = (arm * 0.618034) % 1
        // Spread up the stem in step with Arm height, so low arms all rise from near the ground.
        const leave = height * Math.min(parameters.armHeight * (1 + share * 0.5 * randomRange(random, 0.6, 1)), 0.85)
        const from = pointAtHeight(trunkPath, leave)
        const azimuth = arm * GOLDEN + randomRange(random, -0.35, 0.35)
        const outward: Vec3 = [Math.cos(azimuth), 0, Math.sin(azimuth)]
        // Out from the stem, round a bend, then up.
        const reach = radius + armRadius * randomRange(random, 2, 3)
        const bend = armRadius * 1.6
        // The lower an arm leaves, the nearer the top it climbs.
        const climb = 0.35 + 0.45 * (1 - parameters.armHeight / 0.8)
        // Never above the stem's own top, and an arm with no room to rise is left off.
        const room = height * 0.95 - from[1] - bend
        const rise = Math.min(Math.max((height - leave) * randomRange(random, climb, Math.min(climb + 0.25, 0.98)), armRadius * 3), room)

        if (rise < armRadius * 1.2) {
            continue
        }

        const path: Vec3[] = []
        const outSteps = Math.max(1, Math.round(3 * armDetail.rings))
        const bendSteps = Math.max(1, Math.round(6 * armDetail.rings))

        for (let step = 0; step <= outSteps; step++) {
            path.push(add(from, outward, ((reach - bend) * step) / outSteps))
        }

        const corner = add(add(from, outward, reach - bend), [0, 1, 0], bend)

        for (let step = 1; step <= bendSteps; step++) {
            const angle = (step / bendSteps) * (Math.PI / 2)

            path.push(add(add(corner, outward, Math.sin(angle) * bend), [0, 1, 0], -Math.cos(angle) * bend))
        }

        const elbow = path[path.length - 1]
        const upright = risingPath(elbow, rise, ringsFor(rise, armRadius, armDetail.rings), lean * 0.5, leanAzimuth).slice(1)

        path.push(...upright)

        if (fallen.has(arm)) {
            // A short stub where it broke off, and the arm itself lying at the foot.
            const stub = path.slice(0, Math.min(outSteps, 2) + 1)

            stems.push({path: stub, radii: domedRadii(stub, armRadius, 0), around: armDetail.around})
            stems.push(lyingArm(path.slice(outSteps + bendSteps), armRadius, outward, radius, armDetail.around, createSeededRandom(hashSeed(seed, SEED_FALLEN, arm))))
            continue
        }

        stems.push({path, radii: domedRadii(path, armRadius, 0), around: armDetail.around})
        tops.push({at: path[path.length - 1], up: [0, 1, 0]})
    }

    return {stems, tops}
}

function barrelStem(parameters: CactusParameters, detail: number, lowPoly: boolean): Stem {
    const {height, thickness} = parameters
    const radius = thickness / 2
    const {around, rings} = resolution(radius, Math.round(parameters.ribs), detail, lowPoly)
    const steps = Math.max(4, Math.round(16 * rings))
    const path = risingPath([0, -height * 0.05, 0], height * 1.05, Array.from({length: steps + 1}, (_, step) => step / steps), parameters.lean * 0.3, 0)
    // Widest a little below the middle, and closing over a flattish top.
    const radii = path.map((_, step) => {
        const t = step / steps

        return step === steps ? 0 : radius * Math.sqrt(Math.max(1 - ((t - 0.4) / 0.6) ** 2, 0.0025))
    })

    return {path, radii, around}
}

interface Pad {
    readonly base: Vec3
    readonly up: Vec3
    readonly across: Vec3
    readonly size: {width: number; height: number; depth: number}
}

/** Pads grow from the rims of others, each a little smaller, never above Height. */
function growPads(parameters: CactusParameters, seed: number): Pad[] {
    const random = createSeededRandom(hashSeed(seed, SEED_PADS))
    const width = parameters.thickness * 1.6
    const first: Pad = {
        base: [0, -width * 0.1, 0],
        up: normalize([randomRange(random, -0.15, 0.15), 1, randomRange(random, -0.15, 0.15)]),
        across: [Math.cos(random() * Math.PI), 0, Math.sin(random() * Math.PI)],
        size: {width, height: width * 1.35, depth: width * 0.17},
    }
    const pads: Pad[] = [first]
    const count = Math.round(parameters.pads)

    for (let tries = 0; pads.length < count && tries < count * 8; tries++) {
        // Newer pads are likelier to grow on, so the plant branches outward.
        const parent = pads[Math.min(Math.floor(Math.sqrt(random()) * pads.length), pads.length - 1)]
        const along = randomRange(random, -1, 1)
        const angle = along * 1.1
        const rim = add(
            add(parent.base, parent.up, parent.size.height / 2 + (Math.cos(angle) * parent.size.height) / 2),
            parent.across,
            (Math.sin(angle) * parent.size.width) / 2,
        )
        const scale = randomRange(random, 0.78, 0.98)
        const tilt = angle * 0.7 + randomRange(random, -0.3, 0.3)
        const up = normalize(add(add(parent.up, parent.across, Math.tan(tilt) * 1.3), [0, 1, 0], 0.15))
        const spin = randomRange(random, -0.9, 0.9)
        const flat = normalize(add(parent.across, cross(up, parent.across), Math.tan(spin)))
        const across = normalize(add(flat, up, -dot(flat, up)))
        const size = {width: parent.size.width * scale, height: parent.size.height * scale, depth: parent.size.depth * scale}
        const base = add(rim, up, -size.height * 0.12)
        // The highest point of the oval, however it is tilted.
        const facing = cross(up, across)
        const top =
            base[1] +
            (up[1] * size.height) / 2 +
            Math.hypot((up[1] * size.height) / 2, (across[1] * size.width) / 2, (facing[1] * size.depth) / 2)

        if (top > parameters.height || up[1] < 0.2) {
            continue
        }

        pads.push({base, up, across, size})
    }

    return pads
}

export function buildCactusMesh(parameters: CactusParameters, seed: number, detail = 1): THREE.BufferGeometry {
    const buffers: Buffers = {positions: [], indices: [], paint: [], shade: []}
    const spineRandom = createSeededRandom(hashSeed(seed, SEED_SPINES))
    const flowerRandom = createSeededRandom(hashSeed(seed, SEED_FLOWERS))
    const lowPoly = parameters.build === 'low-poly'
    const ribs = ridgesOf(Math.round(parameters.ribs), lowPoly)
    const spines = parameters.spines * detail * (lowPoly ? LOW_POLY_SPINES : 1)
    const flowers = Math.round(parameters.flowers)
    let tops: {at: Vec3; up: Vec3}[]

    if (parameters.kind === 'paddle') {
        const pads = growPads(parameters, seed)

        for (const each of pads) {
            pad(buffers, each.base, each.up, each.across, each.size, detail, lowPoly)
            padSpines(buffers, each.base, each.up, each.across, each.size, spines, spineRandom)
        }

        // Flowers sit on the rims of the outermost pads.
        tops = pads
            .slice()
            .reverse()
            .map((each) => ({at: add(each.base, each.up, each.size.height * 0.97), up: each.up}))
    } else {
        const {stems, tops: stemTops} =
            parameters.kind === 'column'
                ? columnStems(parameters, seed, detail, lowPoly)
                : {stems: [barrelStem(parameters, detail, lowPoly)], tops: [] as {at: Vec3; up: Vec3}[]}
        for (const stem of stems) {
            stemMesh(buffers, stem, ribs, parameters.ribDepth)
            stemSpines(buffers, stem, ribs, spines, spineRandom)
        }

        tops = stemTops

        if (parameters.kind === 'barrel') {
            // A ring of flowers round the crown.
            const top = parameters.height
            const ring = (parameters.thickness / 2) * 0.45

            tops = Array.from({length: flowers}, (_, index) => {
                const angle = (index / Math.max(flowers, 1)) * Math.PI * 2
                const out: Vec3 = [Math.cos(angle), 0, Math.sin(angle)]

                return {at: add([0, top * 0.97, 0], out, ring), up: normalize(add([0, 1, 0], out, 0.6))}
            })
        }
    }

    const flowerSize = Math.min(Math.max(parameters.thickness * 0.22, 0.03), 0.12)

    for (let index = 0; index < Math.min(flowers, tops.length * 3); index++) {
        const top = tops[index % tops.length]
        const round = Math.floor(index / tops.length)
        // More than one on a top crowd round it.
        const angle = round * 2.1 + flowerRandom() * 0.6
        const side = anyPerpendicular(top.up)
        const offset = add(add([0, 0, 0], side, Math.cos(angle)), cross(top.up, side), Math.sin(angle))

        flower(buffers, add(top.at, offset, round === 0 ? 0 : flowerSize * 0.9), top.up, flowerSize, detail < 0.3 ? FAR_PETALS : lowPoly ? LOW_POLY_PETALS : FLOWER_PETALS, detail >= 0.3, flowerRandom)
    }

    return lowPoly ? paintFacets(buffers, parameters) : paintCactus(buffers, parameters)
}

/** How a point is coloured, from what it is, which way it faces, its shade and its height. */
function painter(parameters: CactusParameters): (paint: Paint, n: Vec3, shade: number, y: number) => THREE.Color {
    const ramp = rampOf(parameters.palette, CACTUS_RAMPS, parameters, CACTUS_ROWS)
    const skin = colourRamp(ramp.slice(0, 4))
    const petal = colourRamp(rampOf(parameters.flowerColour, PETAL_RAMPS, parameters, FLOWER_ROWS))
    const spineColour = new THREE.Color(ramp[4])
    const colour = new THREE.Color()
    const top = Math.max(parameters.height, 0.01)

    return (paint, n, shade, y) => {
        const light = Math.min(Math.max(0.5 + 0.5 * dot(n, SUN), 0), 1)

        if (paint === Paint.Spine) {
            return colour.copy(spineColour).multiplyScalar(0.7 + 0.3 * shade)
        }

        if (paint === Paint.Petal) {
            return colour.copy(petal(0.25 + 0.75 * shade * (0.6 + 0.4 * light)))
        }

        const height = Math.min(Math.max(y / top, 0), 1)

        return colour.copy(skin(0.08 + 0.55 * light + 0.22 * shade + 0.12 * height))
    }
}

function paintCactus(buffers: Buffers, parameters: CactusParameters): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3))
    geometry.setIndex(buffers.indices)
    geometry.computeVertexNormals()

    const normals = geometry.getAttribute('normal')
    const colours = new Float32Array(buffers.positions.length)
    const paint = painter(parameters)

    for (let index = 0; index < buffers.paint.length; index++) {
        const n: Vec3 = [normals.getX(index), normals.getY(index), normals.getZ(index)]
        const colour = paint(buffers.paint[index], n, buffers.shade[index], buffers.positions[index * 3 + 1])

        colours[index * 3] = colour.r
        colours[index * 3 + 1] = colour.g
        colours[index * 3 + 2] = colour.b
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
    geometry.computeBoundingSphere()

    return geometry
}

/** Every face apart, with one facing and one colour of its own. */
function paintFacets(buffers: Buffers, parameters: CactusParameters): THREE.BufferGeometry {
    const count = buffers.indices.length
    const positions = new Float32Array(count * 3)
    const normals = new Float32Array(count * 3)
    const colours = new Float32Array(count * 3)
    const paint = painter(parameters)
    const at = (index: number): Vec3 => [buffers.positions[index * 3], buffers.positions[index * 3 + 1], buffers.positions[index * 3 + 2]]

    for (let face = 0; face < count; face += 3) {
        const corners = [buffers.indices[face], buffers.indices[face + 1], buffers.indices[face + 2]]
        const points = corners.map(at)
        const [a, b, c] = points
        const n = normalize(cross(add(b, a, -1), add(c, a, -1)))
        const shade = corners.reduce((sum, index) => sum + buffers.shade[index], 0) / 3
        const colour = paint(buffers.paint[corners[0]], n, shade, (a[1] + b[1] + c[1]) / 3)

        points.forEach((p, k) => {
            positions.set(p, (face + k) * 3)
            normals.set(n, (face + k) * 3)
            colours.set([colour.r, colour.g, colour.b], (face + k) * 3)
        })
    }

    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
    geometry.computeBoundingSphere()

    return geometry
}
