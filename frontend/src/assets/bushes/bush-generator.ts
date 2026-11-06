/**
 * Bushes. See `bush-mesh.ts`.
 *
 * Two parts, because they draw with different materials: the solid core, and the
 * leaves with their cut-out texture.
 */

import {z} from 'zod'
import {IDENTITY_TRANSFORM} from '../shared/component-types'
import type {PartGenerator, PropGenerator} from '../shared/generator-types'
import {getLeafTexture} from '../shared/leaf-texture'
import {
    choiceSchema,
    numberSchema,
    validateParameters,
    type ChoiceParameter,
    type NumberParameter,
    type ParameterSpec,
} from '../shared/parameters'
import {FLOWER_ROWS, LEAF_ROWS, OWN_COLOURS_OPTION, ownColours, type OwnColours} from '../style/own-colours'
import {BUSH_RAMPS, PETAL_RAMPS, type BushPaletteId, type PetalPaletteId} from '../style/palettes'
import {buildBushCore, buildBushLeaves, type BushBuild, type BushInside, type BushKind, type BushParameters} from './bush-mesh'
import {buildLowPolyBushBody, buildLowPolyBushFlowers} from './low-poly-bush'

const SHAPE = 'Shape'
const LEAVES = 'Leaves'
const FLOWERS_GROUP = 'Flowers'

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

const KIND: ChoiceParameter<BushKind> = {
    kind: 'choice',
    group: SHAPE,
    key: 'kind',
    label: 'Kind of bush',
    help: 'How the masses of leaves are arranged.',
    default: 'round',
    options: [
        {value: 'round', label: 'Round'},
        {value: 'spreading', label: 'Spreading'},
        {value: 'tall', label: 'Tall'},
        {value: 'hedge', label: 'Hedge'},
    ],
}

const BUILD: ChoiceParameter<BushBuild> = {
    kind: 'choice',
    group: SHAPE,
    key: 'build',
    label: 'Style',
    help: 'Normal is covered in leaves. Low-poly is the same bush in a few flat faces, each one colour.',
    default: 'painted',
    options: [
        {value: 'painted', label: 'Normal'},
        {value: 'low-poly', label: 'Low-poly'},
    ],
}

/** Controls that only shape the leaf cards, which a low-poly bush has none of. */
const HIDDEN_WHEN_LOW_POLY: readonly string[] = ['inside', 'fullness', 'leafSize']

const INSIDE: ChoiceParameter<BushInside> = {
    kind: 'choice',
    group: LEAVES,
    key: 'inside',
    label: 'Inside',
    help: 'Solid hides whatever is behind it. Open shows twigs, and lets you see through. Lower Fullness to open it further.',
    default: 'solid',
    options: [
        {value: 'solid', label: 'Solid'},
        {value: 'open', label: 'Open'},
    ],
}

const PALETTE: ChoiceParameter<BushPaletteId | OwnColours> = {
    kind: 'choice',
    group: LEAVES,
    key: 'palette',
    label: 'Leaves',
    help: 'The colours of the leaves, shadow to highlight.',
    default: 'summer',
    options: [
        ...(Object.keys(BUSH_RAMPS) as BushPaletteId[]).map((value) => ({
            value,
            label: value[0].toUpperCase() + value.slice(1),
        })),
        OWN_COLOURS_OPTION,
    ],
}

const FLOWER_COLOUR: ChoiceParameter<PetalPaletteId | OwnColours> = {
    kind: 'choice',
    group: FLOWERS_GROUP,
    key: 'flowerColour',
    label: 'Flower colour',
    help: 'The colour of its flowers.',
    default: 'pink',
    options: [
        ...(Object.keys(PETAL_RAMPS) as PetalPaletteId[]).map((value) => ({
            value,
            label: value[0].toUpperCase() + value.slice(1),
        })),
        OWN_COLOURS_OPTION,
    ],
}

