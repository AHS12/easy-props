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
import {createSeededRandom, hashSeed, randomRange} from '../../shared/random'
import {addFruitBall, addOneFruit, appleRadius, FEW_FRUIT_BELOW, FRUIT_HANG_REACH, fruitRadius} from './fruit-mesh'
import {addLeaf, emptyLeafBuffers, leafColours, leafGeometry, pushBothSides, pushVertex, type LeafBuffers} from './leaf-buffers'
import {FRUIT_KINDS, type PaintedTreeParameters} from './parameters'
import {cross, normalize, type Clump, type TreePlan, type Vec3} from './plan'

/** A frond never reaches below this, so an old one rests above the ground. */
const GROUND_CLEARANCE = 0.08
const FROND_SEGMENTS = 12
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
/** The most a leaflet may widen to cover for the ones a lighter level leaves out. */
const MAX_LEAF_GROWTH = 3
/** A widened leaflet stops at about this many times the gap it has to cover. */
const WIDEST_OVER_GAP = 1.2

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
    // its share of them. The count is for the whole crown. Other fruit hangs
    // from there in bunches, on stalks.
    const index = plan.clumps.indexOf(clump)
    const fronds = Math.max(plan.clumps.length, 1)
    const fruitHere = share < FEW_FRUIT_BELOW ? 0 : Math.floor((tree.fruitCount + fronds - 1 - index) / fronds)
    const ball = fruitRadius(tree)
    const fruitRandom = createSeededRandom(hashSeed(clump.seed, 6))

    for (let fruit = 0; fruit < fruitHere; fruit++) {
        const out = ball * randomRange(fruitRandom, 1.3, 2.1)

        if (FRUIT_KINDS[tree.fruitKind].shape !== 'ball') {
            // Placed by an apple's size, as coconuts are, whatever the size of each piece.
            const reach = appleRadius(tree)
            const along: Vec3 = [Math.cos(clump.azimuth + fruit), 0, Math.sin(clump.azimuth + fruit)]
            const drop = reach * (0.5 + FRUIT_KINDS[tree.fruitKind].stalk * tree.fruitHang * FRUIT_HANG_REACH)
            // Clear of the trunk, which a thick palm's bunches would otherwise hang inside.
            const clear = Math.max(reach * 1.8, tree.trunkRadius * 1.2 + reach)

            addOneFruit(
                buffers,
                {
                    attach: [along[0] * reach * 0.5, -reach * 0.2, along[2] * reach * 0.5],
                    top: [along[0] * clear, -drop, along[2] * clear],
                    axis: [0, -1, 0],
                    side: 1,
                },
                tree,
                null,
                share,
            )
            continue
        }

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
