/**
 * A bush: one shape, a solid core inside it, and leaf cards laid over it.
 *
 * The shape is a smooth union of ellipsoid lobes, cut off by the ground, so a bush
 * sits on it as a dome with no trunk or legs. The core is the same shape moved
 * inwards, with the same normals and the same gradient a little darker, so a gap
 * between leaves shows about the colour you expected and stops looking like a hole.
 *
 * Cards are placed by area on the core's triangles, which spaces them evenly over
 * the whole surface. How many follows from how many layers should cover a point:
 * `count = coverage * area / (4 * half^2 * opaque share)`, so a bush looks the same
 * at any size.
 *
 * An open bush leaves the core out. Twigs take its place, reaching from the foot
 * into each lobe, and a third of its cards hang deeper, so you see into it and
 * through it, past leaves at different depths.
 */

import * as THREE from 'three'
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {BLOOM_CELL, LEAF_VARIANTS, leafCell} from '../shared/leaf-texture'
import {createSeededRandom, hashSeed, randomRange, type RandomSource} from '../shared/random'
import {colourRamp} from '../style/ramp'
import {FLOWER_ROWS, LEAF_ROWS, rampOf, type OwnColourValues, type OwnColours} from '../style/own-colours'
import {BUSH_RAMPS, PETAL_RAMPS, TWIG_RAMP, type BushPaletteId, type PetalPaletteId} from '../style/palettes'

export type BushKind = 'round' | 'spreading' | 'tall' | 'hedge'

/** Solid hides everything behind it. Open has twigs and sky inside. */
export type BushInside = 'solid' | 'open'

export interface BushParameters extends Partial<OwnColourValues<typeof LEAF_ROWS> & OwnColourValues<typeof FLOWER_ROWS>> {
    readonly kind: BushKind
    readonly width: number
    readonly height: number
    readonly depth: number
    readonly lobes: number
    /** How far the surface ripples between lobes, 0 to 1. */
    readonly lumps: number
    /** How many layers of leaves cover a point. */
    readonly fullness: number
    /** Half the width of a card of leaves, in metres. */
    readonly leafSize: number
    /** How far one lobe's colour strays from the next, 0 to 1. */
    readonly variation: number
    readonly palette: BushPaletteId | OwnColours
    readonly inside: BushInside
    /** How thickly it flowers, 0 to 1. */
    readonly flowers: number
    /** Half the width of a flower, in metres. */
    readonly flowerSize: number
    readonly flowerColour: PetalPaletteId | OwnColours
}

type Vec3 = readonly [number, number, number]

interface Lobe {
    readonly centre: Vec3
    readonly radii: Vec3
    /** Each lobe leans a little lighter or darker than the next. */
    readonly shift: number
}

const SEED_LOBES = 61
const SEED_CARDS = 3000
const SEED_FLOWERS = 900000
const SEED_TWIGS = 800000
const TWIG_SIDES = 3
const TWIG_RINGS = 3
const TWIGS_PER_LOBE = 3
/** How thick a twig is at its foot, as a share of the bush's size. */
const TWIG_WIDTH = 0.012
/** Below this share of its detail, each lobe keeps only its main stem. */
const SIDE_TWIGS_FROM = 0.25
/** How far inside the surface the deep cards of an open bush hang, as a share of a card, and how much darker. */
const DEEP_CARD_LEVEL = 2.2
const DEEP_CARD_SHADE = 0.18
/** How much of the surface flowers would cover, at full Flowers. */
const FLOWER_COVER = 0.55
/** Below this share of the height, no flowers: they gather in the light. */
const FLOWER_FROM = 0.2
const FLOWER_LIFT = 0.75
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const SNAP_STEPS = 9
const GRADIENT_STEP = 0.02
/** How wide a fillet between lobes is, as a share of the bush's size. */
const BLEND = 0.14
const RIPPLE = 0.02
/** How far inside the leaves the core sits, as a share of a card. */
const CORE_INSET = 0.45
const CORE_SHADE = 0.2
/** The share of a printed card that is opaque. */
const CARD_OPAQUE = 0.55
/** Three's detail number for the core's sphere: 20 * (n + 1)^2 faces. */
const FULL_CORE = 4
const SAMPLING_CORE = 6
const MIN_CARDS = 12
const MAX_CARD_GROWTH = 2.2
/** How far a grown card is pulled in, as a share of its growth, so its outer edge stays put. */
const GROWTH_PULL = 0.6
const FACES_PER_CARD = 4
/** How far past the surface a card may reach, as a share of its size. */
const CARD_MARGIN = 1.1
const GROUND_DIP = 0.02
const CARD_TILT = 0.45
const CARD_FLOAT = 0.25
const TIP_SHADE = 0.86
const CREASE_DARK = 0.14
const LOBE_LIGHT = 0.15
const SKY_BIAS = 0.15
const CORNERS: readonly (readonly [number, number])[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
]

