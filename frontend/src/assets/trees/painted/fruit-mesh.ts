/**
 * Fruit: where it hangs from a clump, and the shape of each kind.
 *
 * Every fruit hangs on a stalk from a point inside the leaves, so however far
 * Hanging lets it drop, it never floats. A body is turned round its own axis
 * from a profile, so one builder makes balls, eggs, pears, mangoes and cones.
 */

import * as THREE from 'three'
import {createSeededRandom, hashSeed, randomRange} from '../../shared/random'
import {addLeaf, leafColours, pushVertex, type LeafBuffers} from './leaf-buffers'
import {FRUIT_KINDS, type FruitLook, type PaintedTreeParameters} from './parameters'
import {cross, normalize, perpendicularTo, type Clump, type Vec3} from './plan'

/** Below this share of its detail, a level keeps one fruit in three, for the colour. */
export const FEW_FRUIT_BELOW = 0.2
/** Below this share, fruit is plainer: fewer sides, and a bunch is one shape. */
const FRUIT_PLAIN_BELOW = 0.7
const FRUIT_RINGS = 4
const FRUIT_SIDES = 6
/**
 * Where a snug fruit's stalk meets it: out from the middle of its leaf card and
 * a little above it, in apple widths. The cards are far bigger than the fruit,
 * so one pushed in behind its card would be hidden.
 */
const FRUIT_OUT = 0.7
const FRUIT_RISE = 0.4
/** Each fruit is the best spread of this many spots tried. */
const FRUIT_TRIES = 6
/** How far full Hanging lowers a fruit, in lengths of its kind's stalk. */
export const FRUIT_HANG_REACH = 2.5
const STALK_COLOUR = new THREE.Color('#5b4a2c')
const UP: Vec3 = [0, 1, 0]

/** How big an apple is on a tree this tall: fruit is placed by this, whatever its kind. */
export const appleRadius = (tree: PaintedTreeParameters) => (0.06 + tree.height * 0.008) * tree.fruitSize

/** How big one fruit, or one piece of a bunch, is. */
export const fruitRadius = (tree: PaintedTreeParameters) => appleRadius(tree) * FRUIT_KINDS[tree.fruitKind].size

/** Where a leaf card holds fruit, and which way is into its clump from there. */
export interface FruitSpot {
    readonly point: Vec3
    readonly inward: Vec3
}

/** One fruit's stalk, from `attach` in the leaves down to `top`, and the way its body hangs from there. */
export interface FruitHang {
    readonly attach: Vec3
    readonly top: Vec3
    readonly axis: Vec3
    /** Which side its stalk leaf grows on, 1 or -1. */
    readonly side: number
}

const add = (a: Vec3, b: Vec3, scale = 1): Vec3 => [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale]
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const smoothstep = (from: number, to: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - from) / (to - from)))

    return t * t * (3 - 2 * t)
}

/** A sphere's width along its length, 0 to 1: the rounded ends every fruit starts from. */
const round = (h: number) => 2 * Math.sqrt(Math.max(h * (1 - h), 0))

/** A kind's width along its length, from the stalk (0) to the far end (1). */
function profileOf(look: FruitLook): (h: number) => number {
    switch (look.shape) {
        case 'pear':
            return (h) => round(h) * (0.52 + 0.48 * smoothstep(0.1, 0.7, h))
        case 'cone':
            // Widest near its foot, coming to a point at its tip.
            return (h) => Math.sqrt(round(h)) * (1 - 0.5 * h) * 0.95
        default:
            return (h) => round(h) ** look.point
    }
}

/** A thin stalk from `from` to `to`, swaying whole with its fruit. */
function addStalk(buffers: LeafBuffers, from: Vec3, to: Vec3, radius: number, sides: number, colour = STALK_COLOUR) {
    const along = normalize([to[0] - from[0], to[1] - from[1], to[2] - from[2]])
    const axisA = perpendicularTo(along)
    const axisB = cross(along, axisA)
    const first = buffers.positions.length / 3

    for (const end of [from, to]) {
        for (let side = 0; side < sides; side++) {
            const angle = (side / sides) * Math.PI * 2
            const n: Vec3 = [
                axisA[0] * Math.cos(angle) + axisB[0] * Math.sin(angle),
                axisA[1] * Math.cos(angle) + axisB[1] * Math.sin(angle),
                axisA[2] * Math.cos(angle) + axisB[2] * Math.sin(angle),
            ]

            pushVertex(buffers, add(end, n, radius), n, colour)
        }
    }

    for (let side = 0; side < sides; side++) {
        const next = (side + 1) % sides

        buffers.indices.push(first + side, first + sides + next, first + next, first + side, first + sides + side, first + sides + next)
    }
}

