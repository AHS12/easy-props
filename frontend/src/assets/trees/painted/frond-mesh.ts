/**
 * Palm fronds, hanging strands and fruit: leaves with a shape of their own.
 *
 * A clump is many cards taking the light as one volume. A frond is the opposite:
 * its outline is what you recognise, so it is built from real leaf shapes and
 * needs no cut-out. Like a clump it keeps its shading normals rounded and carries
 * both windings over shared vertices, and it uses the same material, by sampling
 * the solid middle of the dab texture.
 */

import * as THREE from 'three'
import {weatherColours} from '../../shared/weather'
import {RIGID_ATTRIBUTE} from '../../shared/generator-types'
import {createSeededRandom, hashSeed, randomRange} from '../../shared/random'
import {FRUIT_COLOURS, resolvePalette, type PaintedTreeParameters} from './parameters'
import {cross, normalize, type Clump, type TreePlan, type Vec3} from './plan'

/** The middle of the first dab, which is solid at every mip level. */
const SOLID_UV = 0.25
/** A frond never reaches below this, so an old one rests above the ground. */
const GROUND_CLEARANCE = 0.08
const FROND_SEGMENTS = 12
const FRUIT_RINGS = 4
const FRUIT_SIDES = 6
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
/** The most a leaflet may widen to cover for the ones a lighter level leaves out. */
const MAX_LEAF_GROWTH = 3
/** Below this share of its detail, a level keeps one fruit in three, for the colour. */
const FEW_FRUIT_BELOW = 0.2
/** Below this share, fruit is a plainer ball. */
const FRUIT_PLAIN_BELOW = 0.7
/** A widened leaflet stops at about this many times the gap it has to cover. */
const WIDEST_OVER_GAP = 1.2
/**
 * How far a hanging fruit sits out from the middle of its leaf card, and below
 * it, as shares of its radius. The cards are far bigger than the fruit, so one
 * pushed in behind its card would be hidden.
 */
const FRUIT_OUT = 0.7
const FRUIT_DROP = 0.4
/** Each fruit is the best spread of this many spots tried. */
const FRUIT_TRIES = 6
const STALK_COLOUR = new THREE.Color('#5b4a2c')

export interface LeafBuffers {
    readonly positions: number[]
    readonly normals: number[]
    readonly colors: number[]
    readonly uvs: number[]
    readonly indices: number[]
    /** Where fruit starts and ends among the vertices, in pairs: it sways whole. */
    readonly rigid: number[]
}

export const emptyLeafBuffers = (): LeafBuffers => ({positions: [], normals: [], colors: [], uvs: [], indices: [], rigid: []})

export function leafGeometry({positions, normals, colors, uvs, indices, rigid}: LeafBuffers): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)

    if (rigid.length > 0) {
        const marks = new Float32Array(positions.length / 3)

        for (let pair = 0; pair < rigid.length; pair += 2) {
            marks.fill(1, rigid[pair], rigid[pair + 1])
        }

        geometry.setAttribute(RIGID_ATTRIBUTE, new THREE.BufferAttribute(marks, 1))
    }

    geometry.computeBoundingSphere()

    return geometry
}

/** The three colours a leaf shape is painted from, with its clump's own tint. */
export function leafColours(tree: PaintedTreeParameters, clump: Clump) {
    const palette = resolvePalette(tree)
    const deep = new THREE.Color(palette.leafDeep)
    const mid = new THREE.Color(palette.leafMid)
    const light = new THREE.Color(palette.leafLight)

    if (clump.edit.colour) {
        const tint = new THREE.Color(clump.edit.colour)

        mid.lerp(tint, 0.72)
        light.lerp(tint.clone().lerp(new THREE.Color('#ffffff'), 0.55), 0.72)
        deep.lerp(tint.clone().multiplyScalar(0.45), 0.72)
    }

    const paint = new THREE.Color()

    return (value: number): THREE.Color => {
        const v = Math.min(1, Math.max(0, value))

        return v < 0.5 ? paint.copy(deep).lerp(mid, v * 2) : paint.copy(mid).lerp(light, (v - 0.5) * 2)
    }
}

