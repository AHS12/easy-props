import {describe, expect, it} from 'vitest'
import * as THREE from 'three'
import {getDabTexture} from '../assets/shared/dab-texture'
import {getTreeLeafTexture, leafStyleCell, type PrintedLeafStyle} from '../assets/shared/tree-leaf-texture'
import {getStyleProfile} from '../assets/style/style-profiles'
import {paintedClumpGenerator} from '../assets/trees/components/painted-parts'
import {paintedTreeParameterSpecs, validatePaintedTreeParameters, controlsForTree, type PaintedTreeParameters} from '../assets/trees/painted'
import {litterLeavesGenerator, pieceDefaults} from '../assets/trees/pieces/piece-generators'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {createSeededRandom} from '../assets/shared/random'

const STYLES: readonly PrintedLeafStyle[] = ['round', 'lobed', 'feathery', 'needles']
const DETAILED = getStyleProfile('detailed')

/** The leaf clumps of a preset, built with any change to its settings. */
function clumpsOf(presetId: string, change: Partial<PaintedTreeParameters> = {}) {
    const asset = createSceneFromPreset(presetId).assets[0]

    return asset.components
        .filter((part) => part.generatorId === 'painted-clump')
        .map((part) => {
            const parameters = part.parameters as {tree: PaintedTreeParameters}
            const validated = paintedClumpGenerator.validate({...parameters, tree: {...parameters.tree, ...change}}).parameters

            return paintedClumpGenerator.generate(validated, {random: createSeededRandom(part.seed), seed: part.seed, style: DETAILED})
        })
}

const alphaAt = (texture: THREE.DataTexture, u: number, v: number) => {
    const {width, data} = texture.image as {width: number; data: Uint8Array}

    return data[(Math.floor(v * width) * width + Math.floor(u * width)) * 4 + 3]
}

describe('leaf styles', () => {
    it('start as painted, on new trees and on trees saved before there was a choice', () => {
        expect(validatePaintedTreeParameters({}).parameters.leafStyle).toBe('painted')
        expect(validatePaintedTreeParameters(createSceneFromPreset('oak').assets[0].parameters).parameters.leafStyle).toBe('painted')
    })

    it.each(STYLES)('print %s leaves on every card variant, with a solid middle and a cut-out edge', (style) => {
        const texture = getTreeLeafTexture(style)

        expect(texture.name).toBe(`leaves_${style}`)

        for (let cell = 0; cell < 4; cell++) {
            const [u, v, size] = leafStyleCell(cell)

            // Fronds, fruit and strands sample the middle; it must be leaf at every level of detail.
            expect(alphaAt(texture, u + size / 2, v + size / 2)).toBe(255)
            expect(alphaAt(texture, u + size * 0.02, v + size * 0.02)).toBe(0)
        }
    })

    it('draw a different picture for each style', () => {
        const pictures = [getDabTexture(), ...STYLES.map(getTreeLeafTexture)].map((texture) => (texture.image as {data: Uint8Array}).data)

        for (let a = 0; a < pictures.length; a++) {
            for (let b = a + 1; b < pictures.length; b++) {
                expect(pictures[a]).not.toEqual(pictures[b])
            }
        }
    })

    it.each(STYLES)('print %s on a crown’s cards without changing their shape', (style) => {
        const painted = clumpsOf('oak')
        const styled = clumpsOf('oak', {leafStyle: style})

        styled.forEach((part, index) => {
            expect(part.surface?.map).toBe(getTreeLeafTexture(style))
            expect(part.geometry.getAttribute('position').array).toEqual(painted[index].geometry.getAttribute('position').array)
        })
        expect(painted[0].surface?.map).toBe(getDabTexture())
    })

    it('leave a palm’s fronds on the dabs, and show no choice for them or a low-poly tree', () => {
        for (const part of clumpsOf('coconut-palm-painted', {leafStyle: 'lobed'})) {
            expect(part.surface?.map).toBe(getDabTexture())
        }

        const keys = (values: Partial<PaintedTreeParameters>) =>
            controlsForTree(paintedTreeParameterSpecs, {...createSceneFromPreset('oak').assets[0].parameters, ...values}).map((spec) => spec.key)

        expect(keys({})).toContain('leafStyle')
        expect(keys({form: 'palm'})).not.toContain('leafStyle')
        expect(keys({build: 'low-poly'})).not.toContain('leafStyle')
    })

    it('build Broad as real leaves over the cards, glossy, at a cost Make it fit can bring down', () => {
        const triangles = (parts: ReturnType<typeof clumpsOf>) => parts.reduce((sum, part) => sum + (part.geometry.index?.count ?? 0) / 3, 0)
        const painted = clumpsOf('oak')
        const broad = clumpsOf('oak', {leafStyle: 'broad'})

        expect(broad[0].surface?.map).toBe(getDabTexture())
        expect(broad[0].surface?.roughness).toBeLessThan(1)
        expect(painted[0].surface?.roughness ?? 1).toBe(1)
        // Real leaves cost more than cards, but not runaway more.
        expect(triangles(broad) / triangles(painted)).toBeGreaterThan(1.1)
        expect(triangles(broad) / triangles(painted)).toBeLessThan(2.2)
        // Thinning the leaves is what Make it fit reaches for first.
        expect(triangles(clumpsOf('oak', {leafStyle: 'broad', fullness: 0.4}))).toBeLessThan(triangles(broad) * 0.8)
    })

    it('thin Broad leaves out on a lighter level', () => {
        const asset = createSceneFromPreset('mango').assets[0]
        const part = asset.components.find((component) => component.generatorId === 'painted-clump')!
        const parameters = paintedClumpGenerator.validate(part.parameters).parameters
        const at = (detail: number) =>
            (paintedClumpGenerator.generate(parameters, {random: createSeededRandom(part.seed), seed: part.seed, style: DETAILED, detail}).geometry.index?.count ?? 0) / 3

        expect(at(0.5)).toBeLessThan(at(1) * 0.75)
        expect(at(0.15)).toBeLessThan(at(0.5))
    })

    it('carry over to the leaf litter made from a tree', () => {
        const tree = {...createSceneFromPreset('oak').assets[0].parameters, leafStyle: 'lobed'}
        const litter = litterLeavesGenerator.generate({piece: {...pieceDefaults, tree: JSON.stringify(tree)}, seed: 3}, {random: createSeededRandom(3), seed: 3, style: DETAILED})

        expect(litter.surface?.map).toBe(getTreeLeafTexture('lobed'))
    })
})
