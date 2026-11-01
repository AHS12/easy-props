/**
 * Grass tufts and patches. See `blade-mesh.ts`.
 *
 * Nothing to collide with, and every blade moves about as much as any other, so
 * a patch's rim does not swing further than its middle.
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
import {GRASS_RAMPS, PETAL_RAMPS, type GrassPaletteId, type PetalPaletteId} from '../style/palettes'
import {buildGrassMesh, type GrassParameters} from './blade-mesh'

const SHAPE = 'Shape'
const BLADES = 'Blades'
const COLOUR = 'Colour'

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

const PALETTE: ChoiceParameter<GrassPaletteId> = {
    kind: 'choice',
    group: COLOUR,
    key: 'palette',
    label: 'Grass',
    help: 'The colours of a blade, root to tip.',
    default: 'meadow',
    options: (Object.keys(GRASS_RAMPS) as GrassPaletteId[]).map((value) => ({
        value,
        label: value[0].toUpperCase() + value.slice(1),
    })),
}

const FLOWER_COLOUR: ChoiceParameter<PetalPaletteId> = {
    kind: 'choice',
    group: COLOUR,
    key: 'flowerColour',
    label: 'Flower colour',
    help: 'The colour of the flowers among the blades.',
    default: 'white',
    options: (Object.keys(PETAL_RAMPS) as PetalPaletteId[]).map((value) => ({
        value,
        label: value[0].toUpperCase() + value.slice(1),
    })),
}

const WIDTH = number(SHAPE, 'width', 'Width', 'How wide the patch is.', 0.1, 10, 0.1, 2, 'm')
const HEIGHT = number(SHAPE, 'height', 'Height', 'How tall its tallest blade stands.', 0.05, 3, 0.05, 0.7, 'm')
const COUNT = number(SHAPE, 'blades', 'Blades', 'How many blades there are.', 5, 1500, 5, 450)
const CLUMPS = number(SHAPE, 'clumps', 'Clumps', 'How many groups they grow in. Each leans its own way.', 1, 40, 1, 9)
const GATHER = number(SHAPE, 'gather', 'Gather', 'How tightly blades crowd into their clump.', 0, 1, 0.05, 0.25)
const LEAN = number(BLADES, 'lean', 'Lean', 'From standing straight to bent right over.', 0, 1.2, 0.05, 0.55)
const SCATTER = number(BLADES, 'scatter', 'Scatter', 'From combed one way to every way at once.', 0, 1, 0.05, 0.18)
const BLADE_WIDTH = number(BLADES, 'bladeWidth', 'Blade width', 'How wide a blade is, at its widest.', 0.004, 0.12, 0.002, 0.03, 'm')
const SMOOTHNESS = number(BLADES, 'smoothness', 'Smoothness', 'How many pieces a blade curves through.', 2, 6, 1, 3)
const TALL = number(BLADES, 'tall', 'Standouts', 'How many blades rise taller and wider than the rest.', 0, 0.5, 0.01, 0.08)
const DRYNESS = number(COLOUR, 'dryness', 'Dry clumps', 'How many clumps have gone pale.', 0, 1, 0.05, 0.1)
const VARIATION = number(COLOUR, 'variation', 'Variation', 'How much one clump differs from the next.', 0, 1, 0.05, 0.5)

const FLOWERS = number(COLOUR, 'flowers', 'Flowers', 'How many flowers stand among the blades, in drifts.', 0, 120, 1, 0)

const specs: readonly ParameterSpec[] = [WIDTH, HEIGHT, COUNT, CLUMPS, GATHER, LEAN, SCATTER, BLADE_WIDTH, SMOOTHNESS, TALL, DRYNESS, VARIATION, PALETTE, FLOWERS, FLOWER_COLOUR]

export const grassDefaults: GrassParameters = {
    width: WIDTH.default,
    height: HEIGHT.default,
    blades: COUNT.default,
    clumps: CLUMPS.default,
    gather: GATHER.default,
    lean: LEAN.default,
    scatter: SCATTER.default,
    bladeWidth: BLADE_WIDTH.default,
    smoothness: SMOOTHNESS.default,
    tall: TALL.default,
    dryness: DRYNESS.default,
    variation: VARIATION.default,
    palette: PALETTE.default,
    flowers: FLOWERS.default,
    flowerColour: FLOWER_COLOUR.default,
}

const grassSchema = z.object({
    width: numberSchema(WIDTH),
    height: numberSchema(HEIGHT),
    blades: numberSchema(COUNT),
    clumps: numberSchema(CLUMPS),
    gather: numberSchema(GATHER),
    lean: numberSchema(LEAN),
    scatter: numberSchema(SCATTER),
    bladeWidth: numberSchema(BLADE_WIDTH),
    smoothness: numberSchema(SMOOTHNESS),
    tall: numberSchema(TALL),
    dryness: numberSchema(DRYNESS),
    variation: numberSchema(VARIATION),
    palette: choiceSchema(PALETTE),
    flowers: numberSchema(FLOWERS),
    flowerColour: choiceSchema(FLOWER_COLOUR),
})

const validateGrass = (parameters: unknown) => validateParameters<GrassParameters>(grassSchema, parameters, grassDefaults)

interface GrassBodyParameters {
    readonly grass: GrassParameters
    readonly seed: number
}

function validateBody(parameters: unknown) {
    const raw = (parameters ?? {}) as {grass?: unknown; seed?: unknown}
    const grass = validateGrass(raw.grass)

    return {
        ...grass,
        parameters: {
            grass: grass.parameters,
            seed: typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? Math.trunc(raw.seed) : 0,
        },
    }
}

export const grassBodyGenerator: PartGenerator<GrassBodyParameters> = {
    id: 'grass-body',
    version: 1,
    type: 'grass',
    label: 'Grass',
    // Its controls live on the prop: one rebuild, one undo step.
    parameters: [],
    scalesWithDetail: true,

    createDefaultParameters() {
        return {grass: grassDefaults, seed: 0}
    },

    validate: validateBody,

    generate({grass, seed}, {detail = 1}) {
        return {
            geometry: buildGrassMesh(grass, seed, detail),
            material: 'painted',
            role: 'foliage',
            surface: {vertexColors: true, receiveShadow: false},
        }
    },
}

export const grassGenerator: PropGenerator<GrassParameters> = {
    id: 'grass',
    version: 1,
    label: 'Grass',
    parameters: specs,
    paintsOwnColours: true,
    swaysEvenly: true,
    budgetAdvice: 'Lower Blades or Smoothness.',

    createDefaultParameters() {
        return grassDefaults
    },

    validate: validateGrass,

    // Nothing stops a player walking through grass.
    collision() {
        return []
    },

    generate(parameters, {seed}) {
        return [
            {
                id: 'cmp-grass-0',
                type: 'grass',
                generatorId: grassBodyGenerator.id,
                generatorVersion: grassBodyGenerator.version,
                parentId: null,
                transform: IDENTITY_TRANSFORM,
                parameters: {grass: parameters, seed},
                seed,
                slot: 'grass',
            },
        ]
    },
}
