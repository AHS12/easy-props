/**
 * Pieces cut from a tree: its stump, a log of its trunk, a fallen branch, and its
 * leaves on the ground.
 *
 * Wood pieces are cuts of the tree's own plan, so they keep its bark, colours and
 * shape. Each is sculpted where it grew, with flat cuts where a saw went through,
 * then laid where it ends up. Light, moss and snow are painted for where it ends up,
 * so moss sits on top of a fallen log rather than on the side that was up.
 */

import * as THREE from 'three'
import {DAB_VARIANTS, dabCell} from '../../shared/dab-texture'
import {createSeededRandom, hashSeed, randomRange} from '../../shared/random'
import {weatherColours, weatherPaint} from '../../shared/weather'
import {buildBark, HEARTWOOD, prepareBark, type PieceCut} from '../painted/bark-mesh'
import {resolvePalette, type PaintedTreeParameters} from '../painted/parameters'
import {distanceAlong, growsOn, isHeavyLimb, isRoot, lengthOf, pointAlong, shortened} from '../painted/limb-path'
import {normalize, planPaintedTree, type Limb, type TreePlan, type Vec3} from '../painted/plan'
import type {WoodCut} from '../painted/wood-field'

export type PieceKind = 'stump' | 'log' | 'branch' | 'litter'

/** Where the log starts above the ground, against the trunk's radius: above the flare. */
const LOG_BASE = 0.9
/** How far a snapped stub stands out of a log's bark, against its own thickness. */
const STUB_LENGTH = 0.9
/** How far into the ground a log or branch settles, against its thickness. */
const SETTLE = 0.12
/** How far from the trunk a branch is broken off, against the trunk's radius there. */
const BREAK_OUT = 1.15

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** A frame a piece is laid down in: its first axis runs along the ground, its second is up. */
interface Frame {
    readonly along: Vec3
    readonly up: Vec3
    readonly across: Vec3
}

const orientIn = (frame: Frame) => (v: Vec3): Vec3 => [dot(v, frame.along), dot(v, frame.up), dot(v, frame.across)]

