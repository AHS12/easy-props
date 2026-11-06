/**
 * A low-poly bush: the bush's own smooth shape as one surface of a few large
 * flat faces, each one colour, with nothing printed on it.
 *
 * Its masses melt together just as they do under the leaf cards, and the ground
 * closes it off, so it is one sealed shell. Flowers are small faceted blossoms
 * sitting on the faces.
 */

import * as THREE from 'three'
import {cellsAround, lowPolySurface, withGradient} from '../shared/low-poly-remesh'
import {createSeededRandom, hashSeed, randomRange} from '../shared/random'
import {FLOWER_ROWS, LEAF_ROWS, rampOf} from '../style/own-colours'
import {BUSH_RAMPS, PETAL_RAMPS} from '../style/palettes'
import {colourRamp} from '../style/ramp'
import {placeCards, shapeOf, type BushParameters, type Vec3} from './bush-mesh'

/** The grid is this share of the bush's size, finer at full detail. */
const CELL_SHARE = 0.03
/** How far the surface may move as it is simplified, against the bush's size. */
const MAX_ERROR = 0.022
/** How wide the fillets between masses are, against the bush's size: tight, so each mass shows. */
const BLEND = 0.04
/** About this many faces per mass at full detail. */
const FACES_PER_LOBE = 40
const MIN_FACES = 24
/** How far one face's colour strays from the next, so neighbouring facets read apart. */
const FACE_JITTER = 0.05
const SEED_FACES = 41000
/** Its outline is hard, so the shape is measured finely to stand exactly the size asked for. */
const FIT_DETAIL = 6
/**
 * Where two sheets of the surface pass through one grid cell, they pinch at an
 * edge. A grid a little coarser misses that spot, so it is tried in these sizes.
 */
const CELL_TRIES: readonly number[] = [1, 1.09, 1.19]
/** A blossom's points, and how far its middle stands off the surface, as a share of its size. */
const PETALS = 5
const BLOSSOM_RISE = 0.45
const BLOSSOM_SINK = 0.15
const PETAL_SHADE = 0.82

type Faces = {positions: number[]; normals: number[]; colors: number[]}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

const normalize = (a: Vec3): Vec3 => {
    const length = Math.hypot(a[0], a[1], a[2]) || 1

    return [a[0] / length, a[1] / length, a[2] / length]
}

function pushFace(out: Faces, a: Vec3, b: Vec3, c: Vec3, colour: THREE.Color) {
    const n = normalize(cross(sub(b, a), sub(c, a)))

    for (const p of [a, b, c]) {
        out.positions.push(p[0], p[1], p[2])
        out.normals.push(n[0], n[1], n[2])
        out.colors.push(colour.r, colour.g, colour.b)
    }
}

function toGeometry({positions, normals, colors}: Faces): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.computeBoundingSphere()

    return geometry
}

const sizeOf = (bush: BushParameters) => (bush.width + bush.height + bush.depth) / 3

/** Whether every edge is shared by exactly two faces. */
function sealed(indices: readonly number[]): boolean {
    const uses = new Map<number, number>()
    const vertices = Math.max(...indices) + 1

    for (let at = 0; at < indices.length; at += 3) {
        for (let k = 0; k < 3; k++) {
            const a = indices[at + k]
            const b = indices[at + ((k + 1) % 3)]
            const edge = Math.min(a, b) * vertices + Math.max(a, b)

            uses.set(edge, (uses.get(edge) ?? 0) + 1)
        }
    }

    return [...uses.values()].every((count) => count === 2)
}

