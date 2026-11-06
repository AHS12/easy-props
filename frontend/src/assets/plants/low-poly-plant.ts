/**
 * Low-poly flowers: the same stems, leaves and heads as solid faceted shapes, each
 * face one flat colour.
 *
 * Stems are three-sided, leaves are folded along the middle, a daisy is a star of
 * flat petals round a faceted middle, a cup is a closed tulip, and a spike or plume
 * is a faceted spindle up the end of its stem.
 */

import * as THREE from 'three'
import {createSeededRandom, hashSeed, randomRange, type RandomSource} from '../shared/random'
import {FLOWER_ROWS, rampOf} from '../style/own-colours'
import {FLOWER_CENTRE, PETAL_RAMPS, STEM_RAMP} from '../style/palettes'
import {colourRamp} from '../style/ramp'
import {plantAtDetail, PLUME_SHARE, SPIKE_SHARE, STEM_WIDTH, stemPath, type PlantParameters, type StemPath, type Vec3} from './plant-mesh'

const STEM_SIDES = 3
const STEM_STOPS: readonly number[] = [0, 0.55, 1]
/** Three sides look thinner than a flat strip, so the stem is drawn wider to read as well. */
const STEM_THICKER = 1.8
const DAISY_PETALS = 8
const CUP_SIDES = 5
const SPINDLE_SIDES = 5
/** How far one face's colour strays from the next, so neighbouring facets read apart. */
const FACE_JITTER = 0.06
/** A folded leaf's edges stand up by this share of its half width. */
const LEAF_FOLD = 0.45

type Faces = {positions: number[]; normals: number[]; colors: number[]}
type Paint = (value: number) => THREE.Color

const add = (a: Vec3, b: Vec3, t = 1): Vec3 => [a[0] + b[0] * t, a[1] + b[1] * t, a[2] + b[2] * t]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

const normalize = (a: Vec3): Vec3 => {
    const length = Math.hypot(a[0], a[1], a[2]) || 1

    return [a[0] / length, a[1] / length, a[2] / length]
}

function pushFace(out: Faces, a: Vec3, b: Vec3, c: Vec3, colour: THREE.Color, facing?: Vec3) {
    const n = facing ?? normalize(cross(sub(b, a), sub(c, a)))

    for (const p of [a, b, c]) {
        out.positions.push(p[0], p[1], p[2])
        out.normals.push(n[0], n[1], n[2])
        out.colors.push(colour.r, colour.g, colour.b)
    }
}

/** A face of a closed shape, turned to face away from `inside`. */
function pushOutward(out: Faces, a: Vec3, b: Vec3, c: Vec3, inside: Vec3, colour: THREE.Color) {
    const middle: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
    const facing = dot(cross(sub(b, a), sub(c, a)), sub(middle, inside))

    if (facing >= 0) {
        pushFace(out, a, b, c, colour)
    } else {
        pushFace(out, a, c, b, colour)
    }
}

/**
 * A thin face seen from both sides. Both sides take the facing that looks up, as
 * the normal plant's do, or a petal seen from below would turn dark.
 */
function pushBothSides(out: Faces, a: Vec3, b: Vec3, c: Vec3, colour: THREE.Color) {
    const n = normalize(cross(sub(b, a), sub(c, a)))
    const up: Vec3 = n[1] < 0 ? [-n[0], -n[1], -n[2]] : n

    pushFace(out, a, b, c, colour, up)
    pushFace(out, a, c, b, colour, up)
}

/** Square to `axis`, turned to follow `side` when given, so rings up one stem don't twist. */
function frameOf(axis: Vec3, side?: Vec3): {u: Vec3; v: Vec3} {
    const u = side ? normalize(add(side, axis, -dot(side, axis))) : normalize(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))

    return {u, v: cross(axis, u)}
}

function ringAround(centre: Vec3, axis: Vec3, radius: number, sides: number, turn: number, side?: Vec3): Vec3[] {
    const {u, v} = frameOf(axis, side)

    return Array.from({length: sides}, (_, k) => {
        const angle = turn + (k / sides) * Math.PI * 2

        return add(add(centre, u, Math.cos(angle) * radius), v, Math.sin(angle) * radius)
    })
}

const jitter = (random: RandomSource) => randomRange(random, -FACE_JITTER, FACE_JITTER)

const centreOf = (ring: readonly Vec3[]) => ring.reduce((sum, p) => add(sum, p, 1 / ring.length), [0, 0, 0] as Vec3)
const halfway = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]

