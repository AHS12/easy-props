/**
 * The parameters of the growth generator.
 *
 * Every editable value declares its range and its control here, so the
 * existing inspector renders the right slider and the generator validates
 * against the same numbers. Labels and help text are written for a beginner:
 * they say what the tree will look like, not what the maths does.
 */

import {z} from 'zod'
import {
    choiceSchema,
    numberSchema,
    validateParameters,
    type NumberParameter,
    type ParameterSpec,
    type ValidationResult,
} from '../../shared/parameters'

/** The overall outline of the leafy part of the tree. */
export type CrownShape = 'dome' | 'ellipsoid' | 'cone' | 'irregular'

export type GrowthParameters = {
    /** Total height of the tree, in metres, ground to top. */
    readonly height: number
    /** The diameter the crown fills out to, in metres. */
    readonly crownWidth: number
    /** The outline the crown is grown into. */
    readonly crownShape: CrownShape
    /** How ragged that outline is, 0 for a neat shape and 1 for a wild one. */
    readonly irregularity: number
    /** The radius of the trunk at the ground, in metres. */
    readonly trunkRadius: number
    /** How many points the branches grow towards. */
    readonly attractorCount: number
    /** How far a growing branch can sense those points, in metres. */
    readonly perceptionRadius: number
    /** How close a branch may get to a point before it counts as reached, in metres. */
    readonly killDistance: number
    /** How far a branch advances in one growth step, in metres. */
    readonly stepLength: number
    /** The hard cap on how many joints the tree may have. */
    readonly maxNodes: number
    /** How strongly branches bend upward as they grow. */
    readonly reachForLight: number
    /** How much long limbs sag under their own weight. */
    readonly droop: number
    /** The da Vinci exponent that sets how fast limbs thicken where they branch. */
    readonly pipeExponent: number
    /** The thinnest a twig may become, in metres. */
    readonly minTwigRadius: number
    /** How far up the tree the crown starts, as a share of the height. */
    readonly crownBaseFraction: number
}

const HEIGHT = {
    kind: 'number',
    key: 'height',
    label: 'Height',
    help: 'How tall the tree grows, from the ground to the top of the crown.',
    min: 1,
    max: 20,
    step: 0.1,
    unit: 'm',
    default: 6,
} as const satisfies ParameterSpec

const CROWN_WIDTH = {
    kind: 'number',
    key: 'crownWidth',
    label: 'Crown width',
    help: 'How wide the leafy crown spreads. This is the width of the branches, not the trunk.',
    min: 0.5,
    max: 15,
    step: 0.1,
    unit: 'm',
    default: 4.5,
} as const satisfies ParameterSpec

const CROWN_SHAPE = {
    kind: 'choice',
    key: 'crownShape',
    label: 'Crown shape',
    help: 'The outline the branches fill: a rounded dome, an egg, a pointed cone, or a ragged crown.',
    options: [
        {value: 'dome', label: 'Dome'},
        {value: 'ellipsoid', label: 'Egg'},
        {value: 'cone', label: 'Cone'},
        {value: 'irregular', label: 'Ragged'},
    ],
    default: 'dome',
} as const satisfies ParameterSpec

const IRREGULARITY = {
    kind: 'number',
    key: 'irregularity',
    label: 'Irregularity',
    help: 'How ragged the outline of the crown is. A low value gives a neat shape, a high one a wild crown.',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.3,
} as const satisfies ParameterSpec

const TRUNK_RADIUS = {
    kind: 'number',
    key: 'trunkRadius',
    label: 'Trunk thickness',
    help: 'How thick the trunk is where it meets the ground.',
    min: 0.05,
    max: 1,
    step: 0.01,
    unit: 'm',
    default: 0.28,
} as const satisfies ParameterSpec

const ATTRACTORS = {
    kind: 'number',
    key: 'attractorCount',
    label: 'Crown fullness',
    help: 'How many points the branches grow towards. More points fill the crown out more evenly.',
    min: 100,
    max: 20000,
    step: 100,
    unit: 'count',
    default: 2500,
} as const satisfies ParameterSpec

const PERCEPTION = {
    kind: 'number',
    key: 'perceptionRadius',
    label: 'Branch reach',
    help: 'How far a branch can sense the points it grows towards. Bigger values give longer, straighter limbs.',
    min: 0.05,
    max: 1.5,
    step: 0.01,
    unit: 'm',
    default: 0.55,
} as const satisfies ParameterSpec

const KILL_DISTANCE = {
    kind: 'number',
    key: 'killDistance',
    label: 'Twig spacing',
    help: 'How close a branch may get to a point before it counts as reached. Small values give a finer crown.',
    min: 0.02,
    max: 0.5,
    step: 0.01,
    unit: 'm',
    default: 0.18,
} as const satisfies ParameterSpec

const STEP_LENGTH = {
    kind: 'number',
    key: 'stepLength',
    label: 'Growth step',
    help: 'How far a branch grows in one step. Small values give smoother, more detailed limbs.',
    min: 0.05,
    max: 0.5,
    step: 0.01,
    unit: 'm',
    default: 0.22,
} as const satisfies ParameterSpec

