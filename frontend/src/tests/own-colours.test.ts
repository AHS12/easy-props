import {describe, expect, it} from 'vitest'
import {findComponentGenerator} from '../assets/component-generators'
import {findPropGenerator, generatePropComponents, shownControls} from '../assets/prop-generators'
import {createSeededRandom} from '../assets/shared/random'
import {OWN_COLOURS} from '../assets/style/own-colours'
import {getStyleProfile} from '../assets/style/style-profiles'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {updateTreeParameters} from '../core/scene/scene-ops'

const STYLE = getStyleProfile('low-poly')
const SEED = 7

/** Each kind with own colours, and settings that show every colour it has. */
const KINDS = [
    {id: 'cut-rock', parameters: {}},
    {id: 'bush', parameters: {flowers: 0.6}},
    {id: 'grass', parameters: {flowers: 0.6}},
    {id: 'plant', parameters: {}},
    {id: 'cactus', parameters: {flowers: 6}},
] as const

/** Every vertex colour of every part, in order. */
function coloursOf(generatorId: string, parameters: Readonly<Record<string, unknown>>): number[] {
    return generatePropComponents(generatorId, parameters, SEED, STYLE).flatMap((component) => {
        const generator = findComponentGenerator(component.generatorId)!
        const validated = generator.validate(component.parameters).parameters
        const part = generator.generate(validated, {random: createSeededRandom(component.seed), seed: component.seed, style: STYLE})

        return [...(part.geometry.getAttribute('color')?.array ?? [])]
    })
}

const colourSpecs = (generatorId: string) => findPropGenerator(generatorId)!.parameters.filter((spec) => spec.kind === 'colour')

describe('my own colours', () => {
    it.each(KINDS)('offers them on every colour choice of $id', ({id}) => {
        const specs = findPropGenerator(id)!.parameters
        const owners = new Set(colourSpecs(id).map((spec) => spec.kind === 'colour' && spec.ownOf))

        expect(owners.size).toBeGreaterThan(0)

        for (const owner of owners) {
            const choice = specs.find((spec) => spec.key === owner)

            expect(choice?.kind === 'choice' && choice.options.some((option) => option.value === OWN_COLOURS)).toBe(true)
        }
    })

    it.each(KINDS)('makes a $id saved before them come out the same, whatever own colours say', ({id, parameters}) => {
        const scrambled = Object.fromEntries(colourSpecs(id).map((spec) => [spec.key, '#ff00ff']))

        expect(coloursOf(id, {...parameters, ...scrambled})).toEqual(coloursOf(id, parameters))
    })

    it.each(KINDS)('paints a $id the same as a named choice when its own colours match it', ({id, parameters}) => {
        const named = coloursOf(id, parameters)
        const own: Record<string, string> = {}

        for (const spec of colourSpecs(id)) {
            if (spec.kind === 'colour') {
                own[spec.ownOf] = OWN_COLOURS
                own[spec.key] = spec.default
            }
        }

        expect(coloursOf(id, {...parameters, ...own})).toEqual(named)
    })

    it.each(KINDS)('paints a $id in its own colours when chosen', ({id, parameters}) => {
        const own: Record<string, string> = {}

        for (const spec of colourSpecs(id)) {
            if (spec.kind === 'colour') {
                own[spec.ownOf] = OWN_COLOURS
                own[spec.key] = '#ff00ff'
            }
        }

        expect(coloursOf(id, {...parameters, ...own})).not.toEqual(coloursOf(id, parameters))
    })

    it('starts every row at the colour that was showing', () => {
        const scene = createSceneFromPreset('boulder')
        const asset = scene.assets[0]
        const was = String(asset.parameters.palette)
        const next = updateTreeParameters(scene, asset.id, {palette: OWN_COLOURS}, STYLE).assets[0].parameters

        for (const spec of colourSpecs('cut-rock')) {
            expect(spec.kind === 'colour' && next[spec.key]).toBe(spec.kind === 'colour' && spec.named[was])
        }

        expect(coloursOf('cut-rock', next)).toEqual(coloursOf('cut-rock', asset.parameters))
    })

    it('starts again from the named stone showing, each time it is chosen', () => {
        const scene = createSceneFromPreset('boulder')
        const id = scene.assets[0].id
        const own = updateTreeParameters(scene, id, {palette: OWN_COLOURS, stoneLight: '#123456'}, STYLE)
        const slate = updateTreeParameters(own, id, {palette: 'slate'}, STYLE)
        const back = updateTreeParameters(slate, id, {palette: OWN_COLOURS}, STYLE)

        expect(own.assets[0].parameters.stoneLight).toBe('#123456')
        expect(back.assets[0].parameters.stoneLight).toBe('#83a0bd')
    })

    it('shows the rows only while My own colours is chosen, and only beside a choice that shows', () => {
        const keys = (id: string, values: Record<string, unknown>) =>
            shownControls(id, findPropGenerator(id)!.parameters, values).map((spec) => spec.key)

        expect(keys('cut-rock', {palette: 'slate'})).not.toContain('stoneLight')
        expect(keys('cut-rock', {palette: OWN_COLOURS})).toContain('stoneLight')
        // A cactus without flowers hides Flower colour, and so its own colours too.
        expect(keys('cactus', {flowers: 0, flowerColour: OWN_COLOURS})).not.toContain('flowerDeep')
        expect(keys('cactus', {flowers: 4, flowerColour: OWN_COLOURS})).toContain('flowerDeep')
    })
})
