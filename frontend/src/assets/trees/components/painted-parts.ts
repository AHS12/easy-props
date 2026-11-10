/**
 * The parts of a painted tree.
 *
 * The bark is one surface and each clump is a mesh of its own. A limb draws
 * nothing: its wood is in the bark. It is a part so it can be clicked, shown as
 * selected and dragged by its handles, and all it renders is an invisible tube
 * for the pointer to land on.
 *
 * A part stores the tree's settings and the seed, not its shape. The shape is
 * a pure function of those, so a saved tree stays small and stays editable.
 */

import * as THREE from 'three'
import {wetSurface} from '../../shared/weather'
import type {PartGenerator} from '../../shared/generator-types'
import type {ParameterSpec, ValidationResult} from '../../shared/parameters'
import type {StyleProfile} from '../../style/style-profiles'
import {
    buildBark,
    buildBarkOffThread,
    buildLowPolyOffThread,
    lowPolyHold,
    buildClump,
    buildFrond,
    buildLowPolyBark,
    buildLowPolyClump,
    canBuildBarkOffThread,
    COLOUR_KEYS,
    getBarkRelief,
    getBarkTexture,
    getDabTexture,
    parseEdits,
    planPaintedTree,
    resolvePalette,
    validatePaintedTreeParameters,
    type Clump,
    type Limb,
    type PaintedTreeParameters,
    type Vec3,
} from '../painted'

export type PaintedPartParameters = {
    readonly tree: PaintedTreeParameters
    readonly seed: number
}

export type PaintedKeyedParameters = PaintedPartParameters & {
    readonly key: string
}

/** How much geometry a style asks for. Detailed is the full tree. */
const detailOf = (style: StyleProfile) => (style.id === 'detailed' ? 1 : 0.68)

/** Rounded, so a difference too small to see does not rebuild a mesh. */
const rounded = (value: number) => Math.round(value * 1000) / 1000
const roundedPoint = (point: Vec3) => point.map(rounded)

function validateBase(parameters: unknown): ValidationResult<PaintedPartParameters> {
    const raw = (parameters ?? {}) as {tree?: unknown; seed?: unknown}
    const tree = validatePaintedTreeParameters(raw.tree)
    const seed = typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? Math.trunc(raw.seed) : 0

    return {...tree, parameters: {tree: tree.parameters, seed}}
}

function validateKeyed(parameters: unknown): ValidationResult<PaintedKeyedParameters> {
    const base = validateBase(parameters)
    const raw = (parameters ?? {}) as {key?: unknown}

    return {
        ...base,
        parameters: {...base.parameters, key: typeof raw.key === 'string' ? raw.key : ''},
    }
}

/** The tree controls that change the leaves and nothing else. */
const LEAF_ONLY_KEYS: readonly (keyof PaintedTreeParameters)[] = [
    'fullness',
    'leafSize',
    'lumpiness',
    'strands',
    'strandLength',
    'frondStyle',
    'fruitCount',
    'fruitKind',
    'fruitSize',
    'colourVariation',
    'barkTone',
    'leafDeep',
    'leafMid',
    'leafLight',
]

export const paintedBarkGenerator: PartGenerator<PaintedPartParameters> = {
    id: 'painted-bark',
    version: 7,
    type: 'bark',
    label: 'Bark',
    // The tree's controls live on the tree: one rebuild, one undo step.
    parameters: [] as readonly ParameterSpec[],

    createDefaultParameters() {
        return validateBase(undefined).parameters
    },

    validate: validateBase,

    // Only what shapes the wood, so a leaf slider or a moved clump leaves the
    // bark's mesh alone.
    signature({tree, seed}) {
        // A low-poly tree's crown is built with its wood, so any change to the
        // tree builds them again together, except while a drag holds the crown.
        if (tree.build === 'low-poly' && lowPolyHold() === null) {
            return ['low-poly', seed, tree]
        }

        const palette = resolvePalette(tree)
        const wood = Object.fromEntries(
            Object.entries(tree).filter(
                ([key]) =>
                    !LEAF_ONLY_KEYS.includes(key as keyof PaintedTreeParameters) &&
                    !(COLOUR_KEYS as readonly string[]).includes(key) &&
                    key !== 'edits' &&
                    key !== 'palette',
            ),
        )

        return [wood, seed, palette.barkDeep, palette.barkLight, parseEdits(tree.edits).limbs]
    },

    scalesWithDetail: true,

    dress(geometry, {tree}) {
        // Plain blocks: their colour is in the faces, with nothing printed over it.
        if (tree.build === 'low-poly') {
            return {geometry, material: 'painted', surface: wetSurface({vertexColors: true}, tree.wet), role: 'solid'}
        }

        return {
            geometry,
            material: 'painted',
            surface: wetSurface(
                {
                    vertexColors: true,
                    map: getBarkTexture(tree.brushStrokes, tree.barkPattern),
                    normalMap: getBarkRelief(tree.barkPattern),
                },
                tree.wet,
            ),
            role: 'solid',
        }
    },

    generate({tree, seed}, context) {
        if (tree.build === 'low-poly') {
            return this.dress!(buildLowPolyBark(planPaintedTree(tree, seed), tree, seed, context.detail ?? 1), {tree, seed})
        }

        const detail = detailOf(context.style) * (context.detail ?? 1)

        return this.dress!(buildBark(planPaintedTree(tree, seed), tree, seed, detail), {tree, seed})
    },

    buildOffThread({tree, seed}, style, detail = 1) {
        if (tree.build === 'low-poly') {
            // The wood and the whole crown, built together away from the interface.
            // While a drag holds the crown, only the wood.
            return canBuildBarkOffThread() ? buildLowPolyOffThread({tree, seed, detail}, lowPolyHold() === null) : null
        }

        return canBuildBarkOffThread()
            ? buildBarkOffThread({tree, seed, detail: detailOf(style) * detail})
            : null
    },
}