function pushVertex(buffers: LeafBuffers, point: Vec3, normal: Vec3, colour: THREE.Color): number {
    const index = buffers.positions.length / 3

    buffers.positions.push(point[0], point[1], point[2])
    buffers.normals.push(normal[0], normal[1], normal[2])
    buffers.colors.push(colour.r, colour.g, colour.b)
    buffers.uvs.push(SOLID_UV, SOLID_UV)

    return index
}

/** A triangle seen from both sides, over the same vertices. */
function pushBothSides(buffers: LeafBuffers, a: number, b: number, c: number) {
    buffers.indices.push(a, b, c, a, c, b)
}

/** One leaf: a kite from `base` to `tip`, widest a third of the way along. */
export function addLeaf(
    buffers: LeafBuffers,
    base: Vec3,
    tip: Vec3,
    across: Vec3,
    width: number,
    normal: Vec3,
    paint: (value: number) => THREE.Color,
    value: number,
) {
    const at = (share: number, side: number): Vec3 => [
        base[0] + (tip[0] - base[0]) * share + across[0] * side,
        base[1] + (tip[1] - base[1]) * share + across[1] * side,
        base[2] + (tip[2] - base[2]) * share + across[2] * side,
    ]
    const half = width * 0.5
    const a = pushVertex(buffers, base, normal, paint(value - 0.2))
    const b = pushVertex(buffers, at(0.34, half), normal, paint(value))
    const c = pushVertex(buffers, tip, normal, paint(value + 0.2))
    const d = pushVertex(buffers, at(0.34, -half), normal, paint(value))

    pushBothSides(buffers, a, b, c)
    pushBothSides(buffers, a, c, d)
}

interface RachisPoint {
    readonly point: Vec3
    readonly forward: Vec3
    readonly side: Vec3
    readonly up: Vec3
}

/** The stem of a frond: it leaves at its elevation and arches over under its own weight. */
function frondPath(clump: Clump, tree: PaintedTreeParameters): RachisPoint[] {
    const arch = (0.6 + tree.droop * 2.4) * clump.flatten
    const floor = GROUND_CLEARANCE - clump.base[1]
    const step = clump.radius / FROND_SEGMENTS
    const horizontal: Vec3 = [Math.cos(clump.azimuth), 0, Math.sin(clump.azimuth)]
    const side: Vec3 = [-horizontal[2], 0, horizontal[0]]
    const path: RachisPoint[] = []
    let at: Vec3 = [0, 0, 0]

    for (let segment = 0; segment <= FROND_SEGMENTS; segment++) {
        const t = segment / FROND_SEGMENTS
        const angle = clump.elevation - arch * Math.pow(t, 1.3)
        const forward = normalize([
            horizontal[0] * Math.cos(angle),
            Math.sin(angle),
            horizontal[2] * Math.cos(angle),
        ])

        path.push({point: at, forward, side, up: cross(side, forward)})
        at = [at[0] + forward[0] * step, Math.max(at[1] + forward[1] * step, floor), at[2] + forward[2] * step]
    }

    return path
}

function sampleFrond(path: readonly RachisPoint[], t: number): RachisPoint {
    const position = Math.min(Math.max(t, 0), 1) * (path.length - 1)
    const index = Math.min(Math.floor(position), path.length - 2)
    const f = position - index
    const a = path[index]
    const b = path[index + 1]

    return {
        ...a,
        point: [
            a.point[0] + (b.point[0] - a.point[0]) * f,
            a.point[1] + (b.point[1] - a.point[1]) * f,
            a.point[2] + (b.point[2] - a.point[2]) * f,
        ],
    }
}