/** A frame whose first axis is `along`, turned `roll` about it from as near upright as it goes. */
function lyingFrame(along: Vec3, roll: number): Frame {
    const a = normalize(along)
    const reference: Vec3 = Math.abs(a[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]
    const flat = normalize(sub(reference, [a[0] * dot(reference, a), a[1] * dot(reference, a), a[2] * dot(reference, a)]))
    const side = cross(a, flat)
    const up = normalize([
        flat[0] * Math.cos(roll) + side[0] * Math.sin(roll),
        flat[1] * Math.cos(roll) + side[1] * Math.sin(roll),
        flat[2] * Math.cos(roll) + side[2] * Math.sin(roll),
    ])

    return {along: a, up, across: cross(a, up)}
}

/** The distance along a limb to the point nearest a height, for a trunk that rises. */
function distanceToHeight(limb: Limb, height: number): number {
    let run = 0

    for (let index = 1; index < limb.points.length; index++) {
        const a = limb.points[index - 1]
        const b = limb.points[index]
        const step = Math.hypot(...sub(b, a))

        if (b[1] >= height) {
            return run + step * Math.min(Math.max((height - a[1]) / Math.max(b[1] - a[1], 1e-9), 0), 1)
        }

        run += step
    }

    return run
}

/** What a wood piece is: the plan to sculpt, how it's cut, and how it lies. */
interface WoodPiece {
    readonly plan: TreePlan
    readonly piece: PieceCut
    readonly frame: Frame | null
    /** The point the piece is laid down about. */
    readonly centre: Vec3
}

/** The tallest a stump may be cut, as a share of the trunk. */
export const STUMP_MAX_SHARE = 0.85

function stumpPiece(plan: TreePlan, height: number): WoodPiece {
    const trunk = plan.limbs[0]
    const top = Math.min(height, trunk.points[trunk.points.length - 1][1] * STUMP_MAX_SHARE)
    const cutAt = pointAlong(trunk, distanceToHeight(trunk, top))
    const cut: WoodCut = {point: cutAt.point, normal: [0, 1, 0]}

    // The whole trunk stays, so its ridges and knots are where they were. The cut takes the rest.
    return {
        plan: {...plan, limbs: [trunk, ...plan.limbs.filter(isRoot)], clumps: []},
        piece: {cuts: [cut], orient: (v) => v},
        frame: null,
        centre: [0, 0, 0],
    }
}

function logPiece(plan: TreePlan, tree: PaintedTreeParameters, length: number, seed: number): WoodPiece {
    const trunk = plan.limbs[0]
    const total = lengthOf(trunk)
    const start = Math.min(tree.trunkRadius * LOG_BASE, total * 0.3)
    const end = Math.min(start + length, total - trunk.radii[trunk.radii.length - 1] * 0.5)
    const a = pointAlong(trunk, start)
    const b = pointAlong(trunk, end)
    const cuts: WoodCut[] = [
        {point: a.point, normal: [-a.direction[0], -a.direction[1], -a.direction[2]]},
        {point: b.point, normal: b.direction},
    ]
    const axis = normalize(sub(b.point, a.point))
    const span = dot(sub(b.point, a.point), axis)
    // The limbs that left the trunk along the log are snapped off short.
    const stubs = plan.limbs
        .filter((limb) => limb.level >= 1 && !isRoot(limb) && limb.radii[0] > trunk.radii[0] * 0.08)
        .filter((limb) => {
            const along = dot(sub(limb.points[0], a.point), axis)
            const onAxis = lerp(a.point, b.point, Math.min(Math.max(along / Math.max(span, 1e-6), 0), 1))

            return along > 0 && along < span && Math.hypot(...sub(limb.points[0], onAxis)) < a.radius * 1.6
        })
        .map((limb) => shortened(limb, a.radius + Math.min(limb.radii[0] * STUB_LENGTH, a.radius * 0.5)))
    const frame = lyingFrame(axis, createSeededRandom(hashSeed(seed, 81))() * Math.PI * 2)

    return {
        plan: {...plan, limbs: [trunk, ...stubs], clumps: []},
        piece: {cuts, orient: orientIn(frame)},
        frame,
        centre: lerp(a.point, b.point, 0.5),
    }
}

/** The limbs a branch piece can be: a branching tree's heavy limbs. */
export function branchCandidates(plan: TreePlan): readonly Limb[] {
    // A conifer's spokes are bare single sticks, which make a poor fallen branch.
    return plan.limbs.filter((limb) => isHeavyLimb(limb) && limb.key.startsWith('l'))
}

function branchPiece(plan: TreePlan, seed: number): WoodPiece | null {
    const candidates = branchCandidates(plan)

    if (candidates.length === 0) {
        return null
    }

    const limb = candidates[Math.floor(createSeededRandom(hashSeed(seed, 82))() * candidates.length)]
    const trunk = plan.limbs[0]
    const host = trunk.radii[Math.min(1, trunk.radii.length - 1)]
    const breakAt = Math.min(host * BREAK_OUT, lengthOf(limb) * 0.3)
    const base = pointAlong(limb, breakAt)
    const twigs = plan.limbs.filter((other) => growsOn(other, limb))
    const tip = limb.points[limb.points.length - 1]
    const frame = lyingFrame(sub(tip, base.point), 0)

    return {
        plan: {...plan, limbs: [limb, ...twigs], clumps: []},
        piece: {cuts: [{point: base.point, normal: [-base.direction[0], -base.direction[1], -base.direction[2]]}], orient: orientIn(frame)},
        frame,
        centre: base.point,
    }
}

/**
 * Lays a piece built where it grew down where it goes: its base on the ground, at the
 * origin. Gives back how it was moved, so its cut ends can be laid the same way.
 */
function layDown(geometry: THREE.BufferGeometry, piece: WoodPiece): THREE.Matrix4 {
    const placement = new THREE.Matrix4()

    if (piece.frame) {
        const {along, up, across} = piece.frame
        const turn = new THREE.Matrix4().set(
            along[0], along[1], along[2], 0,
            up[0], up[1], up[2], 0,
            across[0], across[1], across[2], 0,
            0, 0, 0, 1,
        )

        placement.multiplyMatrices(turn, new THREE.Matrix4().makeTranslation(-piece.centre[0], -piece.centre[1], -piece.centre[2]))
        geometry.applyMatrix4(placement)
        geometry.computeBoundingBox()

        const box = geometry.boundingBox!
        const thickness = box.max.y - box.min.y
        const settle = new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y - thickness * SETTLE * 0.25, -(box.min.z + box.max.z) / 2)

        geometry.applyMatrix4(settle)
        placement.premultiply(settle)
    }

    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()

    return placement
}

/**
 * How each piece was laid down, by everything that decides it. The cut ends are their
 * own part, and lie where the wood does without building the wood a second time.
 */
const placements = new Map<string, THREE.Matrix4>()
const PLACEMENTS_KEPT = 24

const placementKey = (kind: PieceKind, source: PieceSource, options: PieceOptions, seed: number, detail: number) =>
    JSON.stringify([kind, source.tree, source.treeSeed, options.height, options.length, seed, detail])

function keepPlacement(key: string, placement: THREE.Matrix4) {
    placements.delete(key)
    placements.set(key, placement)

    if (placements.size > PLACEMENTS_KEPT) {
        placements.delete(placements.keys().next().value!)
    }
}

