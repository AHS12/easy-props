/**
 * The palm tree generator.
 *
 * Produces the component list for a palm: a ringed trunk, the crown where the
 * fronds meet it, a ring of fronds, and a bunch of coconuts. Like the
 * branching tree it produces components rather than geometry, so one frond
 * can be regenerated without touching the rest of the palm.
 */

import * as THREE from 'three'
import {z} from 'zod'
import type {GeneratedComponent, PropGenerator} from '../shared/generator-types'
import {IDENTITY_TRANSFORM, type Transform} from '../shared/component-types'
import {buildSpinePoints} from '../shared/geometry-utils'
import {createSeededRandom, hashSeed, randomRange} from '../shared/random'
import {
    choiceSchema,
    numberSchema,
    validateParameters,
    type ParameterSpec,
    type ValidationResult,
} from '../shared/parameters'
import {palmTrunkGenerator, PALM_TRUNK_POINTS} from './components/palm-trunk'
import {palmCrownGenerator} from './components/palm-crown'
import {palmFrondGenerator, type FrondArch} from './components/palm-frond'
import {coconutClusterGenerator} from './components/coconut-cluster'
import type {BendAmount} from './components/trunk'

export type PalmTreeParameters = {
    readonly height: number
    readonly trunkRadius: number
    readonly taper: number
    readonly bend: BendAmount
    readonly twist: number
    readonly rings: number
    readonly ringDepth: number
    readonly crownSize: number
    readonly frondCount: number
    readonly frondLength: number
    readonly frondArch: FrondArch
    readonly leaflets: number
    readonly coconutCount: number
    readonly coconutSize: number
}

const HEIGHT = {
    kind: 'number', key: 'height', label: 'Height', help: 'How tall the palm is.',
    min: 1, max: 18, step: 0.1, unit: 'm', default: 5.5,
} as const satisfies ParameterSpec

const THICKNESS = {
    kind: 'number', key: 'trunkRadius', label: 'Thickness',
    help: 'How thick the trunk is at the base.',
    min: 0.08, max: 1.2, step: 0.01, unit: 'm', default: 0.34,
} as const satisfies ParameterSpec

const TAPER = {
    kind: 'number', key: 'taper', label: 'Taper',
    help: 'How much the trunk narrows toward the top.',
    min: 0.2, max: 1, step: 0.01, default: 0.72,
} as const satisfies ParameterSpec

const BEND = {
    kind: 'choice', key: 'bend', label: 'Bend', help: 'How much the trunk curves.',
    options: [
        {value: 'straight', label: 'Straight'},
        {value: 'curved', label: 'Curved'},
        {value: 'very-curved', label: 'Very curved'},
    ],
    default: 'curved',
} as const satisfies ParameterSpec

const TWIST = {
    kind: 'number', key: 'twist', label: 'Twist', help: 'How much the trunk spirals.',
    min: -180, max: 180, step: 5, unit: 'deg', default: 0,
} as const satisfies ParameterSpec

const RINGS = {
    kind: 'number', key: 'rings', label: 'Rings',
    help: 'How many leaf scars run round the trunk.',
    min: 0, max: 40, step: 1, unit: 'count', default: 14,
} as const satisfies ParameterSpec

const RING_DEPTH = {
    kind: 'number', key: 'ringDepth', label: 'Ring depth',
    help: 'How deeply the scars cut in. Zero leaves the trunk plain.',
    min: 0, max: 0.3, step: 0.01, default: 0.08,
} as const satisfies ParameterSpec

const CROWN_SIZE = {
    kind: 'number', key: 'crownSize', label: 'Crown size',
    help: 'How big the knob where the fronds meet the trunk is.',
    min: 0.1, max: 1.2, step: 0.02, unit: 'm', default: 0.42,
} as const satisfies ParameterSpec

const FRONDS = {
    kind: 'number', key: 'frondCount', label: 'Fronds', help: 'How many fronds the crown carries.',
    min: 3, max: 24, step: 1, unit: 'count', default: 9,
} as const satisfies ParameterSpec

const FROND_LENGTH = {
    kind: 'number', key: 'frondLength', label: 'Frond length', help: 'How long each frond is.',
    min: 0.6, max: 6, step: 0.1, unit: 'm', default: 2.8,
} as const satisfies ParameterSpec

const FROND_ARCH = {
    kind: 'choice', key: 'frondArch', label: 'Frond arch',
    help: 'The shape the fronds make as they reach out.',
    options: [
        {value: 'upright', label: 'Upright'},
        {value: 'arched', label: 'Arched'},
        {value: 'drooping', label: 'Drooping'},
    ],
    default: 'arched',
} as const satisfies ParameterSpec