const OWN_LEAVES = ownColours(PALETTE, BUSH_RAMPS, LEAF_ROWS, 'bush-leaves')
const OWN_FLOWERS = ownColours(FLOWER_COLOUR, PETAL_RAMPS, FLOWER_ROWS, 'flowers')

const WIDTH = number(SHAPE, 'width', 'Width', 'How wide the bush is.', 0.2, 12, 0.1, 3, 'm')
const HEIGHT = number(SHAPE, 'height', 'Height', 'How tall it stands.', 0.2, 8, 0.1, 2, 'm')
const DEPTH = number(SHAPE, 'depth', 'Depth', 'How far it runs from front to back.', 0.2, 12, 0.1, 2.6, 'm')
const LOBES = number(SHAPE, 'lobes', 'Masses', 'How many rounded masses it is made of.', 1, 16, 1, 7)
const LUMPS = number(SHAPE, 'lumps', 'Lumps', 'How far the surface ripples between them.', 0, 1, 0.05, 0.5)
const FULLNESS = number(LEAVES, 'fullness', 'Fullness', 'How many layers of leaves cover each point.', 0.5, 6, 0.1, 3)
const LEAF_SIZE = number(LEAVES, 'leafSize', 'Leaf size', 'How large each cluster of leaves is. Smaller costs more.', 0.04, 0.6, 0.01, 0.2, 'm')
const VARIATION = number(LEAVES, 'variation', 'Variation', 'How much one mass differs from the next.', 0, 1, 0.05, 0.5)

const FLOWERS = number(FLOWERS_GROUP, 'flowers', 'Flowers', 'How thickly it flowers. They gather in drifts on its upper part.', 0, 1, 0.05, 0)
const FLOWER_SIZE = number(FLOWERS_GROUP, 'flowerSize', 'Flower size', 'How large each flower is.', 0.02, 0.3, 0.01, 0.1, 'm')

const specs: readonly ParameterSpec[] = [BUILD, KIND, WIDTH, HEIGHT, DEPTH, LOBES, LUMPS, INSIDE, FULLNESS, LEAF_SIZE, VARIATION, PALETTE, ...OWN_LEAVES.specs, FLOWERS, FLOWER_SIZE, FLOWER_COLOUR, ...OWN_FLOWERS.specs]

export const bushDefaults: BushParameters = {
    build: BUILD.default,
    kind: KIND.default,
    width: WIDTH.default,
    height: HEIGHT.default,
    depth: DEPTH.default,
    lobes: LOBES.default,
    lumps: LUMPS.default,
    fullness: FULLNESS.default,
    leafSize: LEAF_SIZE.default,
    variation: VARIATION.default,
    palette: PALETTE.default,
    inside: INSIDE.default,
    flowers: FLOWERS.default,
    flowerSize: FLOWER_SIZE.default,
    flowerColour: FLOWER_COLOUR.default,
}

const bushSchema = z.object({
    build: choiceSchema(BUILD),
    kind: choiceSchema(KIND),
    width: numberSchema(WIDTH),
    height: numberSchema(HEIGHT),
    depth: numberSchema(DEPTH),
    lobes: numberSchema(LOBES),
    lumps: numberSchema(LUMPS),
    fullness: numberSchema(FULLNESS),
    leafSize: numberSchema(LEAF_SIZE),
    variation: numberSchema(VARIATION),
    palette: choiceSchema(PALETTE),
    inside: choiceSchema(INSIDE),
    flowers: numberSchema(FLOWERS),
    flowerSize: numberSchema(FLOWER_SIZE),
    flowerColour: choiceSchema(FLOWER_COLOUR),
    ...OWN_LEAVES.schema,
    ...OWN_FLOWERS.schema,
})

const validateBush = (parameters: unknown) => validateParameters<BushParameters>(bushSchema, parameters, bushDefaults)

interface BushPartParameters {
    readonly bush: BushParameters
    readonly seed: number
}

