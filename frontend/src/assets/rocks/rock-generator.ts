/**
 * Rocks, boulders and cliffs.
 *
 * One distance field, one surface, colour per vertex. A rock is the same field
 * and surface nets as bark, with no leaves and nothing that moves, and it says
 * nothing about export: the pipeline treats it like any other prop.
 */

import * as THREE from 'three'
import {z} from 'zod'
import {IDENTITY_TRANSFORM} from '../shared/component-types'
import type {PartGenerator, PropGenerator} from '../shared/generator-types'
import {
    choiceSchema,
    numberSchema,
    validateParameters,
    type ChoiceParameter,
    type NumberParameter,
    type ParameterSpec,
} from '../shared/parameters'
import {createSeededRandom, hashSeed, randomRange} from '../shared/random'
import {joinChunks, sculptCells, type MeshBuffers, type SurfaceField} from '../shared/surface-nets'
import {STONE_COLOURS, type PaletteId} from '../style/palettes'

type StonePalette = Exclude<PaletteId, 'custom'>

const SHAPE = 'Shape'
const SURFACE = 'Surface'

const number = (
    group: string,
    key: string,
    label: string,
    help: string,
    min: number,
    max: number,
    step: number,
    fallback: number,
    unit?: string,
): NumberParameter => ({kind: 'number', group, key, label, help, min, max, step, default: fallback, unit})

const PALETTE: ChoiceParameter<StonePalette> = {
    kind: 'choice',
    group: SURFACE,
    key: 'palette',
    label: 'Palette',
    help: 'Use the same palette as your trees, so they belong together.',
    default: 'forest',
    options: (Object.keys(STONE_COLOURS) as StonePalette[]).map((value) => ({
        value,
        label: value[0].toUpperCase() + value.slice(1).replace('-', ' '),
    })),
}

const WIDTH = number(SHAPE, 'width', 'Width', 'How wide the rock is.', 0.2, 30, 0.1, 2.4, 'm')
const HEIGHT = number(SHAPE, 'height', 'Height', 'How tall the rock stands.', 0.1, 30, 0.1, 1.5, 'm')
const DEPTH = number(SHAPE, 'depth', 'Depth', 'How far it runs from front to back.', 0.2, 30, 0.1, 2, 'm')
const ROUNDNESS = number(SHAPE, 'roundness', 'Roundness', 'From a blocky shape to a smooth pebble.', 0, 1, 0.05, 0.55)
const FACETS = number(SHAPE, 'facets', 'Facets', 'How much of it is cut into flat faces.', 0, 1, 0.05, 0.5)
const LUMPINESS = number(SURFACE, 'lumpiness', 'Lumps', 'Big bumps across the surface.', 0, 1, 0.05, 0.4)
const LAYERS = number(SURFACE, 'layers', 'Layers', 'Bands of stone, as in a cliff.', 0, 1, 0.05, 0)
const MOSS = number(SURFACE, 'moss', 'Moss', 'Green on whatever faces the sky.', 0, 1, 0.05, 0)

const specs: readonly ParameterSpec[] = [WIDTH, HEIGHT, DEPTH, ROUNDNESS, FACETS, LUMPINESS, LAYERS, MOSS, PALETTE]

export interface RockParameters {
    readonly width: number
    readonly height: number
    readonly depth: number
    readonly roundness: number
    readonly facets: number
    readonly lumpiness: number
    readonly layers: number
    readonly moss: number
    readonly palette: StonePalette
}

export const rockDefaults: RockParameters = {
    width: WIDTH.default,
    height: HEIGHT.default,
    depth: DEPTH.default,
    roundness: ROUNDNESS.default,
    facets: FACETS.default,
    lumpiness: LUMPINESS.default,
    layers: LAYERS.default,
    moss: MOSS.default,
    palette: PALETTE.default,
}

const rockSchema = z.object({
    width: numberSchema(WIDTH),
    height: numberSchema(HEIGHT),
    depth: numberSchema(DEPTH),
    roundness: numberSchema(ROUNDNESS),
    facets: numberSchema(FACETS),
    lumpiness: numberSchema(LUMPINESS),
    layers: numberSchema(LAYERS),
    moss: numberSchema(MOSS),
    palette: choiceSchema(PALETTE),
})

const validateRock = (parameters: unknown) => validateParameters<RockParameters>(rockSchema, parameters, rockDefaults)