/** The tree a piece comes from, with the piece's own weather in place of the tree's. */
export interface PieceSource {
    readonly tree: PaintedTreeParameters
    readonly treeSeed: number
}

export function canMakePiece(kind: PieceKind, source: PieceSource): boolean {
    if (kind === 'litter') {
        return true
    }

    const plan = planPaintedTree(source.tree, source.treeSeed)

    return kind === 'branch' ? branchCandidates(plan).length > 0 : plan.limbs.length > 0
}

interface PieceOptions {
    readonly height: number
    readonly length: number
}

function woodPieceOf(kind: Exclude<PieceKind, 'litter'>, source: PieceSource, options: PieceOptions, seed: number): WoodPiece | null {
    const plan = planPaintedTree(source.tree, source.treeSeed)
    const piece =
        kind === 'stump'
            ? stumpPiece(plan, options.height)
            : kind === 'log'
              ? logPiece(plan, source.tree, options.length, seed)
              : branchPiece(plan, seed)

    return piece && piece.plan.limbs.length > 0 ? piece : null
}

/** The wood of a stump, log or branch, laid where it goes. Empty when the tree has nothing to make it from. */
export function buildWoodPiece(kind: Exclude<PieceKind, 'litter'>, source: PieceSource, options: PieceOptions, seed: number, detail: number): THREE.BufferGeometry {
    const piece = woodPieceOf(kind, source, options, seed)

    if (!piece) {
        return new THREE.BufferGeometry()
    }

    const geometry = buildBark(piece.plan, source.tree, source.treeSeed, detail, piece.piece)

    keepPlacement(placementKey(kind, source, options, seed, detail), layDown(geometry, piece))

    return geometry
}

/** How far a cut end stands off the sawn wood, in grid cells: enough never to flicker. */
const END_LIFT = 0.15
/** How thick the bark is at a cut's rim, against the trunk's radius, and at most against the cut's own. */
const END_RIM = 0.07
const END_RIM_MOST = 0.12
/** The picture's rings reach this far out, against the trunk's radius, so every cut of one tree has rings the same width. */
const END_PICTURE_REACH = 1.1

/** Two directions across a cut, square to each other, with `a` × `b` along its normal. */
function acrossCut(n: Vec3): [Vec3, Vec3] {
    const helper: Vec3 = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
    const a = normalize(cross(helper, n))

    return [a, cross(n, a)]
}

/**
 * The sawn faces of a stump, log or branch, as flat caps carrying the end-grain picture:
 * rings far finer than the wood's own points could hold. Each follows the wood's outline
 * on its cut, inside the bark at its rim, and lies just off the sawn wood.
 */
export function buildCutEnds(kind: Exclude<PieceKind, 'litter'>, source: PieceSource, options: PieceOptions, seed: number, detail: number): THREE.BufferGeometry {
    const piece = woodPieceOf(kind, source, options, seed)

    if (!piece) {
        return new THREE.BufferGeometry()
    }

    const key = placementKey(kind, source, options, seed, detail)

    if (!placements.has(key)) {
        buildWoodPiece(kind, source, options, seed, detail).dispose()
    }

    const {field, cell} = prepareBark(piece.plan, source.tree, source.treeSeed, detail, piece.piece)
    const tree = source.tree
    const limb = piece.plan.limbs[0]
    const segments = Math.max(16, Math.round(64 * Math.sqrt(detail)))
    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const uvs: number[] = []
    const indices: number[] = []

    for (const cut of piece.piece.cuts) {
        const n = normalize(cut.normal)
        const [a, b] = acrossCut(n)
        const radius = pointAlong(limb, distanceAlong(limb, cut.point).along).radius
        // Sampled just inside the kept wood, where the cut's own plane doesn't count.
        const inside = (r: number, along: Vec3): number =>
            field.distance(
                cut.point[0] + along[0] * r - n[0] * cell * 0.5,
                cut.point[1] + along[1] * r - n[1] * cell * 0.5,
                cut.point[2] + along[2] * r - n[2] * cell * 0.5,
            )
        const solid = inside(0, a) < 0
        const reaches = Array.from({length: segments}, (_, index) => {
            const angle = (index / segments) * Math.PI * 2
            const along: Vec3 = [a[0] * Math.cos(angle) + b[0] * Math.sin(angle), a[1] * Math.cos(angle) + b[1] * Math.sin(angle), a[2] * Math.cos(angle) + b[2] * Math.sin(angle)]

            // Thin wood swept as a tube isn't in the field: its cut is round.
            if (!solid) {
                return {along, r: radius}
            }

            let low = 0
            let high = radius * 0.5

            while (inside(high, along) < 0 && high < radius * 3) {
                low = high
                high += radius * 0.25
            }

            for (let step = 0; step < 14; step++) {
                const middle = (low + high) / 2

                if (inside(middle, along) < 0) {
                    low = middle
                } else {
                    high = middle
                }
            }

            return {along, r: low}
        })
        const rim = Math.min(tree.trunkRadius * END_RIM, radius * END_RIM_MOST)
        const widest = Math.max(...reaches.map(({r}) => r))
        const pictureReach = Math.max(tree.trunkRadius * END_PICTURE_REACH, widest * 1.02)
        const lift = cell * END_LIFT
        const centre: Vec3 = [cut.point[0] + n[0] * lift, cut.point[1] + n[1] * lift, cut.point[2] + n[2] * lift]
        // Weather falls on the cut as the piece lies, not as the tree stood.
        const colour = weatherPaint(HEARTWOOD.clone(), piece.piece.orient(n)[1], {snow: tree.snow, wet: tree.wet})
        const first = positions.length / 3
        const vertex = (p: Vec3) => {
            const offset: Vec3 = [p[0] - cut.point[0], p[1] - cut.point[1], p[2] - cut.point[2]]

            positions.push(p[0], p[1], p[2])
            normals.push(n[0], n[1], n[2])
            colors.push(colour.r, colour.g, colour.b)
            uvs.push(0.5 + dot(offset, a) / (2 * pictureReach), 0.5 + dot(offset, b) / (2 * pictureReach))
        }

        vertex(centre)

        for (const {along, r} of reaches) {
            const out = Math.max(r - rim, r * 0.5)

            vertex([centre[0] + along[0] * out, centre[1] + along[1] * out, centre[2] + along[2] * out])
        }

        for (let index = 0; index < segments; index++) {
            indices.push(first, first + 1 + index, first + 1 + ((index + 1) % segments))
        }
    }

    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.applyMatrix4(placements.get(key) ?? new THREE.Matrix4())
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()

    return geometry
}