/**
 * A rounded body turned round `axis`, from `start` to `length` along it. Its
 * colour runs from the kind's deep colour underneath to its light one on top.
 * Ridged bodies step in on every other ring, and turn half a side, like scales.
 */
function addBody(
    buffers: LeafBuffers,
    start: Vec3,
    axis: Vec3,
    radius: number,
    length: number,
    profile: (h: number) => number,
    look: FruitLook,
    rings: number,
    sides: number,
    ridged = false,
) {
    const axisA = perpendicularTo(axis)
    const axisB = cross(axis, axisA)
    const low = new THREE.Color(look.deep)
    const high = new THREE.Color(look.light)
    const paint = new THREE.Color()
    const first = buffers.positions.length / 3
    const step = 1e-3

    for (let ring = 0; ring <= rings; ring++) {
        // Spaced as a sphere's rings are, so the rounded ends get their share.
        const h = (1 - Math.cos((ring / rings) * Math.PI)) / 2
        const inset = ridged && ring % 2 === 1 ? 0.8 : 1
        const width = profile(h) * inset * radius
        const before = Math.max(h - step, 0)
        const after = Math.min(h + step, 1)
        const slope = ((profile(after) - profile(before)) * radius * inset) / ((after - before) * length)
        const twist = ridged ? ((ring % 2) * Math.PI) / sides : 0

        for (let side = 0; side < sides; side++) {
            const angle = (side / sides) * Math.PI * 2 + twist
            const out: Vec3 = [
                axisA[0] * Math.cos(angle) + axisB[0] * Math.sin(angle),
                axisA[1] * Math.cos(angle) + axisB[1] * Math.sin(angle),
                axisA[2] * Math.cos(angle) + axisB[2] * Math.sin(angle),
            ]
            const n = normalize([out[0] - axis[0] * slope, out[1] - axis[1] * slope, out[2] - axis[2] * slope])

            pushVertex(buffers, add(add(start, axis, h * length), out, width), n, paint.copy(low).lerp(high, n[1] * 0.5 + 0.5))
        }
    }

    for (let ring = 0; ring < rings; ring++) {
        for (let side = 0; side < sides; side++) {
            const next = (side + 1) % sides
            const a = first + ring * sides + side
            const b = first + ring * sides + next
            const c = first + (ring + 1) * sides + next
            const d = first + (ring + 1) * sides + side

            buffers.indices.push(a, c, b, a, d, c)
        }
    }
}

/**
 * One fruit of the tree's kind on its stalk, all of it swaying whole. `paint`
 * colours a leaf on the stalk, for kinds that have one.
 */
