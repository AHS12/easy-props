/**
 * Making pieces from the tree that's open: each one a prop of its own.
 */

import {findPropGenerator, generatePropComponents} from '../../assets/prop-generators'
import {hashSeed} from '../../assets/shared/random'
import {getStyleProfile, type StyleProfileId} from '../../assets/style/style-profiles'
import {DEFAULT_MATERIALS} from '../../assets/style/materials'
import {validatePaintedTreeParameters} from '../../assets/trees/painted/parameters'
import {PIECE_GENERATORS, pieceDefaults, type PieceParameters} from '../../assets/trees/pieces/piece-generators'
import {canMakePiece, type PieceKind} from '../../assets/trees/pieces/tree-pieces'
import type {AssetParameterValue, Scene} from './scene-model'

export const PIECE_KINDS: readonly PieceKind[] = ['stump', 'log', 'branch', 'litter']

export const PIECE_LABELS: Readonly<Record<PieceKind, {name: string; help: string}>> = {
    stump: {name: 'Stump', help: 'The trunk cut low, with its rings showing and its roots kept'},
    log: {name: 'Fallen log', help: 'The trunk lying down, cut at both ends, with snapped stubs'},
    branch: {name: 'Fallen branch', help: 'One of its big branches with its twigs, lying on the ground'},
    litter: {name: 'Leaf litter', help: 'A patch of its own leaves on the ground'},
}

/** On a log, moss has had time to grow, whatever the tree had. */
const LOG_MOSS = 0.3

/** True when the scene is a tree pieces can be made from. */
export const canMakePieces = (scene: Scene): boolean => scene.assets[0]?.generatorId === 'painted-tree'

/** Which pieces this tree can make. A palm has no branches to drop. */
export function piecesOffered(scene: Scene): readonly PieceKind[] {
    const asset = scene.assets[0]

    if (!asset || !canMakePieces(scene)) {
        return []
    }

    const tree = validatePaintedTreeParameters(asset.parameters).parameters

    return PIECE_KINDS.filter((kind) => canMakePiece(kind, {tree, treeSeed: asset.seed}))
}

export interface MadePiece {
    readonly kind: PieceKind
    readonly name: string
    readonly scene: Scene
}

/** The pieces of the tree in `scene`, each as the scene of a prop of its own. */
export function makePieces(scene: Scene, treeName: string, kinds: readonly PieceKind[], style: StyleProfileId): readonly MadePiece[] {
    const asset = scene.assets[0]

    if (!asset || !canMakePieces(scene)) {
        return []
    }

    const tree = validatePaintedTreeParameters(asset.parameters).parameters

    return kinds.map((kind) => {
        const generator = PIECE_GENERATORS[kind]
        const seed = hashSeed(asset.seed, PIECE_KINDS.indexOf(kind) + 1) % 100000
        const parameters: PieceParameters = {
            ...pieceDefaults,
            tree: JSON.stringify(tree),
            treeSeed: asset.seed,
            treeName,
            snow: tree.snow,
            moss: kind === 'log' ? Math.max(tree.moss, LOG_MOSS) : tree.moss,
            mossFrom: tree.mossFrom,
            wet: tree.wet,
        }
        const validated = findPropGenerator(generator.id)!.validate(parameters).parameters as unknown as Readonly<Record<string, AssetParameterValue>>

        return {
            kind,
            name: `${treeName} ${PIECE_LABELS[kind].name.toLowerCase()}`,
            scene: {
                id: 'scene-1',
                assets: [
                    {
                        id: 'asset-1',
                        kind: 'tree',
                        generatorId: generator.id,
                        generatorVersion: generator.version,
                        components: generatePropComponents(generator.id, validated, seed, getStyleProfile(style)),
                        seed,
                        parameters: validated,
                        materials: DEFAULT_MATERIALS,
                    },
                ],
            },
        }
    })
}
