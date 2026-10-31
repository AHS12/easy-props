/**
 * One mass of leaves.
 *
 * Two layers of cards printed with brush dabs. The outer layer makes the broken
 * edge. The inner layer is larger, darker and deeper, and keeps the sky from
 * showing through the middle without a solid ball that could be seen inside.
 *
 * The important trick is the normals: every vertex is shaded as if it sat on
 * the smooth rounded clump, whichever way its card really faces. So hundreds
 * of cards take the light as one soft volume. Each card also gets both
 * windings over shared vertices, because a double-sided material would flip
 * the normals on the far face and undo all of that.
 */

import * as THREE from 'three'
import {createSeededRandom, hashSeed, randomRange} from '../../shared/random'
import {DAB_VARIANTS, dabCell} from '../../shared/dab-texture'
import {addClumpFruit, addStrands, leafGeometry} from './frond-mesh'
import {resolvePalette, type PaintedTreeParameters} from './parameters'
import {cross, normalize, perpendicularTo, type Clump, type TreePlan, type Vec3} from './plan'

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
/** How much of a shading normal comes from the whole crown, not the clump. */
const CROWN_SHARE = 0.25
/** How much comes from the clump as a whole rather than its own lobe. */
const CLUMP_SHARE = 0.4
/** How much a clump's own colour replaces the palette. */
const TINT_SHARE = 0.72
const INNER_SHARE = 0.55
/** The most a card may grow to cover for the cards a lighter level leaves out. */
const MAX_CARD_GROWTH = 2.2
/** A card this close to an axis marks the clump's extent, so every level keeps it. */
const OUTLINE_AXIS = 0.99
/** How far a grown card is pulled in, as a share of its growth, to keep its outer edge where it was. */
const GROWTH_PULL = 0.6
const CORNERS: readonly (readonly [number, number])[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
]

/** Lumps on the clump's surface, as a share of its radius, from a direction. */
function lumpAt(d: Vec3, seed: number): number {
    const a = seed * 0.37
    const b = seed * 0.71

    return (
        0.1 * Math.sin(d[0] * 3.1 + a) * Math.sin(d[1] * 2.7 + b) +
        0.08 * Math.sin(d[1] * 5.3 + b) * Math.sin(d[2] * 4.9 + a) +
        0.06 * Math.sin(d[2] * 7.7 + a + b) * Math.sin(d[0] * 6.1 + b)
    )
}

function insideLobe(lobe: {centre: Vec3; radius: number}, point: Vec3, flatten: number): boolean {
    return (
        Math.hypot(
            point[0] - lobe.centre[0],
            (point[1] - lobe.centre[1]) / flatten,
            point[2] - lobe.centre[2],
        ) <
        lobe.radius * 0.8
    )
}

function isInsideOther(clumps: readonly Clump[], self: Clump, world: Vec3): boolean {
    for (const clump of clumps) {
        if (clump === self) {
            continue
        }

        const dx = world[0] - clump.centre[0]
        const dy = (world[1] - clump.centre[1]) / clump.flatten
        const dz = world[2] - clump.centre[2]

        if (Math.hypot(dx, dy, dz) < clump.radius * 0.72) {
            return true
        }
    }

    return false
}

function extentOf(geometry: THREE.BufferGeometry): {min: number[]; max: number[]} {
    geometry.computeBoundingBox()

    const box = geometry.boundingBox!
    const extent = {min: box.min.toArray(), max: box.max.toArray()}

    geometry.dispose()

    return extent
}

/**
 * Stretches a lighter clump to the size of the full one, so losing the card at
 * an edge does not shrink the silhouette.
 */
function fitToExtent(geometry: THREE.BufferGeometry, extent: {min: number[]; max: number[]}) {
    geometry.computeBoundingBox()

    const box = geometry.boundingBox

    if (!box || box.isEmpty()) {
        return
    }

    const own = {min: box.min.toArray(), max: box.max.toArray()}
    const position = geometry.getAttribute('position')
    const fit = (axis: number, value: number) => {
        const span = own.max[axis] - own.min[axis]

        return span > 1e-6
            ? extent.min[axis] + ((value - own.min[axis]) / span) * (extent.max[axis] - extent.min[axis])
            : value
    }

    for (let i = 0; i < position.count; i++) {
        position.setXYZ(i, fit(0, position.getX(i)), fit(1, position.getY(i)), fit(2, position.getZ(i)))
    }

    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
}