/** Rings joined into a spindle, from a point at `from` to a point at `to`, or left open. */
function addSpindle(out: Faces, from: Vec3, rings: readonly Vec3[][], to: Vec3 | null, colourOf: (band: number) => THREE.Color) {
    const first = rings[0]

    first.forEach((p, k) => pushOutward(out, from, p, first[(k + 1) % first.length], halfway(from, centreOf(first)), colourOf(0)))

    for (let band = 0; band + 1 < rings.length; band++) {
        const low = rings[band]
        const high = rings[band + 1]
        const centre = halfway(centreOf(low), centreOf(high))

        for (let k = 0; k < low.length; k++) {
            const next = (k + 1) % low.length

            pushOutward(out, low[k], low[next], high[k], centre, colourOf(band + 1))
            pushOutward(out, low[next], high[next], high[k], centre, colourOf(band + 1))
        }
    }

    const last = rings[rings.length - 1]

    if (to) {
        last.forEach((p, k) => pushOutward(out, p, last[(k + 1) % last.length], to, halfway(centreOf(last), to), colourOf(rings.length)))
    }
}

function addStem(out: Faces, path: StemPath, width: number, paint: Paint, random: RandomSource) {
    const rings = STEM_STOPS.map((t) => ringAround(path.point(t), path.tangent(t), (width / 2) * (1 - 0.4 * t), STEM_SIDES, 0, path.side))

    for (let band = 0; band + 1 < rings.length; band++) {
        const centre = path.point((STEM_STOPS[band] + STEM_STOPS[band + 1]) / 2)

        for (let k = 0; k < STEM_SIDES; k++) {
            const next = (k + 1) % STEM_SIDES
            const colour = paint(0.2 + STEM_STOPS[band] * 0.5 + jitter(random))

            pushOutward(out, rings[band][k], rings[band][next], rings[band + 1][k], centre, colour)
            pushOutward(out, rings[band][next], rings[band + 1][next], rings[band + 1][k], centre, colour)
        }
    }
}

/** A diamond folded along its middle, its two halves a shade apart. */
function addLeaf(out: Faces, path: StemPath, width: number, paint: Paint, random: RandomSource) {
    const base = path.point(0)
    const tip = path.point(1)
    const middle = path.point(0.4)
    const up = normalize(cross(sub(tip, base), path.side))
    const lift = (width / 2) * LEAF_FOLD * (up[1] < 0 ? -1 : 1)
    const left = add(add(middle, path.side, width / 2), up, lift)
    const right = add(add(middle, path.side, -width / 2), up, lift)
    const value = 0.35 + random() * 0.45

    pushBothSides(out, base, left, tip, paint(value))
    pushBothSides(out, base, tip, right, paint(value - 0.12))
}

function addDaisy(out: Faces, tip: Vec3, axis: Vec3, across: number, paint: Paint, random: RandomSource) {
    const radius = across / 2
    const turn = random() * Math.PI * 2
    const {u, v} = frameOf(axis)

    for (let i = 0; i < DAISY_PETALS; i++) {
        const angle = turn + (i / DAISY_PETALS) * Math.PI * 2
        const outward: Vec3 = add([u[0] * Math.cos(angle), u[1] * Math.cos(angle), u[2] * Math.cos(angle)], v, Math.sin(angle))
        const side = cross(axis, outward)
        const half = (radius * Math.PI * 0.62) / DAISY_PETALS
        const base = add(tip, outward, radius * 0.15)
        const end = add(add(tip, outward, radius), axis, -radius * 0.12)
        const colour = paint(0.55 + random() * 0.45)

        pushBothSides(out, add(base, side, half), add(base, side, -half), end, i % 2 === 0 ? colour : colour.clone().multiplyScalar(0.88))
    }

    const centre = new THREE.Color(FLOWER_CENTRE)
    const ring = ringAround(add(tip, axis, radius * 0.03), axis, radius * 0.28, 5, turn)
    const top = add(tip, axis, radius * 0.17)
    const bottom = add(tip, axis, -radius * 0.06)

    addSpindle(out, bottom, [ring], top, (band) => (band === 0 ? centre.clone().multiplyScalar(0.7) : centre))
}

