/**
 * The low-poly tree: the same plan as the painted one, in a few large flat faces.
 *
 * The wood and the masses of leaves are joined surfaces, worked out in
 * `low-poly-surface.ts`. What hangs off them is made here: palm fronds,
 * willow strands and fruit, each face one flat colour. Nothing is printed on a
 * texture, so the file needs none.
 */

import * as THREE from 'three'
import {createSeededRandom, hashSeed, randomRange} from '../../shared/random'
import {addFruitBall, addStrands, buildFrond, emptyLeafBuffers, fruitRadius, leafColours, leafGeometry, type LeafBuffers} from './frond-mesh'
import type {PaintedTreeParameters} from './parameters'
import {cross, normalize, type Clump, type TreePlan, type Vec3} from './plan'
import {buildLowPolyWood, lowPolyCrown} from './low-poly-surface'

/** A frond at low-poly is built as a lighter level, with fewer, wider leaflets. */
const FROND_SHARE = 0.3

type Faces = {positions: number[]; normals: number[]; colors: number[]}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

/** One flat triangle: its own normal and one colour. */
function pushFace(out: Faces, a: Vec3, b: Vec3, c: Vec3, colour: THREE.Color) {
    const n = normalize(cross(sub(b, a), sub(c, a)))

    for (const point of [a, b, c]) {
        out.positions.push(point[0], point[1], point[2])
        out.normals.push(n[0], n[1], n[2])
        out.colors.push(colour.r, colour.g, colour.b)
    }
}

/** The wood of a low-poly tree: the trunk, limbs, branches and roots as one joined surface. */
export function buildLowPolyBark(plan: TreePlan, tree: PaintedTreeParameters, seed: number, detail: number): THREE.BufferGeometry {
    return buildLowPolyWood(plan, tree, seed, detail)
}

/** Moves flat faces into leaf buffers. They are marked to sway whole: fluttering would split their facets. */
function addRigid(leaves: LeafBuffers, faces: Faces) {
    const first = leaves.positions.length / 3
    const count = faces.positions.length / 3

    leaves.positions.push(...faces.positions)
    leaves.normals.push(...faces.normals)
    leaves.colors.push(...faces.colors)

    for (let i = 0; i < count; i++) {
        leaves.uvs.push(0, 0)
        leaves.indices.push(first + i)
    }

    leaves.rigid.push(first, first + count)
}

/** A smooth fruit ball made faceted: each face keeps its own normal and the colour of its first corner. */
function facetedFruit(centre: Vec3, radius: number, tree: PaintedTreeParameters): Faces {
    const ball = emptyLeafBuffers()
    const faces: Faces = {positions: [], normals: [], colors: []}
    const colour = new THREE.Color()

    addFruitBall(ball, centre, radius, tree, 0.5)

    for (let at = 0; at < ball.indices.length; at += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => ball.indices[at + k])
        const point = (i: number): Vec3 => [ball.positions[i * 3], ball.positions[i * 3 + 1], ball.positions[i * 3 + 2]]

        colour.setRGB(ball.colors[a * 3], ball.colors[a * 3 + 1], ball.colors[a * 3 + 2])
        pushFace(faces, point(a), point(b), point(c), colour)
    }

    return faces
}

/**
 * Gives every triangle one flat colour and one flat normal. A leaf drawn from
 * both sides keeps the same normal on each, turned the way its soft one
 * faced, so the two sides move together in the wind.
 */
