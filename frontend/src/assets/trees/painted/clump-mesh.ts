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
import {addStrands} from './frond-mesh'
import {addHangingFruit, type FruitSpot} from './fruit-mesh'
import {leafGeometry} from './leaf-buffers'
import {resolvePalette, type PaintedTreeParameters} from './parameters'
import {cross, normalize, perpendicularTo, type Clump, type TreePlan, type Vec3} from './plan'
import {weatherPaint} from '../../shared/weather'

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
/** Fruit hangs from cards on the rim and the lower half, but not the thinned underside. */
const FRUIT_HIGHEST = 0.6
/**
 * Broad leaves: the share of outer cards that become sprays, how many leaves a
 * spray has, how far they droop, and how long they are against a card.
 */
const SPRAY_SHARE = 0.4
const SPRAY_LEAVES = 5
const SPRAY_DROOP = 0.8
const SPRAY_LENGTH = 1.4
/** The most a spray grows on a lighter level: real leaves grown as far as cards would look like spikes. */
const MAX_SPRAY_GROWTH = 1.3
/** Below this share of its detail a Broad clump is plain cards: far off, a leaf's shape can't be seen, and the few sprays left would be stretched to fill it. */
const SPRAYS_FROM = 0.3
const FRUIT_LOWEST = -0.6
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

type Extent = {min: number[]; max: number[]}

/** The box around a geometry's first `count` vertices. */
function boxOf(geometry: THREE.BufferGeometry, count: number): Extent | null {
    const position = geometry.getAttribute('position')
    const box = new THREE.Box3()
    const point = new THREE.Vector3()

    for (let i = 0; i < Math.min(count, position.count); i++) {
        box.expandByPoint(point.fromBufferAttribute(position, i))
    }

    return box.isEmpty() ? null : {min: box.min.toArray(), max: box.max.toArray()}
}

/**
 * Stretches a lighter clump's leaves to the size of the full one's, so losing
 * the card at an edge does not shrink the silhouette. Fruit, after the first
 * `count` vertices, stays where the full clump has it.
 */