/** How a fallen leaf dries: towards this brown, as much as Dryness says. */
const DRY_LEAF = new THREE.Color('#9a6a2e')

/**
 * The tree's own leaves lying on the ground, in a patch thickest in its middle.
 * Each is a card from the same brush-dab picture as the crown, lying nearly flat.
 */
export function buildLitter(
    source: PieceSource,
    options: {readonly width: number; readonly depth: number; readonly amount: number; readonly dryness: number},
    seed: number,
    detail: number,
): THREE.BufferGeometry {
    const random = createSeededRandom(hashSeed(seed, 83))
    const palette = resolvePalette(source.tree)
    const deep = new THREE.Color(palette.leafDeep)
    const mid = new THREE.Color(palette.leafMid)
    const light = new THREE.Color(palette.leafLight)
    const paint = new THREE.Color()
    const half = 0.09 * source.tree.leafSize
    const area = Math.PI * (options.width / 2) * (options.depth / 2)
    const count = Math.max(4, Math.round((area / (half * half * 4)) * options.amount * 2.4 * detail))
    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const uvs: number[] = []
    const indices: number[] = []

    for (let card = 0; card < count; card++) {
        // Thickest in the middle, as leaves pile up under a crown.
        const reach = Math.sqrt(random()) * (0.55 + random() * 0.45)
        const angle = random() * Math.PI * 2
        const x = Math.cos(angle) * reach * (options.width / 2)
        const z = Math.sin(angle) * reach * (options.depth / 2)
        const turn = random() * Math.PI * 2
        const size = half * randomRange(random, 0.75, 1.3)
        const tiltX = randomRange(random, -0.25, 0.25)
        const tiltZ = randomRange(random, -0.25, 0.25)
        // Later cards lie on earlier ones, so none fight for the same depth.
        const y = 0.006 + (card / count) * 0.02
        const [u0, v0, cell] = dabCell(Math.floor(random() * DAB_VARIANTS))
        const value = random()
        const dry = Math.min(1, options.dryness * randomRange(random, 0.6, 1.3))

        paint.copy(value < 0.5 ? deep : mid).lerp(value < 0.5 ? mid : light, (value % 0.5) * 2).lerp(DRY_LEAF, dry * 0.8)
        // Fallen leaves sit in the shade of each other: the ones below are darker.
        paint.multiplyScalar(0.7 + (card / count) * 0.3)

        const base = positions.length / 3
        const cos = Math.cos(turn) * size
        const sin = Math.sin(turn) * size

        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
            const px = a * cos - b * sin
            const pz = a * sin + b * cos

            positions.push(x + px, y + px * tiltX + pz * tiltZ + size * 0.15, z + pz)
            normals.push(0, 1, 0)
            colors.push(paint.r, paint.g, paint.b)
            uvs.push(u0 + ((a + 1) / 2) * cell, v0 + ((b + 1) / 2) * cell)
        }

        indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
    }

    weatherColours(colors, normals, source.tree)

    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()

    return geometry
}
