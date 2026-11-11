/**
 * Flowering plants. See `plant-mesh.ts`.
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
import {FLOWER_ROWS, OWN_COLOURS_OPTION, ownColours, type OwnColours} from '../style/own-colours'
import {PETAL_RAMPS, type PetalPaletteId} from '../style/palettes'
import {buildLowPolyPlantMesh} from './low-poly-plant'
import {buildPlantMesh, type PlantBuild, type PlantKind, type PlantLeafKind, type PlantParameters} from './plant-mesh'
import {SNOW, WET, snowAndWetDefaults, snowAndWetSchema, weatherGeometry, wetSurface} from '../shared/weather'

const SHAPE = 'Shape'
const FLOWER = 'Flower'

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

const KIND: ChoiceParameter<PlantKind> = {
    kind: 'choice',
    group: FLOWER,
    key: 'kind',
    label: 'Kind of flower',
    help: 'What sits on top of each stem.',
    default: 'daisy',
    options: [
        {value: 'daisy', label: 'Daisy'},
        {value: 'cup', label: 'Cup'},
        {value: 'spike', label: 'Spike'},
        {value: 'plume', label: 'Plume'},
    ],
}

const BUILD: ChoiceParameter<PlantBuild> = {
    kind: 'choice',
    group: SHAPE,
    key: 'build',
    label: 'Style',
    help: 'Normal is thin and fine. Low-poly is the same flowers as solid shapes in a few flat faces, each one colour.',
    default: 'painted',
    options: [
        {value: 'painted', label: 'Normal'},
        {value: 'low-poly', label: 'Low-poly'},
    ],
}

const PALETTE: ChoiceParameter<PetalPaletteId | OwnColours> = {
    kind: 'choice',
    group: FLOWER,
    key: 'palette',
    label: 'Colour',
    help: 'The colours of the flower, deep to light.',
    default: 'white',
    options: [
        ...(Object.keys(PETAL_RAMPS) as PetalPaletteId[]).map((value) => ({
            value,
            label: value[0].toUpperCase() + value.slice(1),
        })),
        OWN_COLOURS_OPTION,
    ],
}

const OWN_FLOWERS = ownColours(PALETTE, PETAL_RAMPS, FLOWER_ROWS, 'flowers')

const WIDTH = number(SHAPE, 'width', 'Width', 'How wide the clump is.', 0.05, 6, 0.05, 0.8, 'm')
const HEIGHT = number(SHAPE, 'height', 'Height', 'How tall its tallest stem stands.', 0.05, 4, 0.05, 0.5, 'm')
const STEMS = number(SHAPE, 'stems', 'Stems', 'How many flowers there are.', 1, 80, 1, 18)
const LEAN = number(SHAPE, 'lean', 'Lean', 'How far the stems bend over.', 0, 1, 0.05, 0.25)
const LEAVES = number(SHAPE, 'leaves', 'Leaves', 'How many leaves each stem has, or pairs of them up the stem.', 0, 6, 1, 2)
const LEAF_KIND: ChoiceParameter<PlantLeafKind> = {
    kind: 'choice',
    group: SHAPE,
    key: 'leafKind',
    label: 'Kind of leaves',
    help: 'Grass-like strips from the foot, wide upright straps, pairs up the stem, a rosette at the foot, or finely cut leaves.',
    default: 'grass',
    options: [
        {value: 'grass', label: 'Grass-like'},
        {value: 'straps', label: 'Straps'},
        {value: 'stem', label: 'Up the stem'},
        {value: 'rosette', label: 'Broad at the foot'},
        {value: 'feathery', label: 'Feathery'},
    ],
}
const HEAD_SIZE = number(FLOWER, 'headSize', 'Flower size', 'Across a flower, or how long a spike or plume is.', 0.01, 1, 0.01, 0.07, 'm')

const specs: readonly ParameterSpec[] = [BUILD, WIDTH, HEIGHT, STEMS, LEAN, LEAVES, LEAF_KIND, KIND, HEAD_SIZE, PALETTE, ...OWN_FLOWERS.specs, SNOW, WET]

export const plantDefaults: PlantParameters = {
    build: BUILD.default,
    kind: KIND.default,
    width: WIDTH.default,
    height: HEIGHT.default,
    stems: STEMS.default,
    lean: LEAN.default,
    headSize: HEAD_SIZE.default,
    leaves: LEAVES.default,
    leafKind: LEAF_KIND.default,
    palette: PALETTE.default,
    ...snowAndWetDefaults,
}

const plantSchema = z.object({
    build: choiceSchema(BUILD),
    kind: choiceSchema(KIND),
    width: numberSchema(WIDTH),
    height: numberSchema(HEIGHT),
    stems: numberSchema(STEMS),
    lean: numberSchema(LEAN),
    headSize: numberSchema(HEAD_SIZE),
    leaves: numberSchema(LEAVES),
    leafKind: choiceSchema(LEAF_KIND),
    palette: choiceSchema(PALETTE),
    ...snowAndWetSchema,
    ...OWN_FLOWERS.schema,
})

const validatePlant = (parameters: unknown) => validateParameters<PlantParameters>(plantSchema, parameters, plantDefaults)

interface PlantBodyParameters {
    readonly plant: PlantParameters
    readonly seed: number
}

function validateBody(parameters: unknown) {
    const raw = (parameters ?? {}) as {plant?: unknown; seed?: unknown}
    const plant = validatePlant(raw.plant)

    return {
        ...plant,
        parameters: {
            plant: plant.parameters,
            seed: typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? Math.trunc(raw.seed) : 0,
        },
    }
}

export const plantBodyGenerator: PartGenerator<PlantBodyParameters> = {
    id: 'plant-body',
    version: 1,
    type: 'plant',
    label: 'Flowers',
    // Its controls live on the prop: one rebuild, one undo step.
    parameters: [],
    scalesWithDetail: true,

    createDefaultParameters() {
        return {plant: plantDefaults, seed: 0}
    },

    validate: validateBody,

    generate({plant, seed}, {detail = 1}) {
        return {
            geometry: weatherGeometry(plant.build === 'low-poly' ? buildLowPolyPlantMesh(plant, seed, detail) : buildPlantMesh(plant, seed, detail), plant),
            material: 'painted',
            role: 'foliage',
            surface: wetSurface({vertexColors: true, receiveShadow: false}, plant.wet),
        }
    },
}

export const plantGenerator: PropGenerator<PlantParameters> = {
    id: 'plant',
    version: 1,
    label: 'Flowers',
    parameters: specs,
    paintsOwnColours: true,
    swaysEvenly: true,
    lowPoly: true,
    budgetAdvice: 'Lower Stems or Leaves.',
    fitControls: [
        {key: 'stems', limit: 4},
        {key: 'leaves', limit: 0},
    ],

    createDefaultParameters() {
        return plantDefaults
    },

    validate: validatePlant,

    shownControls(values) {
        // Style is a switch over the view. Low-poly flowers keep grass-like leaves, folded.
        return specs.filter((spec) => spec.key !== 'build' && (values.build !== 'low-poly' || spec.key !== 'leafKind'))
    },

    // Nothing stops a player walking through flowers.
    collision() {
        return []
    },

    generate(parameters, {seed}) {
        return [
            {
                id: 'cmp-plant-0',
                type: 'plant',
                generatorId: plantBodyGenerator.id,
                generatorVersion: plantBodyGenerator.version,
                parentId: null,
                transform: IDENTITY_TRANSFORM,
                parameters: {plant: parameters, seed},
                seed,
                slot: 'plant',
            },
        ]
    },
}
