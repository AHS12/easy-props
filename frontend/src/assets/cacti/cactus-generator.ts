/**
 * Cacti. See `cactus-mesh.ts`.
 */

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
import {CACTUS_ROWS, FLOWER_ROWS, OWN_COLOURS_OPTION, ownColours, type OwnColours} from '../style/own-colours'
import {CACTUS_COLOURS, CACTUS_RAMPS, PETAL_RAMPS, type CactusPaletteId, type PetalPaletteId} from '../style/palettes'
import {buildCactusMesh, type CactusBuild, type CactusKind, type CactusParameters} from './cactus-mesh'

const SHAPE = 'Shape'
const SURFACE = 'Ridges & spines'
const FLOWERS = 'Flowers'
const COLOURS = 'Colours'

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

const KIND: ChoiceParameter<CactusKind> = {
    kind: 'choice',
    group: SHAPE,
    key: 'kind',
    label: 'Kind of cactus',
    help: 'A tall column with arms, a round barrel, or flat pads growing from each other.',
    default: 'column',
    options: [
        {value: 'column', label: 'Column'},
        {value: 'barrel', label: 'Barrel'},
        {value: 'paddle', label: 'Paddles'},
    ],
}

const BUILD: ChoiceParameter<CactusBuild> = {
    kind: 'choice',
    group: SHAPE,
    key: 'build',
    label: 'Style',
    help: 'Normal is rounded and spiny. Low-poly is the same cactus in a few flat faces, each one colour.',
    default: 'painted',
    options: [
        {value: 'painted', label: 'Normal'},
        {value: 'low-poly', label: 'Low-poly'},
    ],
}

const capitalised = (value: string) => value[0].toUpperCase() + value.slice(1)

const PALETTE: ChoiceParameter<CactusPaletteId | OwnColours> = {
    kind: 'choice',
    group: COLOURS,
    key: 'palette',
    label: 'Colour',
    help: 'The green of the cactus and the colour of its spines.',
    default: 'desert',
    options: [...(Object.keys(CACTUS_COLOURS) as CactusPaletteId[]).map((value) => ({value, label: capitalised(value)})), OWN_COLOURS_OPTION],
}

const FLOWER_COLOUR: ChoiceParameter<PetalPaletteId | OwnColours> = {
    kind: 'choice',
    group: FLOWERS,
    key: 'flowerColour',
    label: 'Flower colour',
    help: 'The colour of the flowers.',
    default: 'pink',
    options: [...(Object.keys(PETAL_RAMPS) as PetalPaletteId[]).map((value) => ({value, label: capitalised(value)})), OWN_COLOURS_OPTION],
}

const OWN_CACTUS = ownColours(PALETTE, CACTUS_RAMPS, CACTUS_ROWS, 'cactus')
const OWN_FLOWERS = ownColours(FLOWER_COLOUR, PETAL_RAMPS, FLOWER_ROWS, 'flowers')

const HEIGHT = number(SHAPE, 'height', 'Height', 'How tall the cactus stands.', 0.1, 14, 0.05, 4, 'm')
const THICKNESS = number(SHAPE, 'thickness', 'Thickness', 'How thick the main stem is. On paddles, how wide each pad is.', 0.04, 1.6, 0.01, 0.42, 'm')
const LEAN = number(SHAPE, 'lean', 'Lean', 'How far the stem tips over as it rises.', 0, 0.4, 0.01, 0.04)
const ARMS = number(SHAPE, 'arms', 'Arms', 'How many arms bend out and up from the stem.', 0, 8, 1, 3, 'count')
const ARM_HEIGHT = number(SHAPE, 'armHeight', 'Arm height', 'How far up the stem the lowest arm grows. Low, they rise from the ground like organ pipes.', 0.05, 0.8, 0.01, 0.36)
const PADS = number(SHAPE, 'pads', 'Pads', 'How many flat pads grow from each other.', 1, 40, 1, 12, 'count')
const RIBS = number(SURFACE, 'ribs', 'Ridges', 'How many ridges run up the stem.', 0, 30, 1, 12, 'count')
const RIB_DEPTH = number(SURFACE, 'ribDepth', 'Ridge depth', 'How deep the valleys between the ridges are.', 0, 1, 0.05, 0.55)
const SPINES = number(SURFACE, 'spines', 'Spines', 'How thickly spines grow. 0 leaves it smooth.', 0, 1, 0.05, 0.6)
const FLOWER_COUNT = number(FLOWERS, 'flowers', 'Flowers', 'How many flowers open on top.', 0, 16, 1, 0, 'count')

