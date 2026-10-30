/**
 * A palm frond.
 *
 * Built in local space, starting at the origin and reaching along the
 * positive X axis, the way a branch does. A rib follows the spine and
 * leaflets grow out of it on both sides, swept back and angled down the way
 * a palm's are.
 */

import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {z} from 'zod'
import type {LimbSpinePoint} from '../../shared/component-types'
import type {PartGenerator} from '../../shared/generator-types'
import {buildTaperedTube, taperedRadius} from '../../shared/geometry-utils'
import {
    choiceSchema,
    numberSchema,
    validateParameters,
    type ParameterSpec,
    type ValidationResult,
} from '../../shared/parameters'
import {createSeededRandom, hashSeed} from '../../shared/random'
import {normaliseSpine, spinePointPosition} from '../../shared/spines'

export type FrondArch = 'upright' | 'arched' | 'drooping'

export type PalmFrondParameters = {
    readonly length: number
    readonly width: number
    readonly leaflets: number
    readonly arch: FrondArch
    readonly archAmount: number
    readonly twist: number
    /** The draggable spine. Empty means "build the default from the arch". */
    readonly spine: readonly LimbSpinePoint[]
}

/** How many points along a frond, which is how many handles it shows. */
export const FROND_POINTS = 8

const RIB_BASE_RADIUS = 0.03
const RIB_TIP_RADIUS = 0.01

/** Fixed rather than taken from the style, so a frond stays light in every style. */
const RIB_SEGMENTS = 5

const LEAFLET_SALT = 4177

const SIDE_AXIS = new THREE.Vector3(0, 0, 1)
const TWIST_AXIS = new THREE.Vector3(1, 0, 0)

const LENGTH = {
    kind: 'number',
    key: 'length',
    label: 'Length',
    help: 'How long the frond is.',
    min: 0.6,
    max: 6,
    step: 0.1,
    unit: 'm',
    default: 2.6,
} as const satisfies ParameterSpec

const WIDTH = {
    kind: 'number',
    key: 'width',
    label: 'Leaflet length',
    help: 'How long each leaflet is.',
    min: 0.05,
    max: 0.9,
    step: 0.01,
    unit: 'm',
    default: 0.32,
} as const satisfies ParameterSpec

const LEAFLETS = {
    kind: 'number',
    key: 'leaflets',
    label: 'Leaflets',
    help: 'How many leaflets run along the rib.',
    min: 4,
    max: 40,
    step: 1,
    unit: 'count',
    default: 16,
} as const satisfies ParameterSpec

const ARCH = {
    kind: 'choice',
    key: 'arch',
    label: 'Arch',
    help: 'The shape the frond makes as it reaches out.',
    options: [
        {value: 'upright', label: 'Upright'},
        {value: 'arched', label: 'Arched'},
        {value: 'drooping', label: 'Drooping'},
    ],
    default: 'arched',
} as const satisfies ParameterSpec

const ARCH_AMOUNT = {
    kind: 'number',
    key: 'archAmount',
    label: 'Arch',
    help: 'How far the frond bends.',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.55,
} as const satisfies ParameterSpec

const TWIST = {
    kind: 'number',
    key: 'twist',
    label: 'Twist',
    min: -90,
    max: 90,
    step: 5,
    unit: 'deg',
    default: 0,
} as const satisfies ParameterSpec

export const palmFrondParameterSpecs: readonly ParameterSpec[] = [
    LENGTH,
    WIDTH,
    LEAFLETS,
    ARCH,
    ARCH_AMOUNT,
    TWIST,
]

const limbSpinePointSchema = z.object({
    t: z.number().min(0).max(1),
    y: z.number(),
    z: z.number(),
})

const palmFrondSchema = z.object({
    length: numberSchema(LENGTH),
    width: numberSchema(WIDTH),
    leaflets: numberSchema(LEAFLETS),
    arch: choiceSchema(ARCH),
    archAmount: numberSchema(ARCH_AMOUNT),
    twist: numberSchema(TWIST),
    spine: z.array(limbSpinePointSchema).min(2).catch([]),
})

/**
 * How far each arch carries the frond up and over.
 *
 * `reach` is how much of a half-turn the arc covers: less than one rises and
 * flattens, more than one bows past the horizontal and the tip comes back
 * down.
 */
const FROND_ARCHES: Readonly<Record<FrondArch, {rise: number; reach: number}>> = {
    upright: {rise: 0.6, reach: 0.5},
    arched: {rise: 0.45, reach: 0.85},
    drooping: {rise: 0.55, reach: 1.15},
}

/**
 * The default spine for a frond.
 *
 * The arch decides the curve and its amount decides how far along it the
 * frond travels, so a flat amount draws a frond straight along its own axis.
 */
export function buildFrondSpine(
    arch: FrondArch,
    archAmount: number,
    length: number,
    count = FROND_POINTS,
): LimbSpinePoint[] {
    const points = Math.max(2, Math.round(count))
    const {rise, reach} = FROND_ARCHES[arch] ?? FROND_ARCHES.arched

    return Array.from({length: points}, (_, index) => {
        const t = index / (points - 1)

        return {t, y: length * archAmount * rise * Math.sin(Math.PI * t * reach), z: 0}
    })
}

/**
 * A point on the rib, and the direction the rib is heading there.
 *
 * The rib is drawn as straight runs between its spine points, so the leaflets
 * are placed on those same runs rather than on a curve of their own.
 */