/** Rounded the way a clump is: leaves take the light from above and from the outside. */
function leafNormal(point: RachisPoint, sideSign: number): Vec3 {
    return normalize([
        point.up[0] * 0.8 + point.side[0] * sideSign * 0.35 + point.forward[0] * 0.2,
        point.up[1] * 0.8 + 0.25,
        point.up[2] * 0.8 + point.side[2] * sideSign * 0.35 + point.forward[2] * 0.2,
    ])
}

function addStem(
    buffers: LeafBuffers,
    path: readonly RachisPoint[],
    radius: number,
    paint: (value: number) => THREE.Color,
    share: number,
) {
    const stride = share < 0.25 ? 6 : share < 0.6 ? 4 : 2

    for (let ring = 0; ring < path.length - 1; ring += stride) {
        const a = path[ring]
        const b = path[Math.min(ring + stride, path.length - 1)]
        const ra = radius * (1 - ring / path.length)
        const rb = radius * (1 - (ring + stride) / path.length)
        const corners = [0, 1, 2, 3].map((corner) => {
            const from = corner < 2 ? a : b
            const r = corner < 2 ? ra : rb
            const sign = corner === 0 || corner === 3 ? 1 : -1

            return pushVertex(
                buffers,
                [
                    from.point[0] + from.side[0] * r * sign,
                    from.point[1] + from.side[1] * r * sign,
                    from.point[2] + from.side[2] * r * sign,
                ],
                from.up,
                paint(0.2),
            )
        })

        pushBothSides(buffers, corners[0], corners[1], corners[2])
        pushBothSides(buffers, corners[0], corners[2], corners[3])
    }
}

/**
 * A leaflet `widen` times as wide, to cover for the ones a lighter level leaves
 * out, but never much wider than the gap between it and the next.
 */
function widened(width: number, widen: number, gap: number): number {
    return widen > 1 ? Math.max(width, Math.min(width * widen, gap * WIDEST_OVER_GAP)) : width
}

/** Leaflets in pairs down the stem, longest a third of the way along. */
function addFeather(
    buffers: LeafBuffers,
    path: readonly RachisPoint[],
    clump: Clump,
    tree: PaintedTreeParameters,
    detail: number,
    paint: (value: number) => THREE.Color,
    random: () => number,
    share: number,
    widen: number,
) {
    const count = Math.max(2, Math.round((12 + tree.fullness * (clump.edit.fullnessScale ?? 1) * 24) * detail * share))
    const width = widened(clump.radius * 0.05 * tree.leafSize * (clump.edit.leafSizeScale ?? 1) * Math.min(1 / share, MAX_LEAF_GROWTH), widen, clump.radius / count)

    for (let pair = 0; pair < count; pair++) {
        const t = 0.1 + (pair / count) * 0.9
        const at = sampleFrond(path, t)
        const reach = clump.radius * 0.3 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.7) + clump.radius * 0.03

        for (const sign of [1, -1]) {
            const tip: Vec3 = [
                at.point[0] + (at.side[0] * sign * 0.8 + at.forward[0] * 0.55 - at.up[0] * 0.3) * reach,
                at.point[1] + (at.side[1] * sign * 0.8 + at.forward[1] * 0.55 - at.up[1] * 0.3 - 0.25) * reach,
                at.point[2] + (at.side[2] * sign * 0.8 + at.forward[2] * 0.55 - at.up[2] * 0.3) * reach,
            ]

            addLeaf(
                buffers,
                at.point,
                tip,
                at.forward,
                width,
                leafNormal(at, sign),
                paint,
                0.3 + t * 0.35 + randomRange(random, -0.1, 0.1) * (0.5 + tree.colourVariation),
            )
        }
    }
}