const normalize = (a: Vec3): Vec3 => {
    const length = Math.hypot(a[0], a[1], a[2]) || 1

    return [a[0] / length, a[1] / length, a[2] / length]
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** Lobes in a box one unit wide, deep and tall. */
function lobeRecipe(kind: BushKind, count: number, random: RandomSource): Lobe[] {
    const shift = () => randomRange(random, -1, 1)

    switch (kind) {
        case 'hedge':
            return Array.from({length: count}, (_, i) => ({
                centre: [count === 1 ? 0 : -0.38 + (i / (count - 1)) * 0.76, 0.46, randomRange(random, -0.03, 0.03)],
                radii: [Math.max(0.16, 0.7 / count), randomRange(random, 0.52, 0.6), 0.5],
                shift: shift(),
            }))

        case 'tall':
            return [
                // Centred low, so it meets the ground wide and doesn't stand on a point.
                {centre: [0, 0.34, 0], radii: [0.44, 0.7, 0.44], shift: shift()},
                ...Array.from({length: count - 1}, (_, i): Lobe => {
                    const azimuth = i * GOLDEN_ANGLE + random()
                    const y = randomRange(random, 0.12, 0.85)
                    const size = randomRange(random, 0.16, 0.24)

                    return {
                        centre: [Math.cos(azimuth) * 0.26, y, Math.sin(azimuth) * 0.26],
                        radii: [size, randomRange(random, 0.16, 0.24), size],
                        shift: shift(),
                    }
                }),
            ]

        case 'spreading':
            return [
                {centre: [0, 0.35, 0], radii: [0.36, 0.65, 0.36], shift: shift()},
                ...Array.from({length: count - 1}, (_, i): Lobe => {
                    const azimuth = i * GOLDEN_ANGLE + random()
                    const out = randomRange(random, 0.26, 0.38)
                    const size = randomRange(random, 0.14, 0.22)

                    return {
                        centre: [Math.cos(azimuth) * out, randomRange(random, 0.15, 0.4), Math.sin(azimuth) * out],
                        radii: [size, randomRange(random, 0.3, 0.5), size],
                        shift: shift(),
                    }
                }),
            ]

        case 'round':
            return [
                {centre: [0, 0.42, 0], radii: [0.4, 0.56, 0.4], shift: shift()},
                ...Array.from({length: count - 1}, (_, i): Lobe => {
                    const azimuth = i * GOLDEN_ANGLE + random()
                    const out = randomRange(random, 0.3, 0.38)
                    const size = randomRange(random, 0.19, 0.27)

                    return {
                        centre: [Math.cos(azimuth) * out, randomRange(random, 0.25, 0.68), Math.sin(azimuth) * out],
                        radii: [size, randomRange(random, 0.2, 0.3), size],
                        shift: shift(),
                    }
                }),
            ]
    }
}

class BushShape {
    private readonly size: number

    constructor(
        readonly lobes: readonly Lobe[],
        private readonly bush: BushParameters,
    ) {
        this.size = (bush.width + bush.height + bush.depth) / 3
    }

    /** Negative inside, positive outside. */
    field(x: number, y: number, z: number): number {
        const k = BLEND * this.size
        let d = Infinity

        for (const {centre, radii} of this.lobes) {
            const q = (Math.hypot((x - centre[0]) / radii[0], (y - centre[1]) / radii[1], (z - centre[2]) / radii[2]) - 1) * Math.min(radii[0], radii[1], radii[2])
            const h = Math.max(k - Math.abs(d - q), 0) / k

            d = Math.min(d, q) - h * h * k * 0.25
        }

        const wave = 11 / this.size
        const ripple = Math.sin(x * wave * 0.8 + 1.3) * Math.sin(z * wave) + Math.sin(y * wave * 1.2 + x * wave * 0.7)

        return d + ripple * RIPPLE * this.size * this.bush.lumps * 2
    }

    gradient(x: number, y: number, z: number): Vec3 {
        const e = GRADIENT_STEP * this.size

        return normalize([
            this.field(x + e, y, z) - this.field(x - e, y, z),
            this.field(x, y + e, z) - this.field(x, y - e, z),
            this.field(x, y, z + e) - this.field(x, y, z - e),
        ])
    }

    /** Moves a point onto the surface `field = level`. */
    snap(point: Vec3, level: number): Vec3 {
        let p = point

        for (let step = 0; step < SNAP_STEPS; step++) {
            const d = this.field(p[0], p[1], p[2]) - level
            const n = this.gradient(p[0], p[1], p[2])

            p = [p[0] - n[0] * d, p[1] - n[1] * d, p[2] - n[2] * d]
        }

        return p
    }

    /** The painted value of a point on the bush: light on top, dark at the base and in creases. */
    value(p: Vec3, n: Vec3, variation: number): number {
        let nearest = Infinity
        let second = Infinity
        let shift = 0

        for (const {centre, radii, shift: own} of this.lobes) {
            const q = Math.hypot((p[0] - centre[0]) / radii[0], (p[1] - centre[1]) / radii[1], (p[2] - centre[2]) / radii[2])

            if (q < nearest) {
                second = nearest
                nearest = q
                shift = own
            } else if (q < second) {
                second = q
            }
        }

        const crease = Math.max(0, 1 - (second - nearest) * 4)

        return (
            0.5 * (n[1] * 0.5 + 0.5) +
            0.42 * (p[1] / this.bush.height) +
            0.22 * Math.min(1, p[1] / (0.3 * this.bush.height)) -
            0.12 -
            crease * CREASE_DARK +
            shift * LOBE_LIGHT * variation
        )
    }
}

/** A sphere pressed onto the shape at `level`, sharing its vertices. */
function shellGeometry(shape: BushShape, bush: BushParameters, level: number, detail: number): THREE.BufferGeometry {
    const sphere = new THREE.IcosahedronGeometry(1, detail)

    sphere.deleteAttribute('normal')
    sphere.deleteAttribute('uv')

    const geometry = mergeVertices(sphere, 1e-4)
    const position = geometry.getAttribute('position')

    sphere.dispose()

    for (let i = 0; i < position.count; i++) {
        const d = normalize([position.getX(i), position.getY(i), position.getZ(i)])
        const p = shape.snap([(d[0] * bush.width) / 2, bush.height * 0.42 + (d[1] * bush.height) / 2, (d[2] * bush.depth) / 2], level)

        position.setXYZ(i, p[0], p[1], p[2])
    }

    return geometry
}

/** The shape, stretched so the bush is exactly the size asked for. */
function shapeOf(bush: BushParameters, seed: number): BushShape {
    const random = createSeededRandom(hashSeed(seed, SEED_LOBES))
    const unit = lobeRecipe(bush.kind, Math.max(1, Math.round(bush.lobes)), random)
    const placed = (x: number, y: number, z: number, height: number): Lobe[] =>
        unit.map(({centre, radii, shift}) => ({
            centre: [centre[0] * x, centre[1] * height, centre[2] * z],
            radii: [radii[0] * x, radii[1] * y, radii[2] * z],
            shift,
        }))
    const first = new BushShape(placed(bush.width, bush.height, bush.depth, bush.height), bush)
    const shell = shellGeometry(first, bush, 0, FULL_CORE)
    const box = new THREE.Box3().setFromBufferAttribute(shell.getAttribute('position') as THREE.BufferAttribute)

    shell.dispose()

    const fitX = bush.width / Math.max(box.max.x - box.min.x, 1e-6)
    const fitY = bush.height / Math.max(box.max.y, 1e-6)
    const fitZ = bush.depth / Math.max(box.max.z - box.min.z, 1e-6)

    return new BushShape(placed(bush.width * fitX, bush.height * fitY, bush.depth * fitZ, bush.height * fitY), bush)
}

const coreDetail = (detail: number) => (detail >= 1 ? FULL_CORE : detail >= 0.25 ? 2 : 1)

/** What the inside of a bush costs at a level: a shell for a solid one, twigs for an open one. */
function insideFaces(bush: BushParameters, detail: number): number {
    if (bush.inside === 'solid') {
        return 20 * (coreDetail(detail) + 1) ** 2
    }

    const twigs = Math.max(1, Math.round(bush.lobes)) * (detail >= SIDE_TWIGS_FROM ? TWIGS_PER_LOBE : 1)

    return twigs * TWIG_SIDES * 2 * TWIG_RINGS
}

/** Thin tapering stems from the foot into each lobe. Three sides are enough for something this thin. */
function buildTwigs(shape: BushShape, bush: BushParameters, seed: number, detail: number): THREE.BufferGeometry {
    const size = (bush.width + bush.height + bush.depth) / 3
    const paint = colourRamp(TWIG_RAMP)
    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const indices: number[] = []

    const addTwig = (from: Vec3, to: Vec3, bend: Vec3, width: number) => {
        const first = positions.length / 3
        const axis = normalize([to[0] - from[0], to[1] - from[1], to[2] - from[2]])
        const u = normalize(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
        const v = cross(axis, u)

        for (let ring = 0; ring <= TWIG_RINGS; ring++) {
            const t = ring / TWIG_RINGS
            const arc = 4 * t * (1 - t)
            const radius = width * (1 - t * 0.85)
            const colour = paint(t)

            for (let side = 0; side < TWIG_SIDES; side++) {
                const angle = (side / TWIG_SIDES) * Math.PI * 2
                const n: Vec3 = [
                    u[0] * Math.cos(angle) + v[0] * Math.sin(angle),
                    u[1] * Math.cos(angle) + v[1] * Math.sin(angle),
                    u[2] * Math.cos(angle) + v[2] * Math.sin(angle),
                ]

                positions.push(
                    from[0] + (to[0] - from[0]) * t + bend[0] * arc + n[0] * radius,
                    from[1] + (to[1] - from[1]) * t + bend[1] * arc + n[1] * radius,
                    from[2] + (to[2] - from[2]) * t + bend[2] * arc + n[2] * radius,
                )
                normals.push(n[0], n[1], n[2])
                colors.push(colour.r, colour.g, colour.b)
            }
        }

        for (let ring = 0; ring < TWIG_RINGS; ring++) {
            for (let side = 0; side < TWIG_SIDES; side++) {
                const next = (side + 1) % TWIG_SIDES
                const a = first + ring * TWIG_SIDES + side
                const b = first + ring * TWIG_SIDES + next
                const c = a + TWIG_SIDES
                const d = b + TWIG_SIDES

                indices.push(a, b, d, a, d, c)
            }
        }
    }

    shape.lobes.forEach((lobe, index) => {
        const random = createSeededRandom(hashSeed(seed, SEED_TWIGS + index))
        const offset = (): Vec3 => [randomRange(random, -0.12, 0.12) * size, randomRange(random, -0.06, 0.06) * size, randomRange(random, -0.12, 0.12) * size]
        const shift = offset()
        const foot: Vec3 = [lobe.centre[0] * 0.15 + shift[0] * 0.4, -0.02 * bush.height, lobe.centre[2] * 0.15 + shift[2] * 0.4]
        const end: Vec3 = [lobe.centre[0], Math.max(lobe.centre[1] + lobe.radii[1] * 0.4, bush.height * 0.2), lobe.centre[2]]
        const fork: Vec3 = [foot[0] + (end[0] - foot[0]) * 0.55, foot[1] + (end[1] - foot[1]) * 0.55, foot[2] + (end[2] - foot[2]) * 0.55]
        const width = TWIG_WIDTH * size

        addTwig(foot, end, offset(), width)

        if (detail >= SIDE_TWIGS_FROM) {
            for (let twig = 1; twig < TWIGS_PER_LOBE; twig++) {
                const out: Vec3 = [
                    lobe.centre[0] + lobe.radii[0] * randomRange(random, -0.8, 0.8),
                    lobe.centre[1] + lobe.radii[1] * randomRange(random, 0, 0.7),
                    lobe.centre[2] + lobe.radii[2] * randomRange(random, -0.8, 0.8),
                ]

                addTwig(fork, out, offset(), width * 0.55)
            }
        }
    })

    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    geometry.computeBoundingSphere()

    return geometry
}

export function buildBushCore(bush: BushParameters, seed: number, detail: number): THREE.BufferGeometry {
    const shape = shapeOf(bush, seed)

    if (bush.inside === 'open') {
        return buildTwigs(shape, bush, seed, detail)
    }

    const level = -CORE_INSET * bush.leafSize
    const geometry = shellGeometry(shape, bush, level, coreDetail(detail))
    const position = geometry.getAttribute('position')
    const paint = colourRamp(rampOf(bush.palette, BUSH_RAMPS, bush, LEAF_ROWS))
    const normals = new Float32Array(position.count * 3)
    const colors = new Float32Array(position.count * 3)

    for (let i = 0; i < position.count; i++) {
        const p: Vec3 = [position.getX(i), Math.max(position.getY(i), -0.02 * bush.height), position.getZ(i)]
        const n = shape.gradient(p[0], Math.max(p[1], 0), p[2])
        const colour = paint(shape.value(p, n, bush.variation) - CORE_SHADE)

        position.setY(i, p[1])
        normals.set(n, i * 3)
        colors.set([colour.r, colour.g, colour.b], i * 3)
    }

    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.computeBoundingSphere()

    return geometry
}

interface Card {
    readonly point: Vec3
    readonly normal: Vec3
    readonly seed: number
    readonly priority: number
    readonly flower: boolean
    /** Hangs inside the surface of an open bush, in its shade. */
    readonly deep: boolean
}

/** Evenly over the surface: each triangle gets its share of cards by area. */
function placeCards(shape: BushShape, bush: BushParameters, seed: number): readonly Card[] {
    const shell = shellGeometry(shape, bush, 0, SAMPLING_CORE)
    const position = shell.getAttribute('position')
    const index = shell.index!
    const triangles: {a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; from: number}[] = []
    let area = 0

    for (let i = 0; i < index.count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(position, index.getX(i))
        const b = new THREE.Vector3().fromBufferAttribute(position, index.getX(i + 1))
        const c = new THREE.Vector3().fromBufferAttribute(position, index.getX(i + 2))

        if (a.y < 0 && b.y < 0 && c.y < 0) {
            continue
        }

        triangles.push({a, b, c, from: area})
        area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2
    }

    shell.dispose()

    const count = Math.max(MIN_CARDS, Math.round((bush.fullness * area) / (4 * bush.leafSize * bush.leafSize * CARD_OPAQUE)))
    const cards: Card[] = []
    let at = 0

    for (let i = 0; i < count; i++) {
        const cardSeed = hashSeed(seed, SEED_CARDS + i)
        const random = createSeededRandom(cardSeed)
        const target = ((i + random()) / count) * area

        while (at < triangles.length - 1 && triangles[at + 1].from <= target) {
            at++
        }

        const {a, b, c} = triangles[at]
        let r = random()
        let s = random()

        if (r + s > 1) {
            r = 1 - r
            s = 1 - s
        }

        const deep = bush.inside === 'open' && i % 3 === 0
        const point = shape.snap(
            [a.x + (b.x - a.x) * r + (c.x - a.x) * s, a.y + (b.y - a.y) * r + (c.y - a.y) * s, a.z + (b.z - a.z) * r + (c.z - a.z) * s],
            deep ? -DEEP_CARD_LEVEL * bush.leafSize : 0,
        )

        if (point[1] >= 0) {
            cards.push({point, normal: shape.gradient(point[0], point[1], point[2]), seed: cardSeed, priority: random(), flower: false, deep})
        }
    }

    // Flowers gather in drifts, chosen by a smooth wave, on the upper part of the bush.
    const flowerCount = Math.round((bush.flowers * FLOWER_COVER * area) / (4 * bush.flowerSize * bush.flowerSize))
    const wave = 5 / ((bush.width + bush.height + bush.depth) / 3)

    at = 0

    for (let i = 0; i < flowerCount; i++) {
        const cardSeed = hashSeed(seed, SEED_FLOWERS + i)
        const random = createSeededRandom(cardSeed)
        const target = ((i + random()) / flowerCount) * area

        while (at < triangles.length - 1 && triangles[at + 1].from <= target) {
            at++
        }

        const {a, b, c} = triangles[at]
        let r = random()
        let s = random()

        if (r + s > 1) {
            r = 1 - r
            s = 1 - s
        }

        const point = shape.snap(
            [a.x + (b.x - a.x) * r + (c.x - a.x) * s, a.y + (b.y - a.y) * r + (c.y - a.y) * s, a.z + (b.z - a.z) * r + (c.z - a.z) * s],
            0,
        )
        const drift = Math.sin(point[0] * wave + 1) * Math.sin(point[2] * wave * 1.2) + Math.sin(point[1] * wave * 1.4)

        if (point[1] > bush.height * FLOWER_FROM && drift > -0.2) {
            cards.push({point, normal: shape.gradient(point[0], point[1], point[2]), seed: cardSeed, priority: random(), flower: true, deep: false})
        }
    }

    return cards
}

/** The cards a lighter level keeps: always those at the extent, so the outline holds. */
function cardsAtDetail(cards: readonly Card[], count: number): readonly Card[] {
    const edges = new Set<Card>()

    for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [2, 1], [2, -1]] as const) {
        edges.add(cards.reduce((best, card) => (card.point[axis] * sign > best.point[axis] * sign ? card : best)))
    }

    const rest = cards.filter((card) => !edges.has(card)).sort((a, b) => a.priority - b.priority)

    return [...edges, ...rest.slice(0, Math.max(0, count - edges.size))]
}