/** How many grid cells span the longest side, at full detail. */
const GRID = 28
const GRADIENT_STEP = 0.01
const LAYER_COUNT = 7
const LAYER_MIN_CELLS = 7
const CUT_COUNT = 9
const SEED_CUTS = 31
const SEED_LUMPS = 32
/** How deep the base sits, as a share of the height, so it never rests on a point. */
const SINK = 0.18
/** A face entirely below this is underground. */
const GROUND_LEVEL = -0.05
const MOSS_COLOUR = '#6c9a3c'
/** How much of the width and depth the collision shape keeps, at its base and its top. */
const COLLISION_BASE = 0.85
const COLLISION_TOP = 0.55

interface RockField extends SurfaceField {
    /** How far into a crease a point is: 0 on open stone, 1 in a band or a dent. */
    crease(x: number, y: number, z: number): number
}

function createRockField(rock: RockParameters, seed: number): RockField {
    const rx = rock.width / 2
    const ry = rock.height * (1 + SINK) * 0.5
    const rz = rock.depth / 2
    const cy = rock.height - ry
    const size = Math.min(rx, ry, rz)
    // A high power squares a shape off. Two is an ellipsoid.
    const power = 2 + (1 - rock.roundness) * 4

    const random = createSeededRandom(hashSeed(seed, SEED_CUTS))
    const cuts = Array.from({length: CUT_COUNT}, () => {
        const normal = new THREE.Vector3(randomRange(random, -1, 1), randomRange(random, -0.4, 1), randomRange(random, -1, 1)).normalize()

        return {x: normal.x, y: normal.y, z: normal.z, depth: randomRange(random, 0.55, 0.95)}
    })

    const lumpRandom = createSeededRandom(hashSeed(seed, SEED_LUMPS))
    const phases = Array.from({length: 6}, () => randomRange(lumpRandom, 0, Math.PI * 2))
    const wave = (1.6 + rock.lumpiness * 0.8) / size
    // Never finer than the full-detail grid can hold, or the bands break into spots.
    const longest = Math.max(rock.width, rock.height, rock.depth)
    const layerWave = (Math.PI * 2) / Math.max(rock.height / LAYER_COUNT, (longest / GRID) * LAYER_MIN_CELLS)

    const lumps = (x: number, y: number, z: number) =>
        Math.sin(x * wave + phases[0] + Math.sin(z * wave * 0.7 + phases[1])) *
            Math.sin(y * wave * 1.1 + phases[2]) *
            0.6 +
        Math.sin(z * wave * 2.1 + phases[3] + x * wave) * Math.sin(x * wave * 1.9 + phases[4] + y * wave) * 0.3 +
        Math.sin((x + y + z) * wave * 3.7 + phases[5]) * 0.1

    const layerAt = (x: number, y: number, z: number) => {
        const band = Math.abs(Math.sin(y * layerWave + Math.sin(x * wave * 0.5 + phases[0]) * 0.6 + z * wave * 0.1))

        return 1 - Math.min(band / 0.5, 1)
    }

    const distance = (x: number, y: number, z: number) => {
        const px = x / rx
        const py = (y - cy) / ry
        const pz = z / rz
        const body = (Math.abs(px) ** power + Math.abs(py) ** power + Math.abs(pz) ** power) ** (1 / power) - 1
        let cut = -Infinity

        for (const {x: nx, y: ny, z: nz, depth} of cuts) {
            cut = Math.max(cut, px * nx + py * ny + pz * nz - depth)
        }

        // The cuts come in with Facets, and stop shy of slicing a rock in half.
        const faceted = Math.max(body, body + (cut - body) * rock.facets)

        return (
            faceted * size -
            lumps(x, y, z) * rock.lumpiness * size * 0.14 +
            layerAt(x, y, z) * rock.layers * size * 0.1
        )
    }

    return {
        distance,
        gradient(x, y, z) {
            const step = GRADIENT_STEP * Math.max(size, 0.2)
            const dx = distance(x + step, y, z) - distance(x - step, y, z)
            const dy = distance(x, y + step, z) - distance(x, y - step, z)
            const dz = distance(x, y, z + step) - distance(x, y, z - step)
            const length = Math.max(Math.hypot(dx, dy, dz), 1e-9)

            return [dx / length, dy / length, dz / length]
        },
        crease(x, y, z) {
            return Math.max(layerAt(x, y, z) * rock.layers, (-lumps(x, y, z) * 0.5 + 0.5) ** 2 * rock.lumpiness * 0.6)
        },
    }
}