export function addOneFruit(
    buffers: LeafBuffers,
    hang: FruitHang,
    tree: PaintedTreeParameters,
    paint: ((value: number) => THREE.Color) | null,
    share = 1,
) {
    const kind = FRUIT_KINDS[tree.fruitKind]
    // A mixed kind picks its colour from where the fruit hangs, so it takes no random numbers.
    const pick = kind.mixed?.[Math.floor(Math.abs(Math.sin(hang.top[0] * 12.9898 + hang.top[2] * 78.233) * 43758.5453) % kind.mixed.length)]
    const look = pick ? {...kind, deep: pick[0], light: pick[1]} : kind
    const radius = fruitRadius(tree)
    const plain = share < FRUIT_PLAIN_BELOW
    // Fruit far smaller than an apple, like cherries and olives, needs few sides.
    const small = look.size < 0.5
    const rings = plain || small ? 3 : look.shape === 'ball' || look.shape === 'egg' ? FRUIT_RINGS : 6
    const sides = plain ? 4 : FRUIT_SIDES
    const stalkWidth = Math.max(appleRadius(tree) * 0.09, 0.006)
    const stalkSides = plain ? 3 : 4
    const {attach, top, axis} = hang
    const profile = profileOf(look)
    const first = buffers.positions.length / 3
    const across = perpendicularTo(axis)
    const turn = cross(axis, across)

    switch (look.shape) {
        case 'pair': {
            const sideways = normalize(cross(axis, Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : UP))

            // Far off, a pair reads as one.
            for (const sign of share < FEW_FRUIT_BELOW ? [1] : [1, -1]) {
                const own = add(top, sideways, sign * radius * 1.1)

                addStalk(buffers, attach, own, stalkWidth * 0.7, stalkSides)
                addBody(buffers, own, axis, radius, radius * 2 * look.length, profile, look, rings, sides)
            }

            break
        }
        case 'bunch': {
            addStalk(buffers, attach, top, stalkWidth, stalkSides)

            if (plain) {
                // From afar a bunch is one mass, the size and colour of the whole.
                addBody(buffers, top, axis, radius * 1.8, radius * 5, (h) => round(h) ** 1.3, look, rings, sides)
                break
            }

            const layers = [3, 3, 2, 1]
            const gap = radius * 1.6

            addStalk(buffers, top, add(top, axis, gap * (layers.length - 1) + radius), stalkWidth * 0.6, 3)
            layers.forEach((count, layer) => {
                const ring = count > 1 ? radius * (1.25 - layer * 0.18) : 0

                for (let piece = 0; piece < count; piece++) {
                    const angle = (piece / count) * Math.PI * 2 + layer * 0.9
                    const centre = add(
                        add(add(top, axis, gap * layer + radius * 0.6), across, Math.cos(angle) * ring),
                        turn,
                        Math.sin(angle) * ring,
                    )

                    // Small pieces seen together: three sides each is enough.
                    addBody(buffers, add(centre, axis, -radius * look.length), axis, radius, radius * 2 * look.length, profile, look, 3, 3)
                }
            })
            break
        }
        case 'hand': {
            // The fingers turn up from the end of a hanging stalk, as bananas do,
            // so the hand hangs a finger's length lower, or they would grow back into the leaves.
            const finger = radius * 2 * look.length
            const base = add(top, axis, finger * 0.85)
            const fingers = plain ? 3 : 5

            addStalk(buffers, attach, base, stalkWidth * 1.4, stalkSides)

            for (let index = 0; index < fingers; index++) {
                const angle = (index / fingers) * Math.PI * 2
                const out: Vec3 = [
                    across[0] * Math.cos(angle) + turn[0] * Math.sin(angle),
                    across[1] * Math.cos(angle) + turn[1] * Math.sin(angle),
                    across[2] * Math.cos(angle) + turn[2] * Math.sin(angle),
                ]
                const toward = normalize([out[0] * 0.55, 0.85, out[2] * 0.55])

                addBody(buffers, add(base, out, radius * 0.4), toward, radius, finger, (h) => round(h) ** 0.9, look, plain ? 3 : 4, 4)
            }

            break
        }
        case 'cone': {
            // Cones stand up from the leaves, as a fir's do, leaning out a little.
            const out = normalize([top[0] - attach[0], 0, top[2] - attach[2]])
            const upright = normalize([out[0] * 0.35 - axis[0], 1, out[2] * 0.35 - axis[2]])

            addBody(buffers, attach, upright, radius, radius * 2 * look.length, profile, look, plain ? rings : 8, sides, !plain)
            break
        }
        default: {
            const length = radius * 2 * look.length

            addStalk(buffers, attach, top, stalkWidth, stalkSides)
            addBody(buffers, top, axis, radius, length, profile, look, rings, sides)

            if (look.crown) {
                const end = add(top, axis, length * 0.97)

                addStalk(buffers, end, add(end, axis, radius * 0.3), radius * 0.24, 5, new THREE.Color(look.deep))
            }
        }
    }

    if (look.leaf && paint && !plain) {
        const base = lerp(attach, top, 0.4)
        const sideways = normalize(cross(axis, Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : UP))
        const out = normalize([sideways[0] * hang.side, 0.45, sideways[2] * hang.side])
        const size = appleRadius(tree)

        addLeaf(buffers, base, add(base, out, size * 1.5), normalize(cross(out, UP)), size * 0.7, UP, paint, 0.55)
    }

    buffers.rigid.push(first, buffers.positions.length / 3)
}

