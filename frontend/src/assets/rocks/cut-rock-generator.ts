/**
 * Stylized rocks: solid chunks cut by flat planes, and overlapped.
 *
 * Replaces the sculpted rock in `rock-generator.ts`, which stays so that a rock
 * someone already saved still opens.
 */

import {z} from 'zod'
import {IDENTITY_TRANSFORM} from '../shared/component-types'
import type {CollisionShape, PartGenerator, PropGenerator} from '../shared/generator-types'
import {
    choiceSchema,
    numberSchema,
    validateParameters,
    type ChoiceParameter,
    type NumberParameter,
    type ParameterSpec,
} from '../shared/parameters'
import {OWN_COLOURS_OPTION, STONE_ROWS, ownColours, type OwnColourValues, type OwnColours} from '../style/own-colours'
import {ROCK_RAMPS, type RockPaletteId} from '../style/palettes'
import {buildLowPolyRockMesh} from './low-poly-rock'
import {buildRockMesh} from './rock-mesh'
import {facesOfChunk, planRock, type RockKind} from './rock-plan'
import {MOSS_FROM, SNOW, WEATHER, WET, weatherDefaults, weatherSchema, wetSurface, type MossFrom} from '../shared/weather'

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

const KIND: ChoiceParameter<RockKind> = {
    kind: 'choice',
    group: SHAPE,
    key: 'kind',
    label: 'Kind of rock',
    help: 'How the chunks are arranged.',
    default: 'boulder',
    options: [
        {value: 'boulder', label: 'Boulder'},
        {value: 'outcrop', label: 'Outcrop'},
        {value: 'pillar', label: 'Pillar'},
        {value: 'cliff', label: 'Cliff'},
    ],
}

export type RockBuild = 'painted' | 'low-poly'

const BUILD: ChoiceParameter<RockBuild> = {
    kind: 'choice',
    group: SHAPE,
    key: 'build',
    label: 'Style',
    help: 'Normal has soft, carved edges. Low-poly is the same rock in hard flat faces, each one colour.',
    default: 'painted',
    options: [
        {value: 'painted', label: 'Normal'},
        {value: 'low-poly', label: 'Low-poly'},
    ],
}

const PALETTE: ChoiceParameter<RockPaletteId | OwnColours> = {
    kind: 'choice',
    group: SURFACE,
    key: 'palette',
    label: 'Stone',
    help: 'The colours of the stone, shadow to highlight.',
    default: 'lavender',
    options: [
        ...(Object.keys(ROCK_RAMPS) as RockPaletteId[]).map((value) => ({
            value,
            label: value[0].toUpperCase() + value.slice(1),
        })),
        OWN_COLOURS_OPTION,
    ],
}

/** Controls a low-poly rock has no use for: its edges are hard and its faces flat. */
const HIDDEN_WHEN_LOW_POLY: readonly string[] = ['edges', 'bend']

const STONE = ownColours(PALETTE, ROCK_RAMPS, STONE_ROWS, 'stone')

const WIDTH = number(SHAPE, 'width', 'Width', 'How wide the rock is.', 0.2, 40, 0.1, 3, 'm')
const HEIGHT = number(SHAPE, 'height', 'Height', 'How tall the rock stands.', 0.1, 40, 0.1, 2, 'm')
const DEPTH = number(SHAPE, 'depth', 'Depth', 'How far it runs from front to back.', 0.2, 40, 0.1, 2.6, 'm')
const CHUNKS = number(SHAPE, 'chunks', 'Chunks', 'How many pieces of stone it is built from.', 1, 40, 1, 4)
const FACES = number(SHAPE, 'faces', 'Faces', 'How many flat faces each chunk is cut into.', 0, 1, 0.05, 0.6)
const CUTS = number(SHAPE, 'cuts', 'Cut depth', 'From grazed corners to deep, sharp cuts.', 0, 1, 0.05, 0.65)
const EDGES = number(SURFACE, 'edges', 'Edge softness', 'From hard edges to edges that catch the light.', 0, 1, 0.05, 0.7)
const BEND = number(SURFACE, 'bend', 'Bend', 'How far the flat faces bend, so they look carved and not machined.', 0, 1, 0.05, 0.5)
const MOSS = number(WEATHER, 'moss', 'Moss', 'Green caps on whatever faces the sky, or the shady side.', 0, 1, 0.05, 0.5)
const VARIATION = number(SURFACE, 'variation', 'Variation', 'How much one face differs from the next.', 0, 1, 0.05, 0.5)

const specs: readonly ParameterSpec[] = [BUILD, KIND, WIDTH, HEIGHT, DEPTH, CHUNKS, FACES, CUTS, EDGES, BEND, VARIATION, PALETTE, ...STONE.specs, SNOW, MOSS, MOSS_FROM, WET]

export interface CutRockParameters extends Partial<OwnColourValues<typeof STONE_ROWS>> {
    readonly build: RockBuild
    readonly kind: RockKind
    readonly width: number
    readonly height: number
    readonly depth: number
    readonly chunks: number
    readonly faces: number
    readonly cuts: number
    readonly edges: number
    readonly bend: number
    readonly moss: number
    readonly mossFrom: MossFrom
    readonly snow: number
    readonly wet: number
    readonly variation: number
    readonly palette: RockPaletteId | OwnColours
}

