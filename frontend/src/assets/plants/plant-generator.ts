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
import {buildPlantMesh, type PlantKind, type PlantParameters} from './plant-mesh'

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
const LEAVES = number(SHAPE, 'leaves', 'Leaves', 'Leaves at the foot of each stem.', 0, 6, 1, 2)
const HEAD_SIZE = number(FLOWER, 'headSize', 'Flower size', 'Across a flower, or how long a spike or plume is.', 0.01, 1, 0.01, 0.07, 'm')

const specs: readonly ParameterSpec[] = [WIDTH, HEIGHT, STEMS, LEAN, LEAVES, KIND, HEAD_SIZE, PALETTE, ...OWN_FLOWERS.specs]

export const plantDefaults: PlantParameters = {
    kind: KIND.default,
    width: WIDTH.default,
    height: HEIGHT.default,
    stems: STEMS.default,
    lean: LEAN.default,
    headSize: HEAD_SIZE.default,
    leaves: LEAVES.default,
    palette: PALETTE.default,
}

const plantSchema = z.object({
    kind: choiceSchema(KIND),
    width: numberSchema(WIDTH),
    height: numberSchema(HEIGHT),
    stems: numberSchema(STEMS),
    lean: numberSchema(LEAN),
    headSize: numberSchema(HEAD_SIZE),
    leaves: numberSchema(LEAVES),
    palette: choiceSchema(PALETTE),
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
            geometry: buildPlantMesh(plant, seed, detail),
            material: 'painted',
            role: 'foliage',
            surface: {vertexColors: true, receiveShadow: false},
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
    budgetAdvice: 'Lower Stems or Leaves.',
    fitControls: [
        {key: 'stems', limit: 4},
        {key: 'leaves', limit: 0},
    ],

    createDefaultParameters() {
        return plantDefaults
    },

    validate: validatePlant,

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
