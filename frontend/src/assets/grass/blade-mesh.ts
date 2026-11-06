/**
 * Grass: blades grouped into clumps.
 *
 * A blade is a curve from root to tip, narrowing to a point. Blades belong to
 * whichever clump centre is nearest, and a clump shares a height and a direction:
 * that is what looks combed by wind, where each blade on its own would only look
 * like noise. Height falls away towards the rim, so patches placed side by side
 * have no visible edge.
 *
 * Shading normals point mostly at the sky. A blade's true normal would flicker
 * between light and dark on a strip this thin, and this way a patch takes the
 * light as one soft surface. There is no texture and no cut-out: blades are solid
 * shapes, so they cost no overdraw.
 */

import * as THREE from 'three'
import {addDaisy, addStrip, stemPath} from '../plants/plant-mesh'
import {createSeededRandom, hashSeed, randomRange} from '../shared/random'
import {colourRamp} from '../style/ramp'
import {FLOWER_ROWS, GRASS_ROWS, rampOf, type OwnColourValues, type OwnColours} from '../style/own-colours'
import {DRY_RAMP, GRASS_RAMPS, PETAL_RAMPS, STEM_RAMP, type GrassPaletteId, type PetalPaletteId} from '../style/palettes'

export type GrassBuild = 'painted' | 'low-poly'

export interface GrassParameters extends Partial<OwnColourValues<typeof GRASS_ROWS> & OwnColourValues<typeof FLOWER_ROWS>> {
    readonly width: number
    readonly height: number
    readonly blades: number
    readonly clumps: number
    /** How far blades gather at the middle of their clump, 0 to 1. */
    readonly gather: number
    /** How far blades bend over, 0 to 1. */
    readonly lean: number
    /** How far blades turn from their clump's direction, 0 to 1. */
    readonly scatter: number
    /** In metres, at its widest. */
    readonly bladeWidth: number
    /** How many pieces a blade's curve is made of. */
    readonly smoothness: number
    /** The share of blades that stand out, taller and wider, 0 to 1. */
    readonly tall: number
    /** The share of clumps gone dry, 0 to 1. */
    readonly dryness: number
    /** How far one clump's colour strays from the next, 0 to 1. */
    readonly variation: number
    readonly palette: GrassPaletteId | OwnColours
    /** Flowers standing among the blades, in drifts. */
    readonly flowers: number
    readonly flowerColour: PetalPaletteId | OwnColours
    readonly build: GrassBuild
}

interface Clump {
    readonly x: number
    readonly z: number
    readonly direction: number
    readonly height: number
    readonly hue: number
    readonly dry: boolean
}

export interface Blade {
    readonly x: number
    readonly z: number
    readonly facing: number
    readonly height: number
    readonly width: number
    readonly lean: number
    readonly clump: Clump
    /** A lighter level keeps the lowest numbers. */
    readonly priority: number
}

const SEED_CLUMPS = 51
const SEED_BLADE = 1000
const SEED_FLOWER = 60000
const FLOWER_PETALS = 6
const FLOWER_ACROSS = 0.06
export const FLOWER_STEM = 0.007
const FLOWER_STEM_PIECES = 2
/** How tall a blade stands near the rim, at the very least. */
const RIM_HEIGHT = 0.4
const TALL_HEIGHT = 1.45
const TALL_WIDTH = 1.7
/** How much of a lean takes height off the tip. */
const LEAN_DROP = 0.35
const REACH_AT_MIDDLE = 0.25
const CURVE_AT_MIDDLE = 0.62
/** Above 1, pieces of a curve are shorter near the tip, where it bends most. */
const TIP_CROWDING = 1.3
const TAPER = 1.6
const BASE_NARROWING = 0.25
const NORMAL_OWN_SHARE = 0.3
const NORMAL_ROUNDING = 0.25
const TIP_VALUE = 0.82
const CLUMP_VALUE = 0.2
const BLADE_VALUE = 0.04
/** Below this share of its detail, a blade is one piece shorter. */
const FEWER_PIECES_BELOW = 0.25
const MIN_PIECES = 2
/** The most a blade may widen to cover for the ones a lighter level leaves out. */
const MAX_WIDENING = 2.5

export const tipHeight = (blade: Pick<Blade, 'height' | 'lean'>) => blade.height * (1 - LEAN_DROP * blade.lean)

const tipOf = (blade: Blade) => ({
    x: blade.x + Math.cos(blade.facing) * blade.lean * blade.height,
    z: blade.z + Math.sin(blade.facing) * blade.lean * blade.height,
})