function sampleRib(
    spine: readonly LimbSpinePoint[],
    length: number,
    t: number,
    tangent: THREE.Vector3,
): THREE.Vector3 {
    let upper = spine.findIndex((point) => point.t >= t)
    if (upper < 0) {
        upper = spine.length - 1
    }

    const low = spine[Math.max(upper - 1, 0)]
    const high = spine[upper]
    const span = high.t - low.t
    const fraction = span <= 1e-9 ? 0 : (t - low.t) / span

    const from = new THREE.Vector3(low.t * length, low.y, low.z)
    const to = new THREE.Vector3(high.t * length, high.y, high.z)

    tangent.copy(to).sub(from)

    if (tangent.lengthSq() < 1e-12) {
        tangent.set(1, 0, 0)
    } else {
        tangent.normalize()
    }

    return from.lerp(to, fraction)
}

function pushFin(
    vertices: number[],
    uvs: number[],
    indices: number[],
    leading: THREE.Vector3,
    trailing: THREE.Vector3,
    tip: THREE.Vector3,
): void {
    const base = vertices.length / 3

    vertices.push(
        leading.x,
        leading.y,
        leading.z,
        trailing.x,
        trailing.y,
        trailing.z,
        tip.x,
        tip.y,
        tip.z,
    )
    uvs.push(0, 0, 1, 0, 0.5, 1)

    // Both windings, because a fin this thin has to be seen from either side.
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base)
}

function buildLeafletGeometry(
    parameters: PalmFrondParameters,
    spine: readonly LimbSpinePoint[],
    seed: number,
): THREE.BufferGeometry {
    const count = Math.max(1, Math.round(parameters.leaflets))
    const random = createSeededRandom(hashSeed(seed, LEAFLET_SALT))
    const twist = THREE.MathUtils.degToRad(parameters.twist)

    const vertices: number[] = []
    const uvs: number[] = []
    const indices: number[] = []

    const tangent = new THREE.Vector3()
    const down = new THREE.Vector3()

    for (let station = 0; station < count; station++) {
        const t = (station + 0.5) / count
        const centre = sampleRib(spine, parameters.length, t, tangent)
        const radius = taperedRadius(RIB_BASE_RADIUS, RIB_TIP_RADIUS, t)
        const rootHalf = (parameters.length / count) * 0.25

        down.crossVectors(tangent, SIDE_AXIS)

        if (down.lengthSq() < 1e-12) {
            down.set(0, -1, 0)
        } else {
            down.normalize()
        }

        for (const side of [-1, 1]) {
            // The first leaflets are kept short, so none of them sweeps back
            // behind the point the frond is attached at.
            const base = Math.min(1, 0.4 + t * 3)
            const reach = parameters.width * base * (1 - 0.6 * t) * (0.8 + random() * 0.4)
            const sweep = 0.3 + random() * 0.3
            const droop = 0.35 + random() * 0.3

            const root = centre.clone().addScaledVector(SIDE_AXIS, side * radius * 0.8)

            const leading = root.clone().addScaledVector(tangent, rootHalf * 0.5)
            const trailing = root.clone().addScaledVector(tangent, -rootHalf * 1.5)

            const tip = root
                .clone()
                .addScaledVector(SIDE_AXIS, side * reach)
                .addScaledVector(tangent, -reach * sweep)
                .addScaledVector(down, reach * droop)

            for (const point of [leading, trailing, tip]) {
                point.applyAxisAngle(TWIST_AXIS, twist * t)
            }

            pushFin(vertices, uvs, indices, leading, trailing, tip)
        }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    return geometry
}

export const palmFrondGenerator: PartGenerator<PalmFrondParameters> = {
    id: 'palm-frond',
    version: 1,
    type: 'palm-frond',
    label: 'Palm frond',
    parameters: palmFrondParameterSpecs,

    createDefaultParameters(): PalmFrondParameters {
        const arch = ARCH.default
        const archAmount = ARCH_AMOUNT.default
        const length = LENGTH.default

        return {
            length,
            width: WIDTH.default,
            leaflets: LEAFLETS.default,
            arch,
            archAmount,
            twist: TWIST.default,
            spine: buildFrondSpine(arch, archAmount, length, FROND_POINTS),
        }
    },

    validate(parameters: unknown): ValidationResult<PalmFrondParameters> {
        const result = validateParameters(
            palmFrondSchema,
            parameters,
            this.createDefaultParameters(),
        )
        const {arch, archAmount, length, spine} = result.parameters

        return {
            ...result,
            parameters: {
                ...result.parameters,
                spine: normaliseSpine(spine, 'outward', FROND_POINTS, () =>
                    buildFrondSpine(arch, archAmount, length, FROND_POINTS),
                ),
            },
        }
    },

    generate(parameters, context) {
        const spine =
            parameters.spine.length >= 2
                ? parameters.spine
                : buildFrondSpine(parameters.arch, parameters.archAmount, parameters.length)

        const points = spine.map((point) =>
            spinePointPosition(point, 'outward', parameters.length, parameters.twist),
        )

        const radii = spine.map((point) =>
            taperedRadius(RIB_BASE_RADIUS, RIB_TIP_RADIUS, point.t),
        )

        const rib = buildTaperedTube({
            points,
            radii,
            radialSegments: RIB_SEGMENTS,
            capBase: false,
            capTip: false,
        })

        const leaflets = buildLeafletGeometry(parameters, spine, context.seed)
        const geometry = mergeGeometries([rib, leaflets], false) ?? rib

        if (context.style.flatShading) {
            geometry.deleteAttribute('normal')
            geometry.computeVertexNormals()
        }

        return {geometry, material: 'leaves'}
    },
}