const specs: readonly ParameterSpec[] = [BUILD, KIND, HEIGHT, THICKNESS, LEAN, ARMS, ARM_HEIGHT, PADS, RIBS, RIB_DEPTH, SPINES, FLOWER_COUNT, FLOWER_COLOUR, ...OWN_FLOWERS.specs, PALETTE, ...OWN_CACTUS.specs]

/** Controls a kind has no use for. */
const HIDDEN_BY_KIND: Readonly<Record<CactusKind, readonly string[]>> = {
    column: ['pads'],
    barrel: ['arms', 'armHeight', 'pads'],
    paddle: ['arms', 'armHeight', 'ribs', 'ribDepth', 'lean'],
}

export const cactusDefaults: CactusParameters = {
    build: BUILD.default,
    kind: KIND.default,
    height: HEIGHT.default,
    thickness: THICKNESS.default,
    ribs: RIBS.default,
    ribDepth: RIB_DEPTH.default,
    arms: ARMS.default,
    armHeight: ARM_HEIGHT.default,
    pads: PADS.default,
    lean: LEAN.default,
    spines: SPINES.default,
    flowers: FLOWER_COUNT.default,
    palette: PALETTE.default,
    flowerColour: FLOWER_COLOUR.default,
}

const whole = (spec: NumberParameter) => numberSchema(spec).transform((value) => Math.round(value))

const cactusSchema = z.object({
    build: choiceSchema(BUILD),
    kind: choiceSchema(KIND),
    height: numberSchema(HEIGHT),
    thickness: numberSchema(THICKNESS),
    ribs: whole(RIBS),
    ribDepth: numberSchema(RIB_DEPTH),
    arms: whole(ARMS),
    armHeight: numberSchema(ARM_HEIGHT),
    pads: whole(PADS),
    lean: numberSchema(LEAN),
    spines: numberSchema(SPINES),
    flowers: whole(FLOWER_COUNT),
    palette: choiceSchema(PALETTE),
    flowerColour: choiceSchema(FLOWER_COLOUR),
    ...OWN_CACTUS.schema,
    ...OWN_FLOWERS.schema,
})

const validateCactus = (parameters: unknown) =>
    validateParameters<CactusParameters>(cactusSchema as unknown as z.ZodType<CactusParameters>, parameters, cactusDefaults)

interface CactusBodyParameters {
    readonly cactus: CactusParameters
    readonly seed: number
}

function validateBody(parameters: unknown) {
    const raw = (parameters ?? {}) as {cactus?: unknown; seed?: unknown}
    const cactus = validateCactus(raw.cactus)

    return {
        ...cactus,
        parameters: {
            cactus: cactus.parameters,
            seed: typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? Math.trunc(raw.seed) : 0,
        },
    }
}

export const cactusBodyGenerator: PartGenerator<CactusBodyParameters> = {
    id: 'cactus-body',
    version: 1,
    type: 'cactus',
    label: 'Cactus',
    // Its controls live on the prop: one rebuild, one undo step.
    parameters: [],
    scalesWithDetail: true,

    createDefaultParameters() {
        return {cactus: cactusDefaults, seed: 0}
    },

    validate: validateBody,

    generate({cactus, seed}, {detail = 1}) {
        return {
            geometry: buildCactusMesh(cactus, seed, detail),
            material: 'painted',
            role: 'solid',
            surface: {vertexColors: true},
        }
    },
}

export const cactusGenerator: PropGenerator<CactusParameters> = {
    id: 'cactus',
    version: 1,
    label: 'Cactus',
    // Short barrels and pads are rarely seen from far off.
    farAway: (parameters) => parameters.kind === 'column',
    parameters: specs,
    paintsOwnColours: true,
    still: true,
    lowPoly: true,
    budgetAdvice: 'Lower Spines, Ridges or Pads.',
    fitControls: [
        {key: 'spines', limit: 0.2},
        {key: 'ribs', limit: 6},
        {key: 'pads', limit: 4},
    ],

    createDefaultParameters() {
        return cactusDefaults
    },

    validate: validateCactus,

    shownControls(values) {
        // Style is a switch over the view.
        const hidden = ['build', ...(HIDDEN_BY_KIND[(values.kind as CactusKind) ?? KIND.default] ?? [])]
        const flowers = Number(values.flowers ?? 0) > 0

        return specs.filter((spec) => !hidden.includes(spec.key) && (flowers || spec.key !== 'flowerColour'))
    },

    generate(parameters, {seed}) {
        return [
            {
                id: 'cmp-cactus-0',
                type: 'cactus',
                generatorId: cactusBodyGenerator.id,
                generatorVersion: cactusBodyGenerator.version,
                parentId: null,
                transform: IDENTITY_TRANSFORM,
                parameters: {cactus: parameters, seed},
                seed,
                slot: 'cactus',
            },
        ]
    },
}