/** Spokes at the end of a bare stalk, spread like an open hand. */
function addFan(
    buffers: LeafBuffers,
    path: readonly RachisPoint[],
    clump: Clump,
    tree: PaintedTreeParameters,
    detail: number,
    paint: (value: number) => THREE.Color,
    random: () => number,
    share: number,
    widen: number,
) {
    const count = Math.max(3, Math.round((14 + tree.fullness * (clump.edit.fullnessScale ?? 1) * 16) * detail * share))
    const at = sampleFrond(path, 0.55)
    const reach = clump.radius * 0.55
    const width = widened(clump.radius * 0.13 * tree.leafSize * (clump.edit.leafSizeScale ?? 1) * Math.min(1 / share, MAX_LEAF_GROWTH), widen, (reach * Math.PI * 1.35) / count)

    for (let spoke = 0; spoke < count; spoke++) {
        const share = spoke / Math.max(count - 1, 1)
        const angle = (share - 0.5) * Math.PI * 1.35
        const sideways = Math.sin(angle)
        const along = Math.cos(angle)
        const fall = 0.15 + Math.abs(sideways) * 0.35
        const tip: Vec3 = [
            at.point[0] + (at.side[0] * sideways + at.forward[0] * along) * reach,
            at.point[1] + (at.side[1] * sideways + at.forward[1] * along - fall) * reach,
            at.point[2] + (at.side[2] * sideways + at.forward[2] * along) * reach,
        ]
        const across = normalize(cross(at.up, [tip[0] - at.point[0], tip[1] - at.point[1], tip[2] - at.point[2]]))

        addLeaf(
            buffers,
            at.point,
            tip,
            across,
            width,
            leafNormal(at, sideways),
            paint,
            0.45 + randomRange(random, -0.12, 0.12) * (0.5 + tree.colourVariation) + (spoke % 2) * 0.08,
        )
    }
}

/** One broad leaf running the length of the stem, as on a banana. */
function addBlade(
    buffers: LeafBuffers,
    path: readonly RachisPoint[],
    clump: Clump,
    tree: PaintedTreeParameters,
    paint: (value: number) => THREE.Color,
    random: () => number,
    share: number,
) {
    const start = 2
    const stride = share < 0.25 ? 4 : share < 0.6 ? 2 : 1
    const halfWidth = clump.radius * 0.17 * tree.leafSize * (clump.edit.leafSizeScale ?? 1)
    let previous: {left: number; middle: number; right: number} | null = null

    for (let ring = start; ring < path.length; ring = ring === path.length - 1 ? path.length : Math.min(ring + stride, path.length - 1)) {
        const at = path[ring]
        const t = (ring - start) / (path.length - 1 - start)
        const wide = halfWidth * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.6) + 0.001
        const value = 0.42 + t * 0.2 + randomRange(random, -0.05, 0.05) * (0.5 + tree.colourVariation)
        const edge = (sign: number): Vec3 => [
            at.point[0] + at.side[0] * sign * wide - at.up[0] * wide * 0.3,
            at.point[1] + at.side[1] * sign * wide - at.up[1] * wide * 0.3,
            at.point[2] + at.side[2] * sign * wide - at.up[2] * wide * 0.3,
        ]
        const left = pushVertex(buffers, edge(1), leafNormal(at, 1), paint(value + 0.14))
        const middle = pushVertex(buffers, at.point, leafNormal(at, 0), paint(value - 0.16))
        const right = pushVertex(buffers, edge(-1), leafNormal(at, -1), paint(value + 0.14))

        if (previous) {
            pushBothSides(buffers, previous.left, left, middle)
            pushBothSides(buffers, previous.left, middle, previous.middle)
            pushBothSides(buffers, previous.middle, middle, right)
            pushBothSides(buffers, previous.middle, right, previous.right)
        }

        previous = {left, middle, right}
    }
}