const MAX_NODES = {
    kind: 'number',
    key: 'maxNodes',
    label: 'Node limit',
    help: 'The most joints the tree may have. Lower it to keep a tree simple and quick to draw.',
    min: 100,
    max: 20000,
    step: 100,
    unit: 'count',
    default: 4000,
} as const satisfies ParameterSpec

const REACH_FOR_LIGHT = {
    kind: 'number',
    key: 'reachForLight',
    label: 'Reach for light',
    help: 'How strongly branches bend upward as they grow. At zero they only follow the crown shape.',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.45,
} as const satisfies ParameterSpec

const DROOP = {
    kind: 'number',
    key: 'droop',
    label: 'Droop',
    help: 'How much older, longer limbs sag under their own weight.',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.15,
} as const satisfies ParameterSpec

const PIPE_EXPONENT = {
    kind: 'number',
    key: 'pipeExponent',
    label: 'Thickening',
    help: 'How quickly limbs thicken where they branch. Near 2 keeps them slim, near 3 gives heavy timber.',
    min: 2,
    max: 3,
    step: 0.05,
    default: 2.3,
} as const satisfies ParameterSpec

const MIN_TWIG_RADIUS = {
    kind: 'number',
    key: 'minTwigRadius',
    label: 'Twig thickness',
    help: 'The thinnest a twig can get. Keep it small so the outer crown does not look like wire.',
    min: 0.002,
    max: 0.05,
    step: 0.001,
    unit: 'm',
    default: 0.008,
} as const satisfies ParameterSpec

const CROWN_BASE = {
    kind: 'number',
    key: 'crownBaseFraction',
    label: 'Crown start',
    help: 'How far up the tree the leafy part begins, as a share of the height. A third of the way up is usual.',
    min: 0,
    max: 0.9,
    step: 0.05,
    default: 0.35,
} as const satisfies ParameterSpec

export const growthParameterSpecs: readonly ParameterSpec[] = [
    HEIGHT,
    CROWN_WIDTH,
    CROWN_SHAPE,
    IRREGULARITY,
    TRUNK_RADIUS,
    ATTRACTORS,
    PERCEPTION,
    KILL_DISTANCE,
    STEP_LENGTH,
    MAX_NODES,
    REACH_FOR_LIGHT,
    DROOP,
    PIPE_EXPONENT,
    MIN_TWIG_RADIUS,
    CROWN_BASE,
]

/**
 * A count, rounded to a whole number after it has been clamped.
 *
 * The inspector offers whole steps anyway; the rounding is here so a value
 * that arrived from a file or a preset still means one joint or one
 * attractor rather than a fraction of one.
 */
function wholeNumberSchema(spec: NumberParameter): z.ZodType<number> {
    return numberSchema(spec).transform((value) => Math.round(value))
}

const growthSchema = z.object({
    height: numberSchema(HEIGHT),
    crownWidth: numberSchema(CROWN_WIDTH),
    crownShape: choiceSchema(CROWN_SHAPE),
    irregularity: numberSchema(IRREGULARITY),
    trunkRadius: numberSchema(TRUNK_RADIUS),
    attractorCount: wholeNumberSchema(ATTRACTORS),
    perceptionRadius: numberSchema(PERCEPTION),
    killDistance: numberSchema(KILL_DISTANCE),
    stepLength: numberSchema(STEP_LENGTH),
    maxNodes: wholeNumberSchema(MAX_NODES),
    reachForLight: numberSchema(REACH_FOR_LIGHT),
    droop: numberSchema(DROOP),
    pipeExponent: numberSchema(PIPE_EXPONENT),
    minTwigRadius: numberSchema(MIN_TWIG_RADIUS),
    crownBaseFraction: numberSchema(CROWN_BASE),
})

/** The parameter set a new tree of this kind starts from. */
export const growthDefaults: GrowthParameters = {
    height: HEIGHT.default,
    crownWidth: CROWN_WIDTH.default,
    crownShape: CROWN_SHAPE.default,
    irregularity: IRREGULARITY.default,
    trunkRadius: TRUNK_RADIUS.default,
    attractorCount: ATTRACTORS.default,
    perceptionRadius: PERCEPTION.default,
    killDistance: KILL_DISTANCE.default,
    stepLength: STEP_LENGTH.default,
    maxNodes: MAX_NODES.default,
    reachForLight: REACH_FOR_LIGHT.default,
    droop: DROOP.default,
    pipeExponent: PIPE_EXPONENT.default,
    minTwigRadius: MIN_TWIG_RADIUS.default,
    crownBaseFraction: CROWN_BASE.default,
}

/**
 * Validates a parameter object against the growth parameters.
 *
 * Never throws. Out-of-range values are clamped and reported, so the UI can
 * say what changed rather than refusing the edit.
 */
export function validateGrowthParameters(parameters: unknown): ValidationResult<GrowthParameters> {
    return validateParameters(growthSchema, parameters, growthDefaults)
}