/**
 * Where each of a clump's fruit hangs. The spots are where the full clump's
 * cards really are, and nothing here depends on the level of detail, so a
 * lighter level puts what fruit it keeps in the same places.
 */
export function planHangingFruit(spots: readonly FruitSpot[], clump: Clump, tree: PaintedTreeParameters): FruitHang[] {
    if (spots.length === 0) {
        return []
    }

    const random = createSeededRandom(hashSeed(clump.seed, 6))
    const size = appleRadius(tree)
    const drop = size * FRUIT_KINDS[tree.fruitKind].stalk * tree.fruitHang * FRUIT_HANG_REACH
    const placed: Vec3[] = []
    const hangs: FruitHang[] = []

    for (let index = 0; index < tree.fruitCount; index++) {
        // Of a few spots tried, the one farthest from the fruit already hung.
        let best = spots[0]
        let bestGap = -1

        for (let tried = 0; tried < FRUIT_TRIES; tried++) {
            const spot = spots[Math.floor(random() * spots.length)]
            const gap = placed.reduce(
                (nearest, other) => Math.min(nearest, Math.hypot(spot.point[0] - other[0], spot.point[1] - other[1], spot.point[2] - other[2])),
                Infinity,
            )

            if (gap > bestGap) {
                best = spot
                bestGap = gap
            }
        }

        placed.push(best.point)

        const {point, inward} = best

        hangs.push({
            attach: [point[0] + inward[0] * size * 0.6, point[1] + size * 0.7, point[2] + inward[2] * size * 0.6],
            top: [
                point[0] - inward[0] * size * FRUIT_OUT,
                point[1] - inward[1] * size * FRUIT_OUT + size * FRUIT_RISE - drop,
                point[2] - inward[2] * size * FRUIT_OUT,
            ],
            axis: normalize([randomRange(random, -0.2, 0.2), -1, randomRange(random, -0.2, 0.2)]),
            side: random() < 0.5 ? 1 : -1,
        })
    }

    return hangs
}

/** Fruit hanging from a clump's leaves, each on its stalk. */
export function addHangingFruit(buffers: LeafBuffers, spots: readonly FruitSpot[], clump: Clump, tree: PaintedTreeParameters, share = 1) {
    const paint = leafColours(tree, clump)

    planHangingFruit(spots, clump, tree).forEach((hang, index) => {
        if (share < FEW_FRUIT_BELOW && index % 3 !== 0) {
            return
        }

        addOneFruit(buffers, hang, tree, paint, share)
    })
}

/** A rounded little ball, as coconuts are, without a stalk. */
export function addFruitBall(buffers: LeafBuffers, centre: Vec3, radius: number, tree: PaintedTreeParameters, share = 1) {
    const rings = share < FRUIT_PLAIN_BELOW ? 3 : FRUIT_RINGS
    const sides = share < FRUIT_PLAIN_BELOW ? 4 : FRUIT_SIDES
    const {deep, light} = FRUIT_KINDS[tree.fruitKind]
    const low = new THREE.Color(deep)
    const high = new THREE.Color(light)
    const paint = new THREE.Color()
    const first = buffers.positions.length / 3

    for (let ring = 0; ring <= rings; ring++) {
        const polar = (ring / rings) * Math.PI

        for (let side = 0; side < sides; side++) {
            const azimuth = (side / sides) * Math.PI * 2
            const n: Vec3 = [Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth)]

            pushVertex(buffers, add(centre, n, radius), n, paint.copy(low).lerp(high, n[1] * 0.5 + 0.5))
        }
    }

    for (let ring = 0; ring < rings; ring++) {
        for (let side = 0; side < sides; side++) {
            const next = (side + 1) % sides
            const a = first + ring * sides + side
            const b = first + ring * sides + next
            const c = first + (ring + 1) * sides + next
            const d = first + (ring + 1) * sides + side

            buffers.indices.push(a, c, b, a, d, c)
        }
    }

    buffers.rigid.push(first, buffers.positions.length / 3)
}