/** Every blade, with the same numbers at any detail. Each has its own stream, so one more adds one. */
export function planGrass(grass: GrassParameters, seed: number): readonly Blade[] {
    const radius = grass.width / 2
    const clumpRandom = createSeededRandom(hashSeed(seed, SEED_CLUMPS))
    const clumps: Clump[] = Array.from({length: Math.max(1, Math.round(grass.clumps))}, () => {
        const azimuth = clumpRandom() * Math.PI * 2
        const out = Math.sqrt(clumpRandom()) * radius

        return {
            x: Math.cos(azimuth) * out,
            z: Math.sin(azimuth) * out,
            direction: clumpRandom() * Math.PI * 2,
            height: randomRange(clumpRandom, 0.72, 1.25),
            hue: clumpRandom(),
            dry: clumpRandom() < grass.dryness,
        }
    })

    const blades = Array.from({length: Math.max(1, Math.round(grass.blades))}, (_, index): Blade => {
        const random = createSeededRandom(hashSeed(seed, SEED_BLADE + index))
        const azimuth = random() * Math.PI * 2
        const out = Math.sqrt(random())
        const x = Math.cos(azimuth) * out * radius
        const z = Math.sin(azimuth) * out * radius
        let clump = clumps[0]
        let nearest = Infinity

        for (const candidate of clumps) {
            const distance = Math.hypot(x - candidate.x, z - candidate.z)

            if (distance < nearest) {
                nearest = distance
                clump = candidate
            }
        }

        const stands = random() < grass.tall
        const rim = RIM_HEIGHT + (1 - RIM_HEIGHT) * (1 - out ** 3)

        return {
            x: x + (clump.x - x) * grass.gather,
            z: z + (clump.z - z) * grass.gather,
            facing: clump.direction + randomRange(random, -Math.PI, Math.PI) * grass.scatter,
            height: clump.height * randomRange(random, 0.6, 1.1) * rim * (stands ? TALL_HEIGHT : 1),
            width: grass.bladeWidth * randomRange(random, 0.7, 1.3) * (stands ? TALL_WIDTH : 1),
            lean: grass.lean * randomRange(random, 0.45, 1.25),
            clump,
            priority: random(),
        }
    })

    // The tallest tip is exactly as high as Height says.
    const tallest = blades.reduce((most, blade) => Math.max(most, tipHeight(blade)), 1e-6)
    const fit = grass.height / tallest

    return blades.map((blade) => ({...blade, height: blade.height * fit}))
}

/**
 * The blades a lighter level keeps. It always keeps whichever mark the patch's
 * extent, so the outline holds, and never rerolls: stepping down only takes away.
 */
export function bladesAtDetail(blades: readonly Blade[], count: number): readonly Blade[] {
    const edges = new Set<Blade>()
    const extreme = (measure: (blade: Blade) => number) => {
        edges.add(blades.reduce((best, blade) => (measure(blade) > measure(best) ? blade : best)))
    }

    extreme(tipHeight)
    extreme((blade) => tipOf(blade).x)
    extreme((blade) => -tipOf(blade).x)
    extreme((blade) => tipOf(blade).z)
    extreme((blade) => -tipOf(blade).z)

    const rest = blades.filter((blade) => !edges.has(blade)).sort((a, b) => a.priority - b.priority)

    return [...edges, ...rest.slice(0, Math.max(0, count - edges.size))]
}

/** Where a blade's curve is at `t`, root to tip: along the way it faces, and up. */
export function bladePoint(blade: Blade, t: number): readonly [number, number, number] {
    const u = 1 - t
    const reach = blade.lean * blade.height
    const along = 2 * u * t * reach * REACH_AT_MIDDLE + t * t * reach
    const up = 2 * u * t * blade.height * CURVE_AT_MIDDLE + t * t * tipHeight(blade)

    return [blade.x + Math.cos(blade.facing) * along, up, blade.z + Math.sin(blade.facing) * along]
}

/** Where each flower stands, its stem's path, and how wide it is. */
export function flowerStems(grass: GrassParameters, seed: number, detail: number): {path: ReturnType<typeof stemPath>; across: number; random: () => number}[] {
    const count = Math.round(grass.flowers * detail)
    const radius = grass.width / 2
    const drift = createSeededRandom(hashSeed(seed, SEED_FLOWER))
    const centres = [0, 1, 2].map(() => {
        const azimuth = drift() * Math.PI * 2
        const out = Math.sqrt(drift()) * radius * 0.7

        return [Math.cos(azimuth) * out, Math.sin(azimuth) * out] as const
    })

    return Array.from({length: count}, (_, i) => {
        const random = createSeededRandom(hashSeed(seed, SEED_FLOWER + 1 + i))
        const [cx, cz] = centres[i % centres.length]
        const azimuth = random() * Math.PI * 2
        const out = random() * radius * 0.4
        const path = stemPath(cx + Math.cos(azimuth) * out, cz + Math.sin(azimuth) * out, random() * Math.PI * 2, grass.height * randomRange(random, 0.7, 0.98), grass.lean * 0.25)

        return {path, across: FLOWER_ACROSS * randomRange(random, 0.8, 1.2), random}
    })
}