const CLUMP_SPECS: readonly ParameterSpec[] = [
    {
        kind: 'number',
        key: 'sizeScale',
        label: 'Size',
        help: 'How big this clump is, against the rest of the tree.',
        min: 0.3,
        max: 2.5,
        step: 0.05,
        default: 1,
    },
    {
        kind: 'number',
        key: 'flattenScale',
        label: 'Flatness',
        help: 'Below 1 squashes this clump, above 1 stretches it taller.',
        min: 0.4,
        max: 2,
        step: 0.05,
        default: 1,
    },
    {
        kind: 'number',
        key: 'fullnessScale',
        label: 'Leaf density',
        help: 'How many leaves cover this clump. Higher costs more to draw.',
        min: 0.3,
        max: 2,
        step: 0.05,
        default: 1,
    },
    {
        kind: 'number',
        key: 'leafSizeScale',
        label: 'Leaf size',
        help: 'How big the patches of leaves on this clump are.',
        min: 0.5,
        max: 1.8,
        step: 0.05,
        default: 1,
    },
    {
        kind: 'number',
        key: 'lumpinessScale',
        label: 'Lumpiness',
        help: 'How broken up this clump is, from one round shape to several.',
        min: 0,
        max: 2,
        step: 0.05,
        default: 1,
    },
]

function findClump(tree: PaintedTreeParameters, seed: number, key: string): Clump | undefined {
    return planPaintedTree(tree, seed).clumps.find((clump) => clump.key === key)
}