function facet(indexed: THREE.BufferGeometry): THREE.BufferGeometry {
    const geometry = indexed.index ? indexed.toNonIndexed() : indexed
    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')
    const colour = geometry.getAttribute('color')
    const corner = (i: number): Vec3 => [position.getX(i), position.getY(i), position.getZ(i)]

    for (let at = 0; at < position.count; at += 3) {
        let n = normalize(cross(sub(corner(at + 1), corner(at)), sub(corner(at + 2), corner(at))))
        const soft = [0, 1, 2].reduce((sum, k) => sum + normal.getX(at + k) * n[0] + normal.getY(at + k) * n[1] + normal.getZ(at + k) * n[2], 0)

        if (soft < 0) {
            n = [-n[0], -n[1], -n[2]]
        }

        const average = [0, 1, 2].map((channel) => (colour.getComponent(at, channel) + colour.getComponent(at + 1, channel) + colour.getComponent(at + 2, channel)) / 3)

        for (let k = 0; k < 3; k++) {
            normal.setXYZ(at + k, n[0], n[1], n[2])
            colour.setXYZ(at + k, average[0], average[1], average[2])
        }
    }

    if (geometry !== indexed) {
        indexed.dispose()
    }

    return geometry
}

/** One low-poly mass of leaves, in its own space: its centre is the origin. */
export function buildLowPolyClump(
    plan: TreePlan,
    clump: Clump,
    tree: PaintedTreeParameters,
    seed: number,
    detail: number,
    share = 1,
): THREE.BufferGeometry {
    if (clump.kind === 'frond') {
        return facet(buildFrond(plan, clump, tree, detail, Math.min(share, FROND_SHARE)))
    }

    const paint = leafColours(tree, clump)
    const random = createSeededRandom(hashSeed(clump.seed, 41))
    const clumpShift = (createSeededRandom(hashSeed(clump.seed, 3))() - 0.5) * 0.3 * tree.colourVariation
    const corners = lowPolyCrown(plan, tree, seed, share).faces.get(clump.key) ?? []
    const faces: Faces = {positions: [], normals: [], colors: []}

    for (let at = 0; at < corners.length; at += 9) {
        const [a, b, c] = [0, 3, 6].map(
            (k): Vec3 => [corners[at + k] - clump.centre[0], corners[at + k + 1] - clump.centre[1], corners[at + k + 2] - clump.centre[2]],
        )
        const n = normalize(cross(sub(b, a), sub(c, a)))
        const middle = (a[1] + b[1] + c[1]) / 3
        const height = (clump.base[1] + middle - plan.crownCentre[1]) / Math.max(plan.crownRadius, 0.001)
        // Painted as the soft clump is: the top of the clump and of the crown are bright.
        const value =
            0.55 * (n[1] * 0.5 + 0.5) + 0.3 * (height * 0.5 + 0.5) + 0.12 + clumpShift + randomRange(random, -0.07, 0.07) * (0.5 + tree.colourVariation)

        pushFace(faces, a, b, c, paint(value))
    }

    const buffers = emptyLeafBuffers()

    addRigid(buffers, faces)

    if (tree.strands > 0) {
        addStrands(buffers, clump, tree, detail, Math.min(share, FROND_SHARE))
    }

    // Fruit hangs on the outside of the leaves, so it sits on faces of this
    // clump, half sunk in, mostly on its sides and underneath as on the painted tree.
    const faceCount = faces.positions.length / 9

    if (tree.fruitCount > 0 && faceCount > 0) {
        const fruitRandom = createSeededRandom(hashSeed(clump.seed, 6))
        const radius = fruitRadius(tree)
        const hanging = Array.from({length: faceCount}, (_, face) => face).filter((face) => faces.normals[face * 9 + 1] < 0.45)
        const choices = hanging.length > 0 ? hanging : Array.from({length: faceCount}, (_, face) => face)

        for (let index = 0; index < tree.fruitCount; index++) {
            const face = choices[Math.floor(fruitRandom() * choices.length)]
            const at = face * 9
            const normal = [faces.normals[at], faces.normals[at + 1], faces.normals[at + 2]]
            const middle = [0, 1, 2].map((axis) => (faces.positions[at + axis] + faces.positions[at + 3 + axis] + faces.positions[at + 6 + axis]) / 3)

            addRigid(
                buffers,
                facetedFruit(
                    [middle[0] + normal[0] * radius * 0.5, middle[1] + normal[1] * radius * 0.5, middle[2] + normal[2] * radius * 0.5],
                    radius,
                    tree,
                ),
            )
        }
    }

    return facet(leafGeometry(buffers))
}
