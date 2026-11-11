import {describe, expect, it} from 'vitest'
import * as THREE from 'three'
import {bushGenerator, bushLeavesGenerator} from '../assets/bushes/bush-generator'
import {BLOOM_CELL, getLeafTexture, leafCell, type BloomKind, type BushLeafStyle} from '../assets/shared/leaf-texture'
import {createSeededRandom} from '../assets/shared/random'
import {getStyleProfile} from '../assets/style/style-profiles'
import {createSceneFromPreset} from '../core/scene/initial-scene'

const STYLES: readonly BushLeafStyle[] = ['pointed', 'tiny', 'narrow', 'spiky', 'scales', 'glossy']
const BLOOMS: readonly BloomKind[] = ['five', 'bell', 'ball', 'star', 'berries']

const pixels = (texture: THREE.DataTexture) => (texture.image as {data: Uint8Array}).data

/** Opaque pixels in one cell of the atlas. */
function covered(texture: THREE.DataTexture, cell: number): number {
    const [u, v, size] = leafCell(cell)
    const data = pixels(texture)
    const width = 512
    let count = 0

    for (let y = Math.floor(v * width); y < (v + size) * width; y++) {
        for (let x = Math.floor(u * width); x < (u + size) * width; x++) {
            count += data[(y * width + x) * 4 + 3] > 0 ? 1 : 0
        }
    }

    return count
}

function leavesOf(presetId: string, change: Record<string, unknown> = {}) {
    const asset = createSceneFromPreset(presetId).assets[0]
    const bush = bushGenerator.validate({...asset.parameters, ...change}).parameters

    return bushLeavesGenerator.generate({bush, seed: asset.seed}, {random: createSeededRandom(asset.seed), seed: asset.seed, style: getStyleProfile('detailed')})
}

describe('bush leaf styles and blooms', () => {
    it('start as today’s pointed leaves and five-petalled flowers, for bushes saved before the choice', () => {
        const saved = bushGenerator.validate({...createSceneFromPreset('round-bush').assets[0].parameters, leafStyle: undefined, bloom: undefined}).parameters

        expect(saved.leafStyle).toBe('pointed')
        expect(saved.bloom).toBe('five')
        expect(leavesOf('round-bush').surface?.map).toBe(getLeafTexture())
        // Unnamed, so a bush's exported material keeps the name it always had.
        expect(getLeafTexture().name).toBe('')
    })

    it.each(STYLES)('print %s leaves in every leaf cell, each picture its own', (style) => {
        const texture = getLeafTexture(style)

        for (let cell = 0; cell < BLOOM_CELL; cell++) {
            expect(covered(texture, cell)).toBeGreaterThan(512 * 512 * 0.03)
        }

        for (const other of STYLES.filter((name) => name !== style)) {
            expect(pixels(texture)).not.toEqual(pixels(getLeafTexture(other)))
        }
    })

    it.each(BLOOMS)('draw a %s bloom in the bloom cell, solid in its middle', (bloom) => {
        const texture = getLeafTexture('pointed', bloom)
        const [u, v, size] = leafCell(BLOOM_CELL)
        const middle = (Math.floor((v + size / 2) * 512) * 512 + Math.floor((u + size / 2) * 512)) * 4

        expect(covered(texture, BLOOM_CELL)).toBeGreaterThan(256 * 256 * 0.1)
        expect(pixels(texture)[middle + 3]).toBe(255)
    })

    it('make glossy leaves shine, and leave the rest matte', () => {
        expect(leavesOf('holly').surface?.roughness).toBeLessThan(1)
        expect(leavesOf('laurel').surface?.roughness).toBeLessThan(1)
        expect(leavesOf('juniper').surface?.roughness ?? 1).toBe(1)
        expect(leavesOf('round-bush').surface?.roughness ?? 1).toBe(1)
    })

    it('give holly its berries and heather its bells', () => {
        expect(leavesOf('holly').surface?.map).toBe(getLeafTexture('spiky', 'berries'))
        expect(leavesOf('heather').surface?.map).toBe(getLeafTexture('scales', 'bell'))
    })

    it('hide both choices on a low-poly bush, which has no printed leaves', () => {
        const keys = (build: string) =>
            bushGenerator.shownControls!({...createSceneFromPreset('round-bush').assets[0].parameters, build}).map((spec) => spec.key)

        expect(keys('painted')).toEqual(expect.arrayContaining(['leafStyle', 'bloom']))
        expect(keys('low-poly')).not.toContain('leafStyle')
        expect(keys('low-poly')).not.toContain('bloom')
    })
})
