import {describe, expect, it} from 'vitest'
import {findComponentGenerator} from '../assets/component-generators'
import {findPropGenerator, generatePropComponents} from '../assets/prop-generators'
import {getStoneRelief, getStoneTexture} from '../assets/shared/stone-texture'
import {createSeededRandom} from '../assets/shared/random'
import {getStyleProfile} from '../assets/style/style-profiles'
import {findPreset} from '../assets/trees/presets'
import {parseProject, serializeProject} from '../core/project/project-document'
import {createSceneFromPreset} from '../core/scene/initial-scene'

const STYLE = getStyleProfile('low-poly')

function rockPart(changes: Record<string, unknown>, id = 'mossy-boulder') {
    const preset = findPreset(id)!
    const values = findPropGenerator(preset.generatorId)!.validate({...preset.parameters, ...changes}).parameters as Record<string, unknown>
    const [component] = generatePropComponents(preset.generatorId, values, preset.seed, STYLE)
    const generator = findComponentGenerator(component.generatorId)!

    return generator.generate(generator.validate(component.parameters).parameters, {random: createSeededRandom(component.seed), seed: component.seed, style: STYLE, detail: 1})
}

describe('grain on rocks', () => {
    it('is on for a new rock', () => {
        const rock = rockPart({})

        expect(rock.surface?.map).toBeDefined()
        expect(rock.surface?.normalMap).toBeDefined()
        expect(rock.geometry.getAttribute('uv').count).toBe(rock.geometry.getAttribute('position').count)
    })

    it('leaves the stone exactly as it was when there is none', () => {
        // Lichen is on by default, so it is turned off here to leave a rock with no picture at all.
        const plain = rockPart({grain: 0, lichen: 0})
        const grained = rockPart({grain: 0.6})

        expect(plain.surface?.map).toBeUndefined()
        expect(plain.geometry.getAttribute('uv')).toBeUndefined()
        expect(Array.from(plain.geometry.getAttribute('position').array)).toEqual(Array.from(grained.geometry.getAttribute('position').array))
        expect(Array.from(plain.geometry.getAttribute('color').array)).toEqual(Array.from(grained.geometry.getAttribute('color').array))
    })

    it('is left off a low-poly rock', () => {
        const rock = rockPart({build: 'low-poly', grain: 1})

        expect(rock.surface?.map).toBeUndefined()
        expect(rock.geometry.getAttribute('uv')).toBeUndefined()
    })

    it('prints nearly white, so the stone keeps its own colours', () => {
        const data = getStoneTexture(1).image.data as Uint8Array
        let sum = 0

        for (let index = 0; index < data.length; index += 4) {
            sum += data[index]
        }

        expect(sum / (data.length / 4) / 255).toBeGreaterThan(0.8)
        expect(getStoneTexture(0.6)).toBe(getStoneTexture(0.6))
        expect(getStoneRelief(0.6)).not.toBe(getStoneRelief(1))
    })
})

describe('a rock saved before grain', () => {
    const withoutGrain = () => {
        const scene = createSceneFromPreset('mossy-boulder')
        const text = serializeProject({scene, style: 'low-poly'})
        const document = JSON.parse(text) as {scene: {assets: {parameters: Record<string, unknown>; components: {parameters: {rock?: Record<string, unknown>}}[]}[]}}

        for (const asset of document.scene.assets) {
            delete asset.parameters.grain

            for (const component of asset.components) {
                delete component.parameters.rock?.grain
            }
        }

        return JSON.stringify(document)
    }

    it('opens with none, so it looks as it did', () => {
        const [asset] = parseProject(withoutGrain()).scene.assets

        expect(asset.parameters.grain).toBe(0)
        expect((asset.components[0].parameters as {rock: {grain: number}}).rock.grain).toBe(0)
    })

    it('keeps the grain of a rock saved with it', () => {
        const scene = createSceneFromPreset('mossy-boulder')
        const [asset] = parseProject(serializeProject({scene, style: 'low-poly'})).scene.assets

        expect(asset.parameters.grain).toBe(0.6)
    })
})