export function buildRock(rock: RockParameters, seed: number, detail: number): THREE.BufferGeometry {
    const field = createRockField(rock, seed)
    const longest = Math.max(rock.width, rock.height, rock.depth)
    const cell = longest / (GRID * Math.sqrt(detail))
    const cells: number[] = []
    const reachX = Math.ceil((rock.width * 0.75) / cell)
    const reachZ = Math.ceil((rock.depth * 0.75) / cell)
    const top = Math.ceil((rock.height * 1.25) / cell)
    const bottom = -Math.ceil((rock.height * 0.3) / cell) - 1

    for (let i = -reachX; i <= reachX; i++) {
        for (let j = bottom; j <= top; j++) {
            for (let k = -reachZ; k <= reachZ; k++) {
                cells.push(i, j, k)
            }
        }
    }

    const {stoneDeep, stoneLight} = STONE_COLOURS[rock.palette]
    const deep = new THREE.Color(stoneDeep)
    const light = new THREE.Color(stoneLight)
    const moss = new THREE.Color(MOSS_COLOUR)
    const paint = new THREE.Color()
    const grid = Int32Array.from(cells)

    const chunk = sculptCells(field, grid, cell, (x, y, z, n, colors) => {
        const blotch = Math.sin(x * 5.3 + z * 2.1) * Math.sin(y * 4.7 + x * 1.3) * Math.sin(z * 6.1 + y * 2.3)

        paint.copy(deep).lerp(light, Math.min(1, Math.max(0, 0.15 + (n[1] * 0.5 + 0.5) * 0.65 + blotch * 0.12 - field.crease(x, y, z) * 0.6)))
        paint.lerp(moss, Math.min(1, rock.moss * Math.max(0, n[1] * 1.4 + blotch * 0.9 - 0.2)))
        colors.push(paint.r, paint.g, paint.b)
    })

    const buffers: MeshBuffers = {positions: [], normals: [], colors: [], indices: []}

    joinChunks(grid, [chunk], buffers, GROUND_LEVEL)

    // Whatever reaches underground is pressed flat on the ground, out of sight.
    for (let i = 1; i < buffers.positions.length; i += 3) {
        buffers.positions[i] = Math.max(buffers.positions[i], GROUND_LEVEL)
    }

    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3))
    geometry.setIndex(buffers.indices)
    geometry.computeBoundingSphere()

    return geometry
}

interface RockBodyParameters {
    readonly rock: RockParameters
    readonly seed: number
}

function validateBody(parameters: unknown) {
    const raw = (parameters ?? {}) as {rock?: unknown; seed?: unknown}
    const rock = validateRock(raw.rock)

    return {
        ...rock,
        parameters: {
            rock: rock.parameters,
            seed: typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? Math.trunc(raw.seed) : 0,
        },
    }
}

export const rockBodyGenerator: PartGenerator<RockBodyParameters> = {
    id: 'rock-body',
    version: 1,
    type: 'rock',
    label: 'Rock',
    // Its controls live on the prop: one rebuild, one undo step.
    parameters: [],
    scalesWithDetail: true,

    createDefaultParameters() {
        return {rock: rockDefaults, seed: 0}
    },

    validate: validateBody,

    generate({rock, seed}, {detail = 1}) {
        return {
            geometry: buildRock(rock, seed, detail),
            material: 'painted',
            role: 'solid',
            surface: {vertexColors: true},
        }
    },
}

export const rockGenerator: PropGenerator<RockParameters> = {
    id: 'rock',
    version: 1,
    label: 'Rock',
    parameters: specs,
    paintsOwnColours: true,
    still: true,

    createDefaultParameters() {
        return rockDefaults
    },

    validate: validateRock,

    collision(rock) {
        const across = (rock.width + rock.depth) / 4

        return [
            {
                start: [0, 0, 0],
                end: [0, rock.height, 0],
                startRadius: across * COLLISION_BASE,
                endRadius: across * COLLISION_TOP,
            },
        ]
    },

    generate(parameters, {seed}) {
        return [
            {
                id: 'cmp-rock-0',
                type: 'rock',
                generatorId: rockBodyGenerator.id,
                generatorVersion: rockBodyGenerator.version,
                parentId: null,
                transform: IDENTITY_TRANSFORM,
                parameters: {rock: parameters, seed},
                seed,
                slot: 'rock',
            },
        ]
    },
}