export const cutRockDefaults: CutRockParameters = {
    build: BUILD.default,
    kind: KIND.default,
    width: WIDTH.default,
    height: HEIGHT.default,
    depth: DEPTH.default,
    chunks: CHUNKS.default,
    faces: FACES.default,
    cuts: CUTS.default,
    edges: EDGES.default,
    bend: BEND.default,
    moss: MOSS.default,
    ...weatherDefaults,
    variation: VARIATION.default,
    palette: PALETTE.default,
}

const cutRockSchema = z.object({
    build: choiceSchema(BUILD),
    kind: choiceSchema(KIND),
    width: numberSchema(WIDTH),
    height: numberSchema(HEIGHT),
    depth: numberSchema(DEPTH),
    chunks: numberSchema(CHUNKS),
    faces: numberSchema(FACES),
    cuts: numberSchema(CUTS),
    edges: numberSchema(EDGES),
    bend: numberSchema(BEND),
    moss: numberSchema(MOSS),
    ...weatherSchema,
    variation: numberSchema(VARIATION),
    palette: choiceSchema(PALETTE),
    ...STONE.schema,
})

const validateCutRock = (parameters: unknown) => validateParameters<CutRockParameters>(cutRockSchema, parameters, cutRockDefaults)

interface CutRockBodyParameters {
    readonly rock: CutRockParameters
    readonly seed: number
}

function validateBody(parameters: unknown) {
    const raw = (parameters ?? {}) as {rock?: unknown; seed?: unknown}
    const rock = validateCutRock(raw.rock)

    return {
        ...rock,
        parameters: {
            rock: rock.parameters,
            seed: typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? Math.trunc(raw.seed) : 0,
        },
    }
}

export const cutRockBodyGenerator: PartGenerator<CutRockBodyParameters> = {
    id: 'cut-rock-body',
    version: 1,
    type: 'rock',
    label: 'Rock',
    // Its controls live on the prop: one rebuild, one undo step.
    parameters: [],
    scalesWithDetail: true,

    createDefaultParameters() {
        return {rock: cutRockDefaults, seed: 0}
    },

    validate: validateBody,

    generate({rock, seed}, {detail = 1}) {
        const plan = planRock(rock, seed)

        return {
            geometry: rock.build === 'low-poly' ? buildLowPolyRockMesh(plan, rock, detail) : buildRockMesh(plan, rock, seed, detail),
            material: 'painted',
            role: 'solid',
            surface: wetSurface({vertexColors: true}, rock.wet),
        }
    },
}

/** One tapered shape per chunk: it stands on the ground and narrows with the stone. */
function chunkCollision(rock: CutRockParameters, seed: number): readonly CollisionShape[] {
    return planRock(rock, seed).chunks.flatMap((chunk) => {
        const corners = facesOfChunk(chunk).flatMap((face) => face.corners)
        const top = corners.reduce((highest, p) => Math.max(highest, p[1]), 0)

        if (top <= 0) {
            return []
        }

        const ringAt = (near: number) => {
            const band = corners.filter((p) => Math.abs(p[1] - near) <= top * 0.25)
            const x = band.reduce((sum, p) => sum + p[0], 0) / band.length
            const z = band.reduce((sum, p) => sum + p[2], 0) / band.length

            return {x, z, radius: band.reduce((sum, p) => sum + Math.hypot(p[0] - x, p[2] - z), 0) / band.length}
        }
        // A chunk leaning on others may stop short of the ground.
        const lowest = corners.reduce((least, p) => Math.min(least, p[1]), top)
        const low = ringAt(lowest)
        const high = ringAt(top)

        return [{start: [low.x, Math.max(0, lowest), low.z], end: [high.x, top, high.z], startRadius: low.radius, endRadius: high.radius} as CollisionShape]
    })
}

export const cutRockGenerator: PropGenerator<CutRockParameters> = {
    id: 'cut-rock',
    version: 1,
    label: 'Rock',
    parameters: specs,
    paintsOwnColours: true,
    lowPoly: true,
    still: true,
    budgetAdvice: 'Lower Chunks or Faces.',
    // Fewer faces keeps the rock's outline. Fewer chunks changes its shape, so it comes second.
    fitControls: [
        {key: 'faces', limit: 0.2},
        {key: 'chunks', limit: 2},
    ],

    createDefaultParameters() {
        return cutRockDefaults
    },

    validate: validateCutRock,

    shownControls(values) {
        // Style is a switch over the view. A low-poly rock has hard, flat faces.
        const hidden = ['build', ...(values.build === 'low-poly' ? HIDDEN_WHEN_LOW_POLY : []), ...(Number(values.moss ?? MOSS.default) > 0 ? [] : ['mossFrom'])]

        return specs.filter((spec) => !hidden.includes(spec.key))
    },

    collision: chunkCollision,

    generate(parameters, {seed}) {
        return [
            {
                id: 'cmp-rock-0',
                type: 'rock',
                generatorId: cutRockBodyGenerator.id,
                generatorVersion: cutRockBodyGenerator.version,
                parentId: null,
                transform: IDENTITY_TRANSFORM,
                parameters: {rock: parameters, seed},
                seed,
                slot: 'rock',
            },
        ]
    },
}
