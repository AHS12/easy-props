/**
 * Stumps, logs, fallen branches and leaf litter, each made from a tree.
 *
 * A piece carries the tree it came from, its settings and seed, so it keeps that
 * tree's bark, colours and shape. It doesn't follow the tree afterwards: change the
 * tree and make its pieces again. That keeps a saved piece whole on its own.
 *
 * The prop's own seed picks what varies between pieces of the same tree: which
 * branch fell, how a log rolled, where the leaves lie. So Show me more gives other
 * pieces of the same tree.
 */

import {z} from 'zod'
import {IDENTITY_TRANSFORM} from '../../shared/component-types'
import type {CollisionShape, GeneratedPart, PartGenerator, PropGenerator} from '../../shared/generator-types'
import {numberSchema, validateParameters, type NumberParameter, type ParameterSpec} from '../../shared/parameters'
import {MOSS_FROM, SNOW, WEATHER, WET, weatherSchema, wetSurface, type MossFrom} from '../../shared/weather'
import type {StyleProfile} from '../../style/style-profiles'
import {getBarkRelief, getBarkTexture, getDabTexture} from '../painted'
import {paintedTreeDefaults, validatePaintedTreeParameters, type PaintedTreeParameters} from '../painted/parameters'
import {getEndGrainRelief, getEndGrainTexture} from '../../shared/end-grain-texture'
import {buildCutEnds, buildLitter, buildWoodPiece, type PieceKind, type PieceSource} from './tree-pieces'

const SHAPE = 'Shape'

const number = (group: string, key: string, label: string, help: string, min: number, max: number, step: number, fallback: number, unit?: string): NumberParameter => ({
    kind: 'number',
    group,
    key,
    label,
    help,
    min,
    max,
    step,
    default: fallback,
    unit,
})

const HEIGHT = number(SHAPE, 'height', 'Height', 'How high the trunk was cut.', 0.1, 3, 0.05, 0.6, 'm')
const LENGTH = number(SHAPE, 'length', 'Length', 'How long the log is. It never runs past the trunk.', 0.5, 12, 0.1, 3, 'm')
const WIDTH = number(SHAPE, 'width', 'Width', 'How wide the patch of leaves is.', 0.3, 10, 0.1, 2.5, 'm')
const DEPTH = number(SHAPE, 'depth', 'Depth', 'How far the patch runs from front to back.', 0.3, 10, 0.1, 2.5, 'm')
const AMOUNT = number(SHAPE, 'amount', 'Leaves', 'How thickly the leaves cover the ground. More costs more to draw.', 0.1, 1.5, 0.05, 0.7)
const DRYNESS = number(SHAPE, 'dryness', 'Dryness', 'How brown and dry the fallen leaves are.', 0, 1, 0.05, 0.4)
const MOSS = number(WEATHER, 'moss', 'Moss', 'Green growth on the wood.', 0, 1, 0.05, 0)

/** What every piece has: where it came from, and its weather. */
export interface PieceParameters {
    /** The tree's settings, as JSON. Kept whole, so the piece needs nothing else. */
    readonly tree: string
    readonly treeSeed: number
    /** The tree's name when the piece was made, to say where it came from. */
    readonly treeName: string
    readonly snow: number
    readonly moss: number
    readonly mossFrom: MossFrom
    readonly wet: number
    readonly height: number
    readonly length: number
    readonly width: number
    readonly depth: number
    readonly amount: number
    readonly dryness: number
}

export const pieceDefaults: PieceParameters = {
    tree: JSON.stringify(paintedTreeDefaults),
    treeSeed: 0,
    treeName: '',
    snow: SNOW.default,
    moss: MOSS.default,
    mossFrom: MOSS_FROM.default,
    wet: WET.default,
    height: HEIGHT.default,
    length: LENGTH.default,
    width: WIDTH.default,
    depth: DEPTH.default,
    amount: AMOUNT.default,
    dryness: DRYNESS.default,
}