function fitToExtent(geometry: THREE.BufferGeometry, extent: Extent, count: number) {
    const own = boxOf(geometry, count)

    if (!own) {
        return
    }

    const position = geometry.getAttribute('position')
    const fit = (axis: number, value: number) => {
        const span = own.max[axis] - own.min[axis]

        return span > 1e-6
            ? extent.min[axis] + ((value - own.min[axis]) / span) * (extent.max[axis] - extent.min[axis])
            : value
    }

    for (let i = 0; i < Math.min(count, position.count); i++) {
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
    if (share >= 1) {
        return clumpWithFruitSpots(plan, clump, tree, detail, 1, null).geometry
    }

    // A lighter level is fitted to the full clump, and hangs fruit where it does.
    const full = clumpWithFruitSpots(plan, clump, tree, detail, 1, null)
    const extent = boxOf(full.geometry, full.leafCount)

    full.geometry.dispose()

    const built = clumpWithFruitSpots(plan, clump, tree, detail, share, extent && {extent, spots: full.spots})

    if (extent) {
        fitToExtent(built.geometry, extent, built.leafCount)
    }

    return built.geometry
}

/** A clump, how many of its vertices are leaves, and where its full self has cards to hold fruit. */
export function clumpWithFruitSpots(
    plan: TreePlan,
    clump: Clump,
    tree: PaintedTreeParameters,
    detail: number,
    share: number,
    full: {extent: Extent; spots: readonly FruitSpot[]} | null,
): {geometry: THREE.BufferGeometry; leafCount: number; spots: readonly FruitSpot[]} {
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

    /** `up` is how far the clump faces the sky here, for snow, which settles on its upper half. */
    const paintValue = (value: number, up: number, blotch: number) => {
        const v = Math.min(1, Math.max(0, value))

        if (v < 0.5) {
            paint.copy(deep).lerp(mid, v * 2)
        } else {
            paint.copy(mid).lerp(light, (v - 0.5) * 2)
        }

        weatherPaint(paint, up, tree, blotch)
        colors.push(paint.r, paint.g, paint.b)
    }

    const cardSize = clump.radius * 0.46 * tree.leafSize * (clump.edit.leafSizeScale ?? 1)
    // Strands carry much of a weeping tree's leaves, so the clump above them can be lighter.
    const density = (0.9 + tree.fullness * (clump.edit.fullnessScale ?? 1) * 2.6) * detail * (1 - tree.strands * 0.45)

    // A lighter level keeps some of these same cards, each larger. It never
    // rerolls them, so stepping down a level only ever takes cards away.
    const growth = Math.min(1 / Math.sqrt(share), MAX_CARD_GROWTH)
    // And a grown card never reaches past the clump it stands in for.
    const limit = full?.extent ?? null
    const spots: FruitSpot[] = []
    let cardNumber = 0

    /** Keeps a point inside the full clump, as every card's corners are. */
    const clamp = (point: [number, number, number]) => {
        if (limit) {
            for (let axis = 0; axis < 3; axis++) {
                point[axis as 0 | 1 | 2] = Math.min(limit.max[axis], Math.max(limit.min[axis], point[axis]))
            }
        }

        return point
    }

    /**
     * A spray of real leaves at a twig's end, fanned out round `out` and
     * drooping, in place of a card. Shaded as the cards are, so it takes the
     * light with the rest of the clump. It sits on the solid middle of a dab,
     * and takes no random numbers, so a dropped spray never moves the next.
     */
    const addSpray = (
        at: Vec3,
        out: Vec3,
        roll: number,
        half: number,
        lobeCentre: Vec3,
        [u0, v0, size]: readonly [number, number, number],
        jitter: number,
    ) => {
        const axisA = perpendicularTo(out)
        const axisB = cross(out, axisA)
        const leaves = share < 0.5 ? SPRAY_LEAVES - 1 : SPRAY_LEAVES
        const u = u0 + size / 2
        const v = v0 + size / 2

        for (let leaf = 0; leaf < leaves; leaf++) {
            const angle = roll + (leaf / leaves) * Math.PI * 2 + Math.sin(roll * 5 + leaf * 2.3) * 0.35
            const fan: Vec3 = [
                axisA[0] * Math.cos(angle) + axisB[0] * Math.sin(angle),
                axisA[1] * Math.cos(angle) + axisB[1] * Math.sin(angle),
                axisA[2] * Math.cos(angle) + axisB[2] * Math.sin(angle),
            ]
            const along = normalize([fan[0] + out[0] * 0.35, fan[1] + out[1] * 0.35 - SPRAY_DROOP, fan[2] + out[2] * 0.35])
            const length = half * SPRAY_LENGTH * (0.85 + 0.15 * Math.sin(roll * 3 + leaf))
            const across = normalize(cross(along, out))
            const width = length * 0.15
            const middle: Vec3 = [at[0] + along[0] * length * 0.45, at[1] + along[1] * length * 0.45, at[2] + along[2] * length * 0.45]
            const corners: [number, number, number][] = [
                [at[0], at[1], at[2]],
                [middle[0] + across[0] * width, middle[1] + across[1] * width, middle[2] + across[2] * width],
                // The tip hangs a little lower than the leaf points, as a heavy leaf does.
                [at[0] + along[0] * length, at[1] + along[1] * length - length * 0.15, at[2] + along[2] * length],
                [middle[0] - across[0] * width, middle[1] - across[1] * width, middle[2] - across[2] * width],
            ]
            // Darker at the stalk, lighter towards the tip, and lightest along the edges, for the gloss.
            const lift = [-0.14, 0.06, 0.1, 0.06]
            const base = positions.length / 3

            corners.forEach((corner, index) => {
                clamp(corner)

                const {n, value} = shade(corner, lobeCentre)

                positions.push(corner[0], corner[1], corner[2])
                normals.push(n[0], n[1], n[2])
                uvs.push(u, v)
                paintValue(value + jitter + lift[index], n[1], jitter * 8)
            })

            indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
            indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
        }
    }

    const addCards = (
        lobe: {centre: Vec3; radius: number},
        count: number,
        depthLow: number,
        depthHigh: number,
        sizeScale: number,
        valueShift: number,
        thinUnderside: boolean,
        holdsFruit: boolean,
        sprays = false,
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

            if (holdsFruit && d[1] <= FRUIT_HIGHEST && d[1] >= FRUIT_LOWEST) {
                spots.push({
                    point: local,
                    inward: normalize([lobe.centre[0] - local[0], lobe.centre[1] - local[1], lobe.centre[2] - local[2]]),
                })
            }

            if (sprays) {
                addSpray(local, d, roll, plainHalf * Math.min(growth, MAX_SPRAY_GROWTH), lobe.centre, dabCell(0), jitter)
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
                // The inner cards are under the outer ones, so they hold less snow.
                paintValue(value + jitter + valueShift, n[1] + valueShift * 1.5, jitter * 8)
            }

            indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
            indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
        }
    }

    for (const lobe of lobes) {
        const count = Math.round(((4 * Math.PI * lobe.radius * lobe.radius) / (cardSize * cardSize)) * density)

        addCards(lobe, Math.round(count * INNER_SHARE), 0.42, 0.74, 1.35, -0.24, false, false)
        if (tree.leafStyle === 'broad' && share >= SPRAYS_FROM) {
            // One spray covers more than a card, so fewer of them.
            addCards(lobe, Math.round(count * SPRAY_SHARE), 0.84, 1.03, 1, 0, true, true, true)
        } else {
            addCards(lobe, count, 0.84, 1.03, 1, 0, true, true)
        }
    }

    const buffers = {positions, normals, colors, uvs, indices, rigid: [] as number[]}

    if (tree.strands > 0) {
        addStrands(buffers, clump, tree, detail, share)
    }

    const leafCount = positions.length / 3

    if (tree.fruitCount > 0) {
        addHangingFruit(buffers, full?.spots ?? spots, clump, tree, share)
    }

    return {geometry: leafGeometry(buffers), leafCount, spots}
}