/** A closed tulip: swelling from the stem, then rising to petal tips round a dip. */
function addCup(out: Faces, tip: Vec3, axis: Vec3, across: number, paint: Paint, random: RandomSource) {
    const radius = across / 2
    const tall = across * 1.5
    const turn = random() * Math.PI * 2
    const swell = ringAround(add(tip, axis, tall * 0.35), axis, radius * 0.95, CUP_SIDES, turn)
    const tips = ringAround(add(tip, axis, tall), axis, radius * 0.55, CUP_SIDES, turn + Math.PI / CUP_SIDES)
    const dip = add(tip, axis, tall * 0.72)
    const shades = Array.from({length: CUP_SIDES * 2}, () => paint(0.6 + random() * 0.35))
    let face = 0

    addSpindle(out, tip, [swell, tips], null, (band) => (band === 0 ? paint(0.15) : shades[face++ % shades.length]))

    // The dip sinks below the petal tips, so its faces look up out of the cup.
    tips.forEach((p, k) => {
        const next = tips[(k + 1) % CUP_SIDES]
        const upward = dot(cross(sub(next, p), sub(dip, p)), axis) >= 0

        pushFace(out, p, upward ? next : dip, upward ? dip : next, paint(0.3))
    })
}

/** A spindle up the last `share` of the stem, `radius(s)` wide at `s` of the way up it. */
function addHeadSpindle(out: Faces, path: StemPath, share: number, stops: readonly number[], radius: (s: number) => number, reach: number, paint: Paint, random: RandomSource) {
    const at = (s: number) => 1 - share * (1 - s)
    const rings = stops.map((s, i) => ringAround(path.point(at(s)), path.tangent(at(s)), radius(s), SPINDLE_SIDES, (i * Math.PI) / SPINDLE_SIDES, path.side))
    const from = path.point(at(0))
    const to = add(path.point(1), path.tangent(1), reach)

    addSpindle(out, from, rings, to, (band) => paint(0.2 + (band / (stops.length + 1)) * 0.7 + jitter(random)))
}

export function buildLowPolyPlantMesh(plant: PlantParameters, seed: number, detail: number): THREE.BufferGeometry {
    return plantAtDetail(plant, seed, detail, (stems, growth) => {
        const petal = colourRamp(rampOf(plant.palette, PETAL_RAMPS, plant, FLOWER_ROWS))
        const green = colourRamp(STEM_RAMP)
        const faces: Faces = {positions: [], normals: [], colors: []}
        const head = plant.headSize * growth

        for (const stem of stems) {
            // The same draws, in the same order, as the normal plant, so it stands the same way.
            const random = createSeededRandom(hashSeed(stem.seed, 1))
            const shade = createSeededRandom(hashSeed(stem.seed, 2))
            const path = stemPath(stem.x, stem.z, stem.facing, stem.height, stem.lean)
            const stemWidth = STEM_WIDTH * (1 + plant.height) * growth

            addStem(faces, path, stemWidth * STEM_THICKER, green, shade)

            for (let leaf = 0; leaf < Math.round(plant.leaves); leaf++) {
                const leafPath = stemPath(
                    stem.x,
                    stem.z,
                    stem.facing + randomRange(random, -3, 3),
                    stem.height * randomRange(random, 0.3, 0.55),
                    randomRange(random, 0.5, 1),
                )

                addLeaf(faces, leafPath, plant.headSize * 0.45 * growth + stemWidth, green, shade)
            }

            const tip = path.point(1)
            const axis = path.tangent(1)

            switch (plant.kind) {
                case 'daisy':
                    addDaisy(faces, tip, axis, head, petal, random)
                    break
                case 'cup':
                    addCup(faces, tip, axis, head, petal, random)
                    break
                case 'spike':
                    addHeadSpindle(faces, path, SPIKE_SHARE, [0.05, 0.4, 0.75], (s) => head * 0.17 * (1.1 - s * 0.75), head * 0.08, petal, random)
                    break
                case 'plume': {
                    const fullness = (s: number) => Math.sin(Math.min(1, s * 1.1 + 0.08) * Math.PI) ** 0.7

                    addHeadSpindle(faces, path, PLUME_SHARE, [0.15, 0.45, 0.75], (s) => head * (0.14 + 0.28 * fullness(s)) * 0.45, head * 0.22, petal, random)
                    break
                }
            }
        }

        const geometry = new THREE.BufferGeometry()

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(faces.positions, 3))
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(faces.normals, 3))
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(faces.colors, 3))

        return geometry
    })
}