const pieceSchema = z.object({
    tree: z.string().catch(pieceDefaults.tree),
    treeSeed: z.number().catch(0).transform((value) => (Number.isFinite(value) ? Math.trunc(value) : 0)),
    treeName: z.string().catch(''),
    ...weatherSchema,
    moss: numberSchema(MOSS),
    height: numberSchema(HEIGHT),
    length: numberSchema(LENGTH),
    width: numberSchema(WIDTH),
    depth: numberSchema(DEPTH),
    amount: numberSchema(AMOUNT),
    dryness: numberSchema(DRYNESS),
})

const validatePiece = (parameters: unknown) => validateParameters<PieceParameters>(pieceSchema as unknown as z.ZodType<PieceParameters>, parameters, pieceDefaults)

/** The tree a piece is made from, wearing the piece's own weather. Always painted wood. */
export function sourceOf(piece: PieceParameters): PieceSource {
    let saved: unknown = {}

    try {
        saved = JSON.parse(piece.tree)
    } catch {
        // A damaged tree falls back to the default one, as any damaged setting does.
    }

    const tree: PaintedTreeParameters = {
        ...validatePaintedTreeParameters(saved).parameters,
        build: 'painted',
        snow: piece.snow,
        moss: piece.moss,
        mossFrom: piece.mossFrom,
        wet: piece.wet,
    }

    return {tree, treeSeed: piece.treeSeed}
}

const detailOf = (style: StyleProfile) => (style.id === 'detailed' ? 1 : 0.68)

interface PieceBodyParameters {
    readonly piece: PieceParameters
    readonly seed: number
}

function validateBody(parameters: unknown) {
    const raw = (parameters ?? {}) as {piece?: unknown; seed?: unknown}
    const piece = validatePiece(raw.piece)

    return {
        ...piece,
        parameters: {piece: piece.parameters, seed: typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? Math.trunc(raw.seed) : 0},
    }
}

function woodPart(kind: Exclude<PieceKind, 'litter'>): PartGenerator<PieceBodyParameters> {
    return {
        id: `tree-${kind}-wood`,
        version: 1,
        type: 'bark',
        label: 'Wood',
        parameters: [],
        scalesWithDetail: true,
        createDefaultParameters: () => ({piece: pieceDefaults, seed: 0}),
        validate: validateBody,

        generate({piece, seed}, {style, detail = 1}): GeneratedPart {
            const source = sourceOf(piece)

            return {
                geometry: buildWoodPiece(kind, source, {height: piece.height, length: piece.length}, seed, detailOf(style) * detail),
                material: 'painted',
                role: 'solid',
                surface: wetSurface(
                    {
                        vertexColors: true,
                        map: getBarkTexture(source.tree.brushStrokes, source.tree.barkPattern),
                        normalMap: getBarkRelief(source.tree.barkPattern),
                    },
                    piece.wet,
                ),
            }
        },
    }
}

/** The sawn ends of a piece, with fine rings on a picture of their own. */
function endsPart(kind: Exclude<PieceKind, 'litter'>): PartGenerator<PieceBodyParameters> {
    return {
        id: `tree-${kind}-ends`,
        version: 1,
        type: 'bark',
        label: 'Cut ends',
        parameters: [],
        scalesWithDetail: true,
        createDefaultParameters: () => ({piece: pieceDefaults, seed: 0}),
        validate: validateBody,

        generate({piece, seed}, {style, detail = 1}): GeneratedPart {
            return {
                geometry: buildCutEnds(kind, sourceOf(piece), {height: piece.height, length: piece.length}, seed, detailOf(style) * detail),
                material: 'painted',
                role: 'solid',
                surface: wetSurface({vertexColors: true, map: getEndGrainTexture(), normalMap: getEndGrainRelief(), exportName: 'ends'}, piece.wet),
            }
        },
    }
}

export const stumpWoodGenerator = woodPart('stump')
export const logWoodGenerator = woodPart('log')
export const branchWoodGenerator = woodPart('branch')
export const stumpEndsGenerator = endsPart('stump')
export const logEndsGenerator = endsPart('log')
export const branchEndsGenerator = endsPart('branch')