function validatePart(parameters: unknown) {
    const raw = (parameters ?? {}) as {bush?: unknown; seed?: unknown}
    const bush = validateBush(raw.bush)

    return {
        ...bush,
        parameters: {
            bush: bush.parameters,
            seed: typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? Math.trunc(raw.seed) : 0,
        },
    }
}

export const bushCoreGenerator: PartGenerator<BushPartParameters> = {
    id: 'bush-core',
    version: 1,
    type: 'bush-core',
    label: 'Bush core',
    // Its controls live on the prop: one rebuild, one undo step.
    parameters: [],
    scalesWithDetail: true,

    createDefaultParameters() {
        return {bush: bushDefaults, seed: 0}
    },

    validate: validatePart,

    generate({bush, seed}, {detail = 1}) {
        return {
            geometry: bush.build === 'low-poly' ? buildLowPolyBushBody(bush, seed, detail) : buildBushCore(bush, seed, detail),
            material: 'painted',
            role: 'solid',
            surface: {vertexColors: true},
        }
    },
}

export const bushLeavesGenerator: PartGenerator<BushPartParameters> = {
    id: 'bush-leaves',
    version: 1,
    type: 'bush-leaves',
    label: 'Leaves',
    parameters: [],
    scalesWithDetail: true,

    createDefaultParameters() {
        return {bush: bushDefaults, seed: 0}
    },

    validate: validatePart,

    generate({bush, seed}, {detail = 1}) {
        // Flowers alone, as real shapes, so nothing is cut out of a picture.
        if (bush.build === 'low-poly') {
            return {geometry: buildLowPolyBushFlowers(bush, seed, detail), material: 'painted', role: 'foliage', surface: {vertexColors: true}}
        }

        return {
            geometry: buildBushLeaves(bush, seed, detail),
            material: 'painted',
            role: 'foliage',
            surface: {vertexColors: true, map: getLeafTexture(), alphaTest: 0.5, receiveShadow: false},
        }
    },
}

export const bushGenerator: PropGenerator<BushParameters> = {
    id: 'bush',
    version: 1,
    label: 'Bush',
    farAway: () => true,
    parameters: specs,
    paintsOwnColours: true,
    lowPoly: true,
    budgetAdvice: 'Lower Fullness or raise Leaf size.',
    lowPolyAdvice: 'Lower Masses.',
    // Fewer masses changes its shape, so it comes last. In Low-poly it is all there is.
    fitControls: [
        {key: 'fullness', limit: 1},
        {key: 'leafSize', limit: 0.35},
        {key: 'lobes', limit: 3},
    ],

    createDefaultParameters() {
        return bushDefaults
    },

    validate: validateBush,

    shownControls(values) {
        // Style is a switch over the view.
        const hidden = ['build', ...(values.build === 'low-poly' ? HIDDEN_WHEN_LOW_POLY : [])]

        return specs.filter((spec) => !hidden.includes(spec.key))
    },

    collision(bush) {
        const across = (bush.width + bush.depth) / 4

        return [{start: [0, 0, 0], end: [0, bush.height * 0.9, 0], startRadius: across * 0.85, endRadius: across * 0.4}]
    },

    generate(parameters, {seed}) {
        return [
            {
                id: 'cmp-bush-core',
                type: 'bush-core',
                generatorId: bushCoreGenerator.id,
                generatorVersion: bushCoreGenerator.version,
                parentId: null,
                transform: IDENTITY_TRANSFORM,
                parameters: {bush: parameters, seed},
                seed,
                slot: 'bush-core',
            },
            {
                id: 'cmp-bush-leaves',
                type: 'bush-leaves',
                generatorId: bushLeavesGenerator.id,
                generatorVersion: bushLeavesGenerator.version,
                parentId: null,
                transform: IDENTITY_TRANSFORM,
                parameters: {bush: parameters, seed},
                seed,
                slot: 'bush-leaves',
            },
        ]
    },
}