/** A flower belongs to a drift, so only those falling near one of a few centres stand. */
function addFlowers(buffers: {positions: number[]; normals: number[]; colors: number[]; indices: number[]}, grass: GrassParameters, seed: number, detail: number) {
    const petal = colourRamp(rampOf(grass.flowerColour, PETAL_RAMPS, grass, FLOWER_ROWS))
    const stem = colourRamp(STEM_RAMP)

    for (const {path, across, random} of flowerStems(grass, seed, detail)) {
        addStrip(buffers, path, FLOWER_STEM, FLOWER_STEM_PIECES, (t) => stem(0.2 + t * 0.6), false)
        addDaisy(buffers, path.point(1), path.tangent(1), across, FLOWER_PETALS, petal, random)
    }
}

export function buildGrassMesh(grass: GrassParameters, seed: number, detail: number): THREE.BufferGeometry {
    const all = planGrass(grass, seed)
    const fullPieces = Math.max(MIN_PIECES, Math.round(grass.smoothness))
    const pieces = detail < FEWER_PIECES_BELOW ? Math.max(MIN_PIECES, fullPieces - 1) : fullPieces
    // A blade of `n` pieces ending in a point has 4n - 2 faces, seen from both sides.
    const wanted = Math.round((all.length * detail * (4 * fullPieces - 2)) / (4 * pieces - 2))
    const blades = wanted < all.length ? bladesAtDetail(all, wanted) : all
    const widening = Math.min(Math.sqrt(all.length / blades.length), MAX_WIDENING)
    const lush = colourRamp(rampOf(grass.palette, GRASS_RAMPS, grass, GRASS_ROWS))
    const dry = colourRamp(DRY_RAMP)
    const radius = Math.max(grass.width / 2, 1e-3)

    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const indices: number[] = []

    for (const blade of blades) {
        const random = createSeededRandom(hashSeed(seed, Math.floor(blade.priority * 1e9)))
        const forwardX = Math.cos(blade.facing)
        const forwardZ = Math.sin(blade.facing)
        const sideX = -forwardZ
        const sideZ = forwardX
        const reach = blade.lean * blade.height
        const paint = blade.clump.dry ? dry : lush
        const offset = (blade.clump.hue - 0.5) * CLUMP_VALUE * (grass.variation * 2) + randomRange(random, -BLADE_VALUE, BLADE_VALUE)
        const tiltX = (blade.x - blade.clump.x) / radius
        const tiltZ = (blade.z - blade.clump.z) / radius
        const first = positions.length / 3

        for (let piece = 0; piece <= pieces; piece++) {
            const t = 1 - (1 - piece / pieces) ** TIP_CROWDING
            const u = 1 - t
            // A quadratic curve, in the plane the blade faces: along it, and up.
            const along = 2 * u * t * reach * REACH_AT_MIDDLE + t * t * reach
            const up = 2 * u * t * blade.height * CURVE_AT_MIDDLE + t * t * tipHeight(blade)
            const slopeAlong = 2 * u * reach * REACH_AT_MIDDLE + 2 * t * (reach - reach * REACH_AT_MIDDLE)
            const slopeUp = 2 * u * blade.height * CURVE_AT_MIDDLE + 2 * t * (tipHeight(blade) - blade.height * CURVE_AT_MIDDLE)
            const slope = Math.max(Math.hypot(slopeAlong, slopeUp), 1e-6)
            const normal = new THREE.Vector3(
                (forwardX * slopeUp) / slope * NORMAL_OWN_SHARE + tiltX * NORMAL_ROUNDING,
                1 - (slopeAlong / slope) * NORMAL_OWN_SHARE,
                (forwardZ * slopeUp) / slope * NORMAL_OWN_SHARE + tiltZ * NORMAL_ROUNDING,
            ).normalize()
            const half = blade.width * widening * 0.5 * (1 - t ** TAPER) * (1 - BASE_NARROWING * Math.max(0, 1 - t * 5))
            const colour = paint(t * TIP_VALUE + offset)
            const x = blade.x + forwardX * along
            const z = blade.z + forwardZ * along

            if (piece < pieces) {
                positions.push(x + sideX * half, up, z + sideZ * half, x - sideX * half, up, z - sideZ * half)
                normals.push(normal.x, normal.y, normal.z, normal.x, normal.y, normal.z)
                colors.push(colour.r, colour.g, colour.b, colour.r, colour.g, colour.b)
            } else {
                positions.push(x, up, z)
                normals.push(normal.x, normal.y, normal.z)
                colors.push(colour.r, colour.g, colour.b)
            }
        }

        // Both windings over the same vertices, as on leaves: a double-sided
        // material would flip these normals on the far face.
        for (let piece = 0; piece < pieces; piece++) {
            const a = first + piece * 2
            const b = a + 1

            if (piece < pieces - 1) {
                indices.push(a, b, b + 2, a, b + 2, a + 2, a, b + 2, b, a, a + 2, b + 2)
            } else {
                indices.push(a, b, a + 2, a, a + 2, b)
            }
        }
    }

    addFlowers({positions, normals, colors, indices}, grass, seed, detail)

    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    geometry.computeBoundingSphere()

    return geometry
}