export const paintedClumpGenerator: PartGenerator<PaintedKeyedParameters> = {
    id: 'painted-clump',
    version: 3,
    type: 'foliage-cluster',
    label: 'Leaf clump',
    parameters: CLUMP_SPECS,

    createDefaultParameters() {
        return {...validateBase(undefined).parameters, key: ''}
    },

    validate: validateKeyed,

    // Its own shape, its leaf settings, and the neighbours that hide some of
    // its cards. Where it sits is the part's position, so moving it is free.
    signature({tree, seed, key}) {
        // A low-poly crown is one surface shared out among its clumps, so a
        // change to any of them reshapes the seams of the rest.
        if (tree.build === 'low-poly') {
            const hold = lowPolyHold()

            // While a drag holds the crown, a clump keeps its faces and moves whole.
            return hold === null ? ['low-poly', key, seed, tree] : ['low-poly held', key, hold]
        }

        const plan = planPaintedTree(tree, seed)
        const clump = plan.clumps.find((candidate) => candidate.key === key)

        if (!clump) {
            return [key]
        }

        const palette = resolvePalette(tree)
        const neighbours = plan.clumps
            .filter(
                (other) =>
                    other !== clump &&
                    Math.hypot(
                        other.centre[0] - clump.centre[0],
                        other.centre[1] - clump.centre[1],
                        other.centre[2] - clump.centre[2],
                    ) <
                        (other.radius + clump.radius) * 1.3,
            )
            .map((other) => [
                roundedPoint([
                    other.centre[0] - clump.centre[0],
                    other.centre[1] - clump.centre[1],
                    other.centre[2] - clump.centre[2],
                ]),
                rounded(other.radius),
            ])

        return [
            clump.seed,
            rounded(clump.radius),
            rounded(clump.flatten),
            clump.edit.colour ?? '',
            clump.edit.fullnessScale ?? 1,
            clump.edit.leafSizeScale ?? 1,
            clump.edit.lumpinessScale ?? 1,
            roundedPoint(plan.crownCentre),
            rounded(plan.crownRadius),
            roundedPoint(clump.base),
            neighbours,
            clump.kind,
            rounded(clump.sag),
            rounded(clump.azimuth),
            rounded(clump.elevation),
            plan.clumps.indexOf(clump),
            plan.clumps.length,
            tree.build,
            tree.droop,
            tree.height,
            tree.strands,
            tree.strandLength,
            tree.frondStyle,
            tree.fruitCount,
            tree.fruitKind,
            tree.fruitSize,
            tree.fullness,
            tree.leafSize,
            tree.lumpiness,
            tree.colourVariation,
            tree.snow,
            tree.wet,
            palette.leafDeep,
            palette.leafMid,
            palette.leafLight,
        ]
    },

    scalesWithDetail: true,

    generate({tree, seed, key}, context) {
        const plan = planPaintedTree(tree, seed)
        const clump = findClump(tree, seed, key)

        if (tree.build === 'low-poly') {
            return {
                geometry: clump ? buildLowPolyClump(plan, clump, tree, seed, context.detail ?? 1, context.detail ?? 1) : new THREE.BufferGeometry(),
                material: 'painted',
                // Gems, fronds and strands are all real shapes, so nothing is cut out of a picture.
                surface: wetSurface({vertexColors: true}, tree.wet),
                role: 'foliage',
            }
        }

        return {
            geometry: clump
                ? (clump.kind === 'frond' ? buildFrond : buildClump)(
                      plan,
                      clump,
                      tree,
                      detailOf(context.style),
                      context.detail ?? 1,
                  )
                : new THREE.BufferGeometry(),
            material: 'painted',
            surface: wetSurface({vertexColors: true, map: getDabTexture(), alphaTest: 0.5, receiveShadow: false}, tree.wet),
            role: 'foliage',
        }
    },
}

const LIMB_SPECS: readonly ParameterSpec[] = [
    {
        kind: 'number',
        key: 'lengthScale',
        label: 'Length',
        help: 'How long this part is, against what the tree gave it.',
        min: 0.3,
        max: 2,
        step: 0.05,
        default: 1,
    },
    {
        kind: 'number',
        key: 'thicknessScale',
        label: 'Thickness',
        help: 'How heavy this part is, against what the tree gave it.',
        min: 0.3,
        max: 2,
        step: 0.05,
        default: 1,
    },
    {
        kind: 'number',
        key: 'sizeScale',
        label: 'Size',
        help: 'How big this part is, with the branches and leaves that grow on it.',
        min: 0.25,
        max: 3,
        step: 0.05,
        default: 1,
    },
]

const PROXY_MIN_RADIUS = 0.05
const PROXY_SCALE = 1.14
const PROXY_SIDES = 6

/** A plain tube around a limb, just outside its bark, for the pointer to hit. */
function buildProxy(limb: Limb): THREE.BufferGeometry {
    const path = new THREE.CatmullRomCurve3(limb.points.map((point) => new THREE.Vector3(...point)))
    const radius = (limb.radii[0] + limb.radii[Math.floor(limb.radii.length / 2)]) / 2

    return new THREE.TubeGeometry(
        path,
        limb.points.length * 2,
        Math.max(radius * PROXY_SCALE, PROXY_MIN_RADIUS),
        PROXY_SIDES,
        false,
    )
}

export const paintedLimbGenerator: PartGenerator<PaintedKeyedParameters> = {
    id: 'painted-limb',
    version: 2,
    type: 'branch',
    label: 'Branch',
    parameters: LIMB_SPECS,

    createDefaultParameters() {
        return {...validateBase(undefined).parameters, key: ''}
    },

    validate: validateKeyed,

    scalesWithDetail: true,

    signature({tree, seed, key}) {
        const limb = planPaintedTree(tree, seed).limbs.find((candidate) => candidate.key === key)

        return limb ? [limb.points.map(roundedPoint), limb.radii.map(rounded)] : [key]
    },

    generate({tree, seed, key}) {
        const limb = planPaintedTree(tree, seed).limbs.find((candidate) => candidate.key === key)

        return {
            geometry: limb ? buildProxy(limb) : new THREE.BufferGeometry(),
            material: 'painted',
            surface: {vertexColors: false, proxy: true},
        }
    },
}