export const litterLeavesGenerator: PartGenerator<PieceBodyParameters> = {
    id: 'tree-litter-leaves',
    version: 1,
    type: 'bush-leaves',
    label: 'Leaves',
    parameters: [],
    scalesWithDetail: true,
    createDefaultParameters: () => ({piece: pieceDefaults, seed: 0}),
    validate: validateBody,

    generate({piece, seed}, {detail = 1}) {
        return {
            geometry: buildLitter(sourceOf(piece), piece, seed, detail),
            material: 'painted',
            role: 'foliage',
            surface: wetSurface({vertexColors: true, map: getDabTexture(), alphaTest: 0.5, receiveShadow: true}, piece.wet),
        }
    },
}

const WEATHER_SPECS: readonly ParameterSpec[] = [SNOW, MOSS, MOSS_FROM, WET]

function pieceGenerator(
    kind: PieceKind,
    label: string,
    part: PartGenerator<PieceBodyParameters>,
    own: readonly ParameterSpec[],
    extra: Partial<PropGenerator<PieceParameters>> = {},
    ends?: PartGenerator<PieceBodyParameters>,
): PropGenerator<PieceParameters> {
    const specs = [...own, ...(kind === 'litter' ? [SNOW, WET] : WEATHER_SPECS)]

    return {
        id: `tree-${kind}`,
        version: 1,
        label,
        parameters: specs,
        // Its colours are the tree's, carried in its settings.
        paintsOwnColours: true,
        still: true,
        budgetAdvice: kind === 'litter' ? 'Lower Leaves, or make the patch smaller.' : 'Make it from a tree with less Wood detail.',
        createDefaultParameters: () => pieceDefaults,
        validate: validatePiece,
        shownControls: (values) => specs.filter((spec) => spec.key !== 'mossFrom' || Number(values.moss ?? 0) > 0),
        generate(parameters, {seed}) {
            return [
                {
                    id: `cmp-${kind}-0`,
                    type: part.type,
                    generatorId: part.id,
                    generatorVersion: part.version,
                    parentId: null,
                    transform: IDENTITY_TRANSFORM,
                    parameters: {piece: parameters, seed},
                    seed,
                    slot: `${kind}-body`,
                },
                ...(ends
                    ? [
                          {
                              id: `cmp-${kind}-ends`,
                              type: ends.type,
                              generatorId: ends.id,
                              generatorVersion: ends.version,
                              parentId: null,
                              transform: IDENTITY_TRANSFORM,
                              parameters: {piece: parameters, seed},
                              seed,
                              slot: `${kind}-ends`,
                          },
                      ]
                    : []),
            ]
        },
        ...extra,
    }
}

/** A stump stands on its roots, as wide as its cut. */
function stumpCollision(piece: PieceParameters): readonly CollisionShape[] {
    const {tree} = sourceOf(piece)

    return [{start: [0, 0, 0], end: [0, piece.height, 0], startRadius: tree.trunkRadius * 1.2, endRadius: tree.trunkRadius}]
}

export const stumpGenerator = pieceGenerator('stump', 'Stump', stumpWoodGenerator, [HEIGHT], {collision: stumpCollision}, stumpEndsGenerator)
export const logGenerator = pieceGenerator('log', 'Log', logWoodGenerator, [LENGTH], {}, logEndsGenerator)
export const branchPieceGenerator = pieceGenerator('branch', 'Fallen branch', branchWoodGenerator, [], {}, branchEndsGenerator)
export const litterGenerator = pieceGenerator('litter', 'Leaf litter', litterLeavesGenerator, [WIDTH, DEPTH, AMOUNT, DRYNESS])

export const PIECE_GENERATORS: Readonly<Record<PieceKind, PropGenerator<PieceParameters>>> = {
    stump: stumpGenerator,
    log: logGenerator,
    branch: branchPieceGenerator,
    litter: litterGenerator,
}