const LEAFLETS = {
    kind: 'number', key: 'leaflets', label: 'Leaflets',
    help: 'How many leaflets run along each frond.',
    min: 4, max: 40, step: 1, unit: 'count', default: 16,
} as const satisfies ParameterSpec

const COCONUTS = {
    kind: 'number', key: 'coconutCount', label: 'Coconuts',
    help: 'How many coconuts hang under the crown.',
    min: 0, max: 8, step: 1, unit: 'count', default: 4,
} as const satisfies ParameterSpec

const COCONUT_SIZE = {
    kind: 'number', key: 'coconutSize', label: 'Coconut size',
    help: 'How wide each coconut is.',
    min: 0.06, max: 0.4, step: 0.01, unit: 'm', default: 0.16,
} as const satisfies ParameterSpec

export const palmTreeParameterSpecs: readonly ParameterSpec[] = [
    HEIGHT,
    THICKNESS,
    TAPER,
    BEND,
    TWIST,
    RINGS,
    RING_DEPTH,
    CROWN_SIZE,
    FRONDS,
    FROND_LENGTH,
    FROND_ARCH,
    LEAFLETS,
    COCONUTS,
    COCONUT_SIZE,
]

const palmTreeSchema = z.object({
    height: numberSchema(HEIGHT),
    trunkRadius: numberSchema(THICKNESS),
    taper: numberSchema(TAPER),
    bend: choiceSchema(BEND),
    twist: numberSchema(TWIST),
    rings: numberSchema(RINGS),
    ringDepth: numberSchema(RING_DEPTH),
    crownSize: numberSchema(CROWN_SIZE),
    frondCount: numberSchema(FRONDS),
    frondLength: numberSchema(FROND_LENGTH),
    frondArch: choiceSchema(FROND_ARCH),
    leaflets: numberSchema(LEAFLETS),
    coconutCount: numberSchema(COCONUTS),
    coconutSize: numberSchema(COCONUT_SIZE),
})

/**
 * How far up each frond leaves the crown.
 *
 * This is the vertical part of the direction the frond is pointed in, before
 * it is normalised, so a bigger number holds the fronds closer to upright.
 */
const ARCH_PITCH: Readonly<Record<FrondArch, number>> = {
    upright: 0.75,
    arched: 0.4,
    drooping: 0.1,
}

/** How far the seed may swing a frond off its even share of the ring. */
const AZIMUTH_JITTER = 0.12
/** How much the seed may lengthen or shorten a frond, as a share of its length. */
const LENGTH_JITTER = 0.12

/** Every frond leaves with this leaflet length, which the tree does not control. */
const FROND_WIDTH = 0.32
const FROND_ARCH_AMOUNT = 0.55

const CROWN_LOBES = 6
/** The crown's spread as a share of its size, so the crown keeps its shape. */
const CROWN_SPREAD_SHARE = 0.7

const COCONUT_SPREAD = 0.18
/** How far below the crown's middle the coconuts hang, as a share of its size. */
const COCONUT_DROP = 0.4

/** The rotation that turns the local positive X axis along a direction. */
function rotationTowards(direction: THREE.Vector3): Transform['rotation'] {
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(1, 0, 0),
        direction.clone().normalize(),
    )

    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ')

    return [euler.x, euler.y, euler.z]
}

function transformOf(position: THREE.Vector3, rotation: Transform['rotation']): Transform {
    return {
        position: [position.x, position.y, position.z],
        rotation,
        scale: [1, 1, 1],
    }
}