/** Builds one clump, in its own space: its centre is the origin. */
export function buildClump(
    plan: TreePlan,
    clump: Clump,
    tree: PaintedTreeParameters,
    detail: number,
    share = 1,
): THREE.BufferGeometry {
    const random = createSeededRandom(clump.seed)
    const lumpSeed = (clump.seed % 1000) / 100
    const palette = resolvePalette(tree)

    const deep = new THREE.Color(palette.leafDeep)
    const mid = new THREE.Color(palette.leafMid)
    const light = new THREE.Color(palette.leafLight)

    if (clump.edit.colour) {
        const tint = new THREE.Color(clump.edit.colour)

        mid.lerp(tint, TINT_SHARE)
        light.lerp(tint.clone().lerp(new THREE.Color('#ffffff'), 0.55), TINT_SHARE)
        deep.lerp(tint.clone().multiplyScalar(0.45), TINT_SHARE)
    }

    const paint = new THREE.Color()

    // Each clump leans a little lighter or darker than the next, so a crown
    // reads as several masses rather than one colour.
    const clumpShift =
        (createSeededRandom(hashSeed(clump.seed, 3))() - 0.5) * 0.3 * tree.colourVariation

    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const uvs: number[] = []
    const indices: number[] = []

    // A clump is a few overlapping lobes, not one ball: a sphere with noise
    // still reads as a balloon, however broken its edge is.
    // A conifer's skirt is the exception: its one clean cone is the whole point.
    const lobeCount =
        clump.sag > 0 ? 1 : 1 + Math.round(Math.min(tree.lumpiness * (clump.edit.lumpinessScale ?? 1), 1) * 4)
    const lobes = Array.from({length: lobeCount}, (_, lobe) => {
        const azimuth = lobe * GOLDEN_ANGLE + random() * 6.28
        const lift = randomRange(random, -0.25, 0.7)
        const reach = lobe === 0 ? 0 : randomRange(random, 0.42, 0.62) * clump.radius

        return {
            centre: [
                Math.cos(azimuth) * reach,
                lift * reach * clump.flatten,
                Math.sin(azimuth) * reach,
            ] as Vec3,
            radius:
                clump.radius *
                (lobe === 0
                    ? lobeCount === 1
                        ? 1
                        : 0.68
                    : randomRange(random, 0.42, 0.6)),
        }
    })

    /** The rounded normal at a point of the clump, and its painted value. */
    const shade = (local: Vec3, lobe: Vec3): {n: Vec3; value: number} => {
        const whole = normalize([local[0], local[1] / clump.flatten, local[2]])
        const own = normalize([
            local[0] - lobe[0],
            (local[1] - lobe[1]) / clump.flatten,
            local[2] - lobe[2],
        ])
        const out = normalize([
            own[0] * (1 - CLUMP_SHARE) + whole[0] * CLUMP_SHARE,
            own[1] * (1 - CLUMP_SHARE) + whole[1] * CLUMP_SHARE,
            own[2] * (1 - CLUMP_SHARE) + whole[2] * CLUMP_SHARE,
        ])
        const crown = normalize([
            clump.base[0] + local[0] - plan.crownCentre[0],
            clump.base[1] + local[1] - plan.crownCentre[1],
            clump.base[2] + local[2] - plan.crownCentre[2],
        ])
        const n = normalize([
            out[0] * (1 - CROWN_SHARE) + crown[0] * CROWN_SHARE,
            out[1] * (1 - CROWN_SHARE) + crown[1] * CROWN_SHARE,
            out[2] * (1 - CROWN_SHARE) + crown[2] * CROWN_SHARE,
        ])
        const height =
            (clump.base[1] + local[1] - plan.crownCentre[1]) / Math.max(plan.crownRadius, 0.001)
        const depth = Math.min(1, Math.hypot(local[0], local[1], local[2]) / clump.radius)

        // Painted, not lit: the top of the clump, the top of the crown and the
        // outer skin are bright. The sun adds to this; it does not carry it.
        return {
            n,
            value:
                0.55 * (out[1] * 0.5 + 0.5) +
                0.3 * (height * 0.5 + 0.5) +
                0.3 * depth +
                clumpShift,
        }
    }

    const paintValue = (value: number) => {
        const v = Math.min(1, Math.max(0, value))

        if (v < 0.5) {
            paint.copy(deep).lerp(mid, v * 2)
        } else {
            paint.copy(mid).lerp(light, (v - 0.5) * 2)
        }

        colors.push(paint.r, paint.g, paint.b)
    }

    const cardSize = clump.radius * 0.46 * tree.leafSize * (clump.edit.leafSizeScale ?? 1)
    // Strands carry much of a weeping tree's leaves, so the clump above them can be lighter.
    const density = (0.9 + tree.fullness * (clump.edit.fullnessScale ?? 1) * 2.6) * detail * (1 - tree.strands * 0.45)

    // A lighter level keeps some of these same cards, each larger. It never
    // rerolls them, so stepping down a level only ever takes cards away.
    const growth = Math.min(1 / Math.sqrt(share), MAX_CARD_GROWTH)
    // And a grown card never reaches past the clump it stands in for.
    const limit = share < 1 ? extentOf(buildClump(plan, clump, tree, detail)) : null
    let cardNumber = 0

    const addCards = (
        lobe: {centre: Vec3; radius: number},
        count: number,
        depthLow: number,
        depthHigh: number,
        sizeScale: number,
        valueShift: number,
        thinUnderside: boolean,
    ) => {
        for (let card = 0; card < count; card++) {
            // Even coverage from a Fibonacci sphere, loosened by the seed.
            const y = 1 - ((card + 0.5) / count) * 2
            const ring = Math.sqrt(Math.max(0, 1 - y * y))
            const turn = card * GOLDEN_ANGLE + randomRange(random, -0.25, 0.25)
            const d = normalize([
                Math.cos(turn) * ring,
                y + randomRange(random, -0.05, 0.05),
                Math.sin(turn) * ring,
            ])
            // Every card draws the same numbers whether or not it is kept, so
            // one clump's coverage does not depend on its neighbours.
            const r = lobe.radius * (1 + lumpAt(d, lumpSeed)) * randomRange(random, depthLow, depthHigh)
            const facing = normalize([
                d[0] + randomRange(random, -0.7, 0.7),
                d[1] + randomRange(random, -0.7, 0.7),
                d[2] + randomRange(random, -0.7, 0.7),
            ])
            const roll = random() * Math.PI * 2
            const plainHalf = cardSize * 0.5 * sizeScale * randomRange(random, 0.8, 1.2)
            const half = plainHalf * growth
            const outline = Math.max(Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])) > OUTLINE_AXIS
            const dropped =
                share < 1 && !outline && createSeededRandom(hashSeed(clump.seed, 1000 + cardNumber++))() >= share
            const pull = (half - plainHalf) * GROWTH_PULL
            const pulled = r - pull
            const [u0, v0, size] = dabCell(Math.floor(random() * DAB_VARIANTS))
            const jitter = randomRange(random, -0.07, 0.07) * (0.5 + tree.colourVariation)
            const thinOut = random() < 0.5

            // The underside is thin: it is rarely seen, and its gaps are where
            // the limbs show through.
            if ((thinUnderside && d[1] < -0.6 && thinOut) || dropped) {
                continue
            }

            const rimX = lobe.centre[0] + d[0] * pulled
            const rimZ = lobe.centre[2] + d[2] * pulled
            const local: Vec3 = [
                rimX,
                lobe.centre[1] +
                    d[1] * (r * clump.flatten - pull) -
                    (clump.sag * (rimX * rimX + rimZ * rimZ)) / clump.radius,
                rimZ,
            ]

            // A card inside another lobe of this clump would never be seen.
            if (lobes.some((other) => other !== lobe && insideLobe(other, local, clump.flatten))) {
                continue
            }

            // A card buried in a neighbouring clump would only cost triangles.
            if (
                isInsideOther(plan.clumps, clump, [
                    clump.centre[0] + local[0],
                    clump.centre[1] + local[1],
                    clump.centre[2] + local[2],
                ])
            ) {
                continue
            }

            const axisA = perpendicularTo(facing)
            const axisB = cross(facing, axisA)
            const cos = Math.cos(roll) * half
            const sin = Math.sin(roll) * half
            const u: Vec3 = [
                axisA[0] * cos + axisB[0] * sin,
                axisA[1] * cos + axisB[1] * sin,
                axisA[2] * cos + axisB[2] * sin,
            ]
            const v: Vec3 = [
                axisB[0] * cos - axisA[0] * sin,
                axisB[1] * cos - axisA[1] * sin,
                axisB[2] * cos - axisA[2] * sin,
            ]
            const base = positions.length / 3

            for (const [a, b] of CORNERS) {
                const corner: [number, number, number] = [
                    local[0] + u[0] * a + v[0] * b,
                    local[1] + u[1] * a + v[1] * b,
                    local[2] + u[2] * a + v[2] * b,
                ]
                if (limit) {
                    for (let axis = 0; axis < 3; axis++) {
                        corner[axis as 0 | 1 | 2] = Math.min(limit.max[axis], Math.max(limit.min[axis], corner[axis]))
                    }
                }

                const {n, value} = shade(corner, lobe.centre)

                positions.push(corner[0], corner[1], corner[2])
                normals.push(n[0], n[1], n[2])
                uvs.push(u0 + ((a + 1) / 2) * size, v0 + ((b + 1) / 2) * size)
                paintValue(value + jitter + valueShift)
            }

            indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
            indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
        }
    }

    for (const lobe of lobes) {
        const count = Math.round(((4 * Math.PI * lobe.radius * lobe.radius) / (cardSize * cardSize)) * density)

        addCards(lobe, Math.round(count * INNER_SHARE), 0.42, 0.74, 1.35, -0.24, false)
        addCards(lobe, count, 0.84, 1.03, 1, 0, true)
    }

    const buffers = {positions, normals, colors, uvs, indices}

    if (tree.strands > 0) {
        addStrands(buffers, clump, tree, detail, share)
    }

    if (tree.fruitCount > 0) {
        addClumpFruit(buffers, clump, tree, share)
    }

    const geometry = leafGeometry(buffers)

    if (limit) {
        fitToExtent(geometry, limit)
    }

    return geometry
}