/** A rounded little ball. */
export function addFruitBall(buffers: LeafBuffers, centre: Vec3, radius: number, tree: PaintedTreeParameters, share = 1) {
    const rings = share < FRUIT_PLAIN_BELOW ? 3 : FRUIT_RINGS
    const sides = share < FRUIT_PLAIN_BELOW ? 4 : FRUIT_SIDES
    const {deep, light} = FRUIT_COLOURS[tree.fruitKind]
    const low = new THREE.Color(deep)
    const high = new THREE.Color(light)
    const paint = new THREE.Color()
    const first = buffers.positions.length / 3

    for (let ring = 0; ring <= rings; ring++) {
        const polar = (ring / rings) * Math.PI

        for (let side = 0; side < sides; side++) {
            const azimuth = (side / sides) * Math.PI * 2
            const n: Vec3 = [Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth)]

            pushVertex(
                buffers,
                [centre[0] + n[0] * radius, centre[1] + n[1] * radius, centre[2] + n[2] * radius],
                n,
                paint.copy(low).lerp(high, n[1] * 0.5 + 0.5),
            )
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

/** How big a fruit is on a tree this tall. */
export const fruitRadius = (tree: PaintedTreeParameters) => (0.06 + tree.height * 0.008) * tree.fruitSize

/** Curtains of leaves falling from the rim and underside of a clump. */
export function addStrands(buffers: LeafBuffers, clump: Clump, tree: PaintedTreeParameters, detail: number, share = 1) {
    const random = createSeededRandom(hashSeed(clump.seed, 5))
    const paint = leafColours(tree, clump)
    const count = Math.round(tree.strands * 30 * detail * Math.sqrt(share))
    const fall = Math.max(clump.base[1] - GROUND_CLEARANCE, 0.1) * tree.strandLength
    const width = clump.radius * 0.11 * tree.leafSize * (clump.edit.leafSizeScale ?? 1) * Math.min(1 / share, MAX_LEAF_GROWTH)

    for (let strand = 0; strand < count; strand++) {
        const azimuth = strand * GOLDEN_ANGLE + randomRange(random, -0.3, 0.3)
        const out = Math.sqrt(randomRange(random, 0.12, 1)) * clump.radius * 0.95
        const start: Vec3 = [
            Math.cos(azimuth) * out,
            -clump.radius * clump.flatten * Math.sqrt(Math.max(1 - (out / clump.radius) ** 2, 0)) * 0.7,
            Math.sin(azimuth) * out,
        ]
        const length = fall * randomRange(random, 0.7, 1)
        const leaves = Math.max(share < 1 ? 2 : 5, Math.round((length / (width * 1.5)) * 0.5))
        const sway = randomRange(random, 0.02, 0.07) * length
        const phase = random() * Math.PI * 2
        const outward = normalize([Math.cos(azimuth), 0.5, Math.sin(azimuth)])
        const across: Vec3 = [-Math.sin(azimuth), 0, Math.cos(azimuth)]
        const shift = randomRange(random, -0.08, 0.08) * (0.5 + tree.colourVariation)
        const point = (t: number): Vec3 => [
            start[0] + Math.cos(azimuth) * sway * Math.sin(t * 4 + phase),
            start[1] - length * t,
            start[2] + Math.sin(azimuth) * sway * Math.sin(t * 4 + phase),
        ]

        for (let leaf = 0; leaf < leaves; leaf++) {
            const t = leaf / leaves
            const flip = leaf % 2 === 0 ? 1 : -1
            const base = point(t)
            const tip = point(t + 1.4 / leaves)

            addLeaf(
                buffers,
                base,
                [tip[0] + across[0] * width * flip * 0.6, tip[1], tip[2] + across[2] * width * flip * 0.6],
                across,
                width * (1 - t * 0.45),
                outward,
                paint,
                0.62 - t * 0.35 + shift,
            )
        }
    }
}

/** Where a leaf card holds fruit, and which way is into its clump from there. */
export interface FruitSpot {
    readonly point: Vec3
    readonly inward: Vec3
}

/** A thin stalk from `from` up to `to`, swaying whole with its fruit. */
function addStalk(buffers: LeafBuffers, from: Vec3, to: Vec3, radius: number, sides: number) {
    const along = normalize([to[0] - from[0], to[1] - from[1], to[2] - from[2]])
    const axisA = normalize(cross(along, Math.abs(along[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]))
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

            pushVertex(buffers, [end[0] + n[0] * radius, end[1] + n[1] * radius, end[2] + n[2] * radius], n, STALK_COLOUR)
        }
    }

    for (let side = 0; side < sides; side++) {
        const next = (side + 1) % sides

        buffers.indices.push(first + side, first + sides + next, first + next, first + side, first + sides + side, first + sides + next)
    }
}

/**
 * Fruit hanging from the leaves, each on a short stalk up into them.
 *
 * The spots are where the full clump's cards really are, so a lighter level
 * puts what fruit it keeps in the same places.
 */
export function addHangingFruit(buffers: LeafBuffers, spots: readonly FruitSpot[], clump: Clump, tree: PaintedTreeParameters, share = 1) {
    if (spots.length === 0) {
        return
    }

    const random = createSeededRandom(hashSeed(clump.seed, 6))
    const radius = fruitRadius(tree)
    const placed: Vec3[] = []

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

        if (share < FEW_FRUIT_BELOW && index % 3 !== 0) {
            continue
        }

        const {point, inward} = best
        const centre: Vec3 = [
            point[0] - inward[0] * radius * FRUIT_OUT,
            point[1] - inward[1] * radius * FRUIT_OUT - radius * FRUIT_DROP,
            point[2] - inward[2] * radius * FRUIT_OUT,
        ]
        const first = buffers.positions.length / 3

        addStalk(
            buffers,
            [centre[0], centre[1] + radius * 0.8, centre[2]],
            [point[0] + inward[0] * radius * 0.6, point[1] + radius * 0.7, point[2] + inward[2] * radius * 0.6],
            Math.max(radius * 0.09, 0.006),
            share < FRUIT_PLAIN_BELOW ? 3 : 4,
        )
        addFruitBall(buffers, centre, radius, tree, share)
        // The ball marked itself; the stalk sways with it.
        buffers.rigid.splice(buffers.rigid.length - 2, 1, first)
    }
}