export function buildLowPolyBushBody(bush: BushParameters, seed: number, detail: number): THREE.BufferGeometry {
    const shape = shapeOf(bush, seed, BLEND, FIT_DETAIL)
    const size = sizeOf(bush)
    const share = Math.sqrt(Math.max(detail, 0.1))
    // The ground closes it, so it is one shell with a flat foot.
    const field = withGradient((x, y, z) => Math.max(shape.field(x, y, z), -y))
    const target = Math.max(MIN_FACES, Math.round(shape.lobes.length * FACES_PER_LOBE * detail))
    const surfaceAt = (cell: number) => {
        const reach = 0.6 + (2 * cell) / size
        const box = {
            min: [-bush.width * reach, -2 * cell, -bush.depth * reach] as Vec3,
            max: [bush.width * reach, bush.height * 1.1 + 2 * cell, bush.depth * reach] as Vec3,
        }

        return lowPolySurface(field, cellsAround([box], cell), cell, (size * MAX_ERROR) / share, target)
    }
    let surface = surfaceAt((size * CELL_SHARE) / share)

    for (const scale of CELL_TRIES.slice(1)) {
        if (sealed(surface.indices)) {
            break
        }

        surface = surfaceAt((size * CELL_SHARE * scale) / share)
    }
    const paint = colourRamp(rampOf(bush.palette, BUSH_RAMPS, bush, LEAF_ROWS))
    const faces: Faces = {positions: [], normals: [], colors: []}
    const corner = (index: number): Vec3 => [surface.positions[index * 3], surface.positions[index * 3 + 1], surface.positions[index * 3 + 2]]

    for (let at = 0; at < surface.indices.length; at += 3) {
        const a = corner(surface.indices[at])
        const b = corner(surface.indices[at + 1])
        const c = corner(surface.indices[at + 2])
        const middle: Vec3 = [(a[0] + b[0] + c[0]) / 3, Math.max(0, (a[1] + b[1] + c[1]) / 3), (a[2] + b[2] + c[2]) / 3]
        const n = normalize(cross(sub(b, a), sub(c, a)))
        const random = createSeededRandom(hashSeed(seed, SEED_FACES + at))
        const value = shape.value(middle, n, bush.variation) + randomRange(random, -FACE_JITTER, FACE_JITTER)

        pushFace(faces, a, b, c, paint(value))
    }

    return toGeometry(faces)
}

/** Small faceted blossoms on the upper faces. A lighter level keeps fewer. */
export function buildLowPolyBushFlowers(bush: BushParameters, seed: number, detail: number): THREE.BufferGeometry {
    const faces: Faces = {positions: [], normals: [], colors: []}

    if (bush.flowers <= 0) {
        return toGeometry(faces)
    }

    const shape = shapeOf(bush, seed, BLEND, FIT_DETAIL)
    // Flowers are placed apart from the leaves, so none of those are worth working out.
    const flowers = placeCards(shape, {...bush, fullness: 0}, seed).filter((card) => card.flower)
    const kept = detail >= 1 ? flowers : [...flowers].sort((a, b) => a.priority - b.priority).slice(0, Math.max(1, Math.round(flowers.length * detail)))
    const petal = colourRamp(rampOf(bush.flowerColour, PETAL_RAMPS, bush, FLOWER_ROWS))

    for (const {point, normal, seed: flowerSeed} of kept) {
        const random = createSeededRandom(hashSeed(flowerSeed, 1))
        const half = bush.flowerSize * randomRange(random, 0.8, 1.2)
        const side = normalize(cross(normal, Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
        const across = cross(normal, side)
        const turn = random() * Math.PI * 2
        const at = (out: number, angle: number): Vec3 => [
            point[0] + (side[0] * Math.cos(angle) + across[0] * Math.sin(angle)) * out + normal[0] * (out === 0 ? half * BLOSSOM_RISE : -half * BLOSSOM_SINK),
            point[1] + (side[1] * Math.cos(angle) + across[1] * Math.sin(angle)) * out + normal[1] * (out === 0 ? half * BLOSSOM_RISE : -half * BLOSSOM_SINK),
            point[2] + (side[2] * Math.cos(angle) + across[2] * Math.sin(angle)) * out + normal[2] * (out === 0 ? half * BLOSSOM_RISE : -half * BLOSSOM_SINK),
        ]
        const middle = at(0, 0)
        const colour = petal(0.35 + random() * 0.65)
        const shaded = colour.clone().multiplyScalar(PETAL_SHADE)

        for (let k = 0; k < PETALS; k++) {
            const from = turn + (k / PETALS) * Math.PI * 2
            const to = turn + ((k + 1) / PETALS) * Math.PI * 2

            pushFace(faces, middle, at(half, from), at(half, to), k % 2 === 0 ? colour : shaded)
        }
    }

    return toGeometry(faces)
}