export function buildBushLeaves(bush: BushParameters, seed: number, detail: number): THREE.BufferGeometry {
    const shape = shapeOf(bush, seed)
    const all = placeCards(shape, bush, seed)
    // The whole bush is held to its share, and its inside has already taken some of it.
    const wanted = Math.round(((all.length * FACES_PER_CARD + insideFaces(bush, 1)) * detail - insideFaces(bush, detail)) / FACES_PER_CARD)
    const cards = detail < 1 ? cardsAtDetail(all, Math.max(wanted, MIN_CARDS)) : all
    const growth = Math.min(Math.sqrt(all.length / Math.max(cards.length, 1)), MAX_CARD_GROWTH)
    const paint = colourRamp(rampOf(bush.palette, BUSH_RAMPS, bush, LEAF_ROWS))
    const margin = bush.leafSize * CARD_MARGIN
    const limitMin = [0, 1, 2].map((axis) => all.reduce((least, card) => Math.min(least, card.point[axis]), Infinity) - margin)
    const limitMax = [0, 1, 2].map((axis) => all.reduce((most, card) => Math.max(most, card.point[axis]), -Infinity) + margin)

    limitMin[1] = -GROUND_DIP * bush.height

    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const uvs: number[] = []
    const indices: number[] = []

    const petal = colourRamp(rampOf(bush.flowerColour, PETAL_RAMPS, bush, FLOWER_ROWS))

    for (const {point, normal, seed: cardSeed, flower, deep} of cards) {
        const random = createSeededRandom(hashSeed(cardSeed, 1))
        const plain = (flower ? bush.flowerSize : bush.leafSize) * randomRange(random, 0.8, 1.2)
        const half = plain * growth
        const lift = flower ? bush.leafSize * FLOWER_LIFT : plain * randomRange(random, 0, CARD_FLOAT) - (half - plain) * GROWTH_PULL
        const middle: Vec3 = [point[0] + normal[0] * lift, point[1] + normal[1] * lift, point[2] + normal[2] * lift]
        // Faces only roughly outwards, so the outline breaks up where a flat card would vanish edge on.
        const facing = normalize([
            normal[0] + randomRange(random, -CARD_TILT, CARD_TILT),
            normal[1] + randomRange(random, -CARD_TILT, CARD_TILT),
            normal[2] + randomRange(random, -CARD_TILT, CARD_TILT),
        ])
        // Down the slope of the dome, like a roof tile.
        const downhill: Vec3 = [
            -normal[0] * normal[1] + randomRange(random, -0.35, 0.35),
            -(1 - normal[1] * normal[1]) - 0.05,
            -normal[2] * normal[1] + randomRange(random, -0.35, 0.35),
        ]
        const side = normalize(cross(facing, downhill))
        const down = normalize(cross(side, facing))
        const shading = normalize([normal[0], normal[1] + SKY_BIAS, normal[2]])
        const value = shape.value(point, normal, bush.variation) + randomRange(random, -0.04, 0.04) - (deep ? DEEP_CARD_SHADE : 0)
        const colour = flower ? petal(0.35 + random() * 0.65).clone() : paint(value).clone()
        const [u0, v0, size] = leafCell(flower ? BLOOM_CELL : Math.floor(random() * LEAF_VARIANTS))
        const base = positions.length / 3

        for (const [a, b] of CORNERS) {
            const shade = b > 0 && !flower ? TIP_SHADE : 1
            // A card neither digs into the ground nor, when grown, reaches past the full bush.
            const reach = (axis: 0 | 1 | 2) =>
                Math.min(limitMax[axis], Math.max(limitMin[axis], middle[axis] + (side[axis] * a + down[axis] * b) * half))

            positions.push(reach(0), reach(1), reach(2))
            normals.push(shading[0], shading[1], shading[2])
            colors.push(colour.r * shade, colour.g * shade, colour.b * shade)
            uvs.push(u0 + ((a + 1) / 2) * size, v0 + ((b + 1) / 2) * size)
        }

        // Both windings over the same vertices: a double-sided material would flip these normals.
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 2, base + 1, base, base + 3, base + 2)
    }

    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeBoundingSphere()

    return geometry
}