export const palmTreeGenerator: PropGenerator<PalmTreeParameters> = {
    id: 'palm-tree',
    version: 1,
    label: 'Palm',
    farAway: () => true,
    parameters: palmTreeParameterSpecs,

    createDefaultParameters(): PalmTreeParameters {
        return {
            height: HEIGHT.default,
            trunkRadius: THICKNESS.default,
            taper: TAPER.default,
            bend: BEND.default,
            twist: TWIST.default,
            rings: RINGS.default,
            ringDepth: RING_DEPTH.default,
            crownSize: CROWN_SIZE.default,
            frondCount: FRONDS.default,
            frondLength: FROND_LENGTH.default,
            frondArch: FROND_ARCH.default,
            leaflets: LEAFLETS.default,
            coconutCount: COCONUTS.default,
            coconutSize: COCONUT_SIZE.default,
        }
    },

    validate(parameters: unknown): ValidationResult<PalmTreeParameters> {
        return validateParameters(
            palmTreeSchema,
            parameters,
            this.createDefaultParameters(),
        )
    },

    generate(parameters, context): readonly GeneratedComponent[] {
        const components: GeneratedComponent[] = []
        const seed = context.seed

        // --- Trunk -------------------------------------------------------
        // Validated rather than copied, so the trunk arrives with the spine
        // its bend and control points ask for.
        const trunk = palmTrunkGenerator.validate({
            height: parameters.height,
            baseRadius: parameters.trunkRadius,
            taper: parameters.taper,
            rings: parameters.rings,
            ringDepth: parameters.ringDepth,
            twist: parameters.twist,
            bend: parameters.bend,
            controlPoints: PALM_TRUNK_POINTS,
            spine: [],
        }).parameters

        const trunkId = 'cmp-trunk-0'

        components.push({
            id: trunkId,
            type: 'trunk',
            generatorId: palmTrunkGenerator.id,
            generatorVersion: palmTrunkGenerator.version,
            parentId: null,
            transform: IDENTITY_TRANSFORM,
            parameters: trunk,
            seed: hashSeed(seed, 0),
            slot: 'trunk',
        })

        // Where the trunk actually ends: a bent or twisted palm carries its
        // crown away from the axis, so the tip is read off the spine rather
        // than assumed to be straight above the base.
        const spinePoints = buildSpinePoints(trunk.spine, trunk.height, trunk.twist)
        const tip = spinePoints[spinePoints.length - 1]

        // --- Crown -------------------------------------------------------
        const crown = palmCrownGenerator.validate({
            size: parameters.crownSize,
            spread: parameters.crownSize * CROWN_SPREAD_SHARE,
            lobes: CROWN_LOBES,
        }).parameters

        const crownId = 'cmp-crown-0'

        components.push({
            id: crownId,
            type: 'palm-crown',
            generatorId: palmCrownGenerator.id,
            generatorVersion: palmCrownGenerator.version,
            parentId: trunkId,
            transform: transformOf(tip, [0, 0, 0]),
            parameters: crown,
            seed: hashSeed(seed, 500),
            slot: 'crown-0',
        })

        // --- Fronds ------------------------------------------------------
        const frondCount = Math.round(parameters.frondCount)
        const pitch = ARCH_PITCH[parameters.frondArch] ?? ARCH_PITCH.arched

        for (let index = 0; index < frondCount; index++) {
            // Each frond has a seed of its own, so its swing and its length
            // belong to that frond rather than to the order they are built in.
            const frondSeed = hashSeed(seed, 100 + index)
            const random = createSeededRandom(frondSeed)

            const azimuth =
                (index / frondCount) * Math.PI * 2 +
                randomRange(random, -AZIMUTH_JITTER, AZIMUTH_JITTER)

            const direction = new THREE.Vector3(
                Math.cos(azimuth),
                pitch,
                Math.sin(azimuth),
            ).normalize()

            const frond = palmFrondGenerator.validate({
                length:
                    parameters.frondLength *
                    randomRange(random, 1 - LENGTH_JITTER, 1 + LENGTH_JITTER),
                width: FROND_WIDTH,
                leaflets: parameters.leaflets,
                arch: parameters.frondArch,
                archAmount: FROND_ARCH_AMOUNT,
                twist: 0,
                spine: [],
            }).parameters

            components.push({
                id: `cmp-frond-${index}`,
                type: 'palm-frond',
                generatorId: palmFrondGenerator.id,
                generatorVersion: palmFrondGenerator.version,
                parentId: crownId,
                transform: transformOf(tip, rotationTowards(direction)),
                parameters: frond,
                seed: frondSeed,
                slot: `frond-${index}`,
            })
        }

        // --- Coconuts ----------------------------------------------------
        const coconutCount = Math.round(parameters.coconutCount)

        if (coconutCount > 0) {
            const coconut = coconutClusterGenerator.validate({
                count: coconutCount,
                size: parameters.coconutSize,
                spread: COCONUT_SPREAD,
            }).parameters

            const hang = new THREE.Vector3(
                tip.x,
                tip.y - parameters.crownSize * COCONUT_DROP,
                tip.z,
            )

            components.push({
                id: 'cmp-coconut-0',
                type: 'coconut-cluster',
                generatorId: coconutClusterGenerator.id,
                generatorVersion: coconutClusterGenerator.version,
                parentId: crownId,
                transform: transformOf(hang, [0, 0, 0]),
                parameters: coconut,
                seed: hashSeed(seed, 900),
                slot: 'coconut-0',
            })
        }

        return components
    },
}
