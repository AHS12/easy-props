import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {findComponentGenerator} from '../assets/component-generators'
import {findPropGenerator} from '../assets/prop-generators'
import {createSeededRandom} from '../assets/shared/random'
import {getStyleProfile} from '../assets/style/style-profiles'
import {sourceOf, type PieceParameters} from '../assets/trees/pieces/piece-generators'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {makePieces, PIECE_KINDS, piecesOffered} from '../core/scene/tree-pieces'
import type {Scene} from '../core/scene/scene-model'

const STYLE = getStyleProfile('low-poly')

function partOf(scene: Scene, detail = 0.5, which = 0) {
    const component = scene.assets[0].components[which]
    const generator = findComponentGenerator(component.generatorId)!

    return generator.generate(generator.validate(component.parameters).parameters, {
        random: createSeededRandom(component.seed),
        seed: component.seed,
        style: STYLE,
        detail,
    })
}

const geometryOf = (scene: Scene, detail = 0.5): THREE.BufferGeometry => partOf(scene, detail).geometry

const boxOf = (geometry: THREE.BufferGeometry) => {
    geometry.computeBoundingBox()

    return geometry.boundingBox!
}

describe('pieces from a tree', () => {
    it('offers every piece of a branching tree, and no branch from a palm', () => {
        expect(piecesOffered(createSceneFromPreset('oak'))).toEqual(PIECE_KINDS)
        expect(piecesOffered(createSceneFromPreset('date-palm'))).not.toContain('branch')
        expect(piecesOffered(createSceneFromPreset('field-stone'))).toEqual([])
    })

    it('names each piece after its tree', () => {
        const pieces = makePieces(createSceneFromPreset('oak'), 'Old oak', PIECE_KINDS, 'low-poly')

        expect(pieces.map((piece) => piece.name)).toEqual(['Old oak stump', 'Old oak fallen log', 'Old oak fallen branch', 'Old oak leaf litter'])
    })

    it.each(['oak', 'spruce', 'birch', 'date-palm'])('makes every piece %s offers, each with something to draw', (presetId) => {
        const scene = createSceneFromPreset(presetId)

        for (const piece of makePieces(scene, 'Tree', piecesOffered(scene), 'low-poly')) {
            const geometry = geometryOf(piece.scene)

            expect(geometry.getAttribute('position').count, piece.kind).toBeGreaterThan(30)
            expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite), piece.kind).toBe(true)
        }
    })

    it('cuts a stump flat at the height asked for, and keeps its roots', () => {
        const scene = createSceneFromPreset('oak')
        const [stump] = makePieces(scene, 'Old oak', ['stump'], 'low-poly')
        const box = boxOf(geometryOf(stump.scene))
        const tree = sourceOf(stump.scene.assets[0].parameters as unknown as PieceParameters).tree

        expect(box.max.y).toBeGreaterThan(0.6 * 0.9)
        expect(box.max.y).toBeLessThan(0.6 * 1.15)
        // Wider than the trunk: the roots spread out round it.
        expect(box.max.x - box.min.x).toBeGreaterThan(tree.trunkRadius * 3)
    })

    it('caps a stump’s sawn top with fine rings, on a picture of their own', () => {
        const [stump] = makePieces(createSceneFromPreset('oak'), 'Old oak', ['stump'], 'low-poly')
        const wood = boxOf(geometryOf(stump.scene))
        const ends = partOf(stump.scene, 0.5, 1)
        const box = boxOf(ends.geometry)

        expect(stump.scene.assets[0].components).toHaveLength(2)
        expect(ends.surface?.map).toBeDefined()
        expect(ends.surface?.map).not.toBe(partOf(stump.scene).surface?.map)
        // Flat, at the top of the stump, just off the sawn wood.
        expect(box.max.y - box.min.y).toBeLessThan(0.01)
        expect(Math.abs(box.max.y - wood.max.y)).toBeLessThan(0.05)
    })

    it('caps both ends of a log where they lie', () => {
        const [log] = makePieces(createSceneFromPreset('oak'), 'Old oak', ['log'], 'low-poly')
        const wood = boxOf(geometryOf(log.scene))
        const box = boxOf(partOf(log.scene, 0.5, 1).geometry)

        // One cap at each end of the log, along its length.
        expect(box.max.x - box.min.x).toBeGreaterThan((wood.max.x - wood.min.x) * 0.9)
        expect(box.min.y).toBeGreaterThan(wood.min.y - 0.05)
        expect(box.max.y).toBeLessThan(wood.max.y + 0.05)
    })

    it('lays a log down on the ground, with moss on it', () => {
        const scene = createSceneFromPreset('spruce')
        const [log] = makePieces(scene, 'Spruce', ['log'], 'low-poly')
        const box = boxOf(geometryOf(log.scene))
        const parameters = log.scene.assets[0].parameters as unknown as PieceParameters

        expect(box.max.x - box.min.x).toBeGreaterThan(box.max.y - box.min.y)
        expect(box.min.y).toBeLessThan(0.01)
        expect(box.min.y).toBeGreaterThan(-0.2)
        expect(parameters.moss).toBeGreaterThan(0)
    })

    it('carries the tree it came from, so it keeps the bark and colours', () => {
        const scene = createSceneFromPreset('birch')
        const [litter] = makePieces(scene, 'Silver birch', ['litter'], 'low-poly')
        const parameters = litter.scene.assets[0].parameters as unknown as PieceParameters
        const tree = scene.assets[0].parameters as Record<string, unknown>

        expect(parameters.treeSeed).toBe(scene.assets[0].seed)
        expect(parameters.treeName).toBe('Silver birch')
        expect(sourceOf(parameters).tree.barkTone).toBe(tree.barkTone)
        expect(sourceOf(parameters).tree.palette).toBe(tree.palette)
    })

    it('gives other pieces of the same tree for another seed', () => {
        const scene = createSceneFromPreset('oak')
        const [branch] = makePieces(scene, 'Old oak', ['branch'], 'low-poly')
        const asset = branch.scene.assets[0]
        const generator = findPropGenerator(asset.generatorId)!
        const other = generator.generate(generator.validate(asset.parameters).parameters, {random: createSeededRandom(7), seed: 7, style: STYLE})
        const otherScene: Scene = {...branch.scene, assets: [{...asset, seed: 7, components: other.map((component) => ({...component, edited: false}))}]}

        expect(Array.from(geometryOf(otherScene).getAttribute('position').array)).not.toEqual(
            Array.from(geometryOf(branch.scene).getAttribute('position').array),
        )
    })

    it('stands still in the wind, and starts at version 1', () => {
        for (const id of ['tree-stump', 'tree-log', 'tree-branch', 'tree-litter']) {
            const generator = findPropGenerator(id)!

            expect(generator.still, id).toBe(true)
            expect(generator.version, id).toBe(1)
        }
    })
})
