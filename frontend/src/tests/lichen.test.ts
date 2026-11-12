import {describe, expect, it} from 'vitest'
import {cutRockBodyGenerator, cutRockDefaults, cutRockGenerator, type CutRockParameters} from '../assets/rocks/cut-rock-generator'
import {getStoneTexture} from '../assets/shared/stone-texture'
import {findPreset} from '../assets/trees/presets'
import {parseProject, serializeProject} from '../core/project/project-document'
import {createSceneFromPreset} from '../core/scene/initial-scene'

const SEED = findPreset('boulder')!.seed
const boulder = (changes: Partial<CutRockParameters> = {}): CutRockParameters => ({...(findPreset('boulder')!.parameters as unknown as CutRockParameters), ...changes})

function bodyOf(rock: CutRockParameters) {
    return cutRockBodyGenerator.generate(cutRockBodyGenerator.validate({rock, seed: SEED}).parameters, {detail: 1} as never)
}

describe('lichen on rocks', () => {
    it('is on for new rocks at 0.3, and hidden on a low-poly one', () => {
        expect(cutRockDefaults.lichen).toBe(0.3)

        const keys = (build: string) => cutRockGenerator.shownControls!({...cutRockDefaults, build}).map((spec) => spec.key)

        expect(keys('painted')).toContain('lichen')
        expect(keys('low-poly')).not.toContain('lichen')
    })

    it('leaves the stone picture as it was at 0', () => {
        expect(getStoneTexture(0.6, undefined, 0)).toBe(getStoneTexture(0.6))
    })

    it('prints yellow-green patches on the stone once it is on', () => {
        const plain = getStoneTexture(0.6).image.data as Uint8Array
        const lichened = getStoneTexture(0.6, undefined, 1).image.data as Uint8Array
        let patches = 0
        let changed = 0

        for (let index = 0; index < plain.length; index += 4) {
            if (lichened[index] !== plain[index] || lichened[index + 2] !== plain[index + 2]) {
                changed++
            }

            // Yellow-green: blue is well below red, which bare grey stone never is.
            patches += lichened[index + 2] < lichened[index] * 0.8 ? 1 : 0
        }

        expect(patches).toBeGreaterThan(0)
        expect(changed / (plain.length / 4)).toBeLessThan(0.5)
        expect(getStoneTexture(0.6, undefined, 1).name).not.toBe(getStoneTexture(0.6).name)
    })

    it('adds no faces, and puts the picture on a rock with no grain', () => {
        expect(bodyOf(boulder({lichen: 1})).geometry.index!.count).toBe(bodyOf(boulder({lichen: 0})).geometry.index!.count)

        const bare = bodyOf(boulder({grain: 0, lichen: 0.6}))

        expect(bare.geometry.getAttribute('uv')).toBeDefined()
        expect(bare.surface?.map).toBeDefined()
        expect(bare.surface?.normalMap).toBeUndefined()
    })

    it('opens a rock saved before it with none, so it looks as it did', () => {
        const document = JSON.parse(serializeProject({scene: createSceneFromPreset('boulder'), style: 'low-poly'})) as {
            scene: {assets: {parameters: Record<string, unknown>; components: {parameters: {rock?: Record<string, unknown>}}[]}[]}
        }

        for (const asset of document.scene.assets) {
            delete asset.parameters.lichen

            for (const component of asset.components) {
                delete component.parameters.rock?.lichen
            }
        }

        const [asset] = parseProject(JSON.stringify(document)).scene.assets

        expect(asset.parameters.lichen).toBe(0)
        expect((asset.components[0].parameters as {rock: {lichen: number}}).rock.lichen).toBe(0)
    })
})