/** Builds one frond, in its own space: where it leaves the trunk is the origin. */
export function buildFrond(
    plan: TreePlan,
    clump: Clump,
    tree: PaintedTreeParameters,
    detail: number,
    share = 1,
    widen = 1,
): THREE.BufferGeometry {
    const buffers = emptyLeafBuffers()
    const random = createSeededRandom(clump.seed)
    const paint = leafColours(tree, clump)
    const path = frondPath(clump, tree)

    addStem(buffers, path, Math.max(clump.radius * 0.016, 0.012), paint, share)

    if (tree.frondStyle === 'fan') {
        addFan(buffers, path, clump, tree, detail, paint, random, share, widen)
    } else if (tree.frondStyle === 'blade') {
        addBlade(buffers, path, clump, tree, paint, random, share)
    } else {
        addFeather(buffers, path, clump, tree, detail, paint, random, share, widen)
    }

    weatherColours(buffers.colors, buffers.normals, tree)

    // Coconuts sit in a ring where the fronds meet the trunk, so a frond carries
    // its share of them. The count is for the whole crown.
    const index = plan.clumps.indexOf(clump)
    const fronds = Math.max(plan.clumps.length, 1)
    const fruitHere = share < FEW_FRUIT_BELOW ? 0 : Math.floor((tree.fruitCount + fronds - 1 - index) / fronds)
    const ball = fruitRadius(tree)
    const fruitRandom = createSeededRandom(hashSeed(clump.seed, 6))

    for (let fruit = 0; fruit < fruitHere; fruit++) {
        const out = ball * randomRange(fruitRandom, 1.3, 2.1)

        addFruitBall(
            buffers,
            [
                Math.cos(clump.azimuth + fruit) * out,
                -ball * randomRange(fruitRandom, 0.4, 1.6),
                Math.sin(clump.azimuth + fruit) * out,
            ],
            ball,
            tree,
            share,
        )
    }

    return leafGeometry(buffers)
}
