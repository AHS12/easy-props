import {afterEach, describe, expect, it} from 'vitest'
import {findPropGenerator} from '../assets/prop-generators'
import {getStyleProfile} from '../assets/style/style-profiles'
import {parseSettings} from '../core/settings/settings-spec'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {updateTreeParameters} from '../core/scene/scene-ops'
import {useSettingsStore} from '../store/settings-store'
import {matchesSearch, ownColoursPatch, paletteChoiceFor, savedPaletteShowing, TREE_SET} from './palette-choice'

const STYLE = getStyleProfile('low-poly')
const GAME = ['#112233', '#445566', '#778899', '#aabbcc', '#ddeeff']

/** A preset's prop, and its colour choice as the panel sees it. */
function choiceOf(presetId: string, key = 'palette') {
    const scene = createSceneFromPreset(presetId)
    const asset = scene.assets[0]
    const specs = findPropGenerator(asset.generatorId)!.parameters
    const spec = specs.find((candidate) => candidate.key === key)!

    return {scene, asset, specs, choice: paletteChoiceFor(spec, specs, asset.parameters)!}
}

afterEach(() => useSettingsStore.setState({palettes: []}))

describe('palettes for a colour choice', () => {
    it("reads a painted tree's five colours as its palette", () => {
        const {choice} = choiceOf('spring-tree')

        expect(choice.set).toBe(TREE_SET)
        expect(choice.current).toHaveLength(5)
        expect(choice.named.length).toBeGreaterThan(10)
    })

    it("reads a rock's stone and a bush's flowers as palettes of their own", () => {
        expect(choiceOf('boulder').choice.set).toBe('stone')
        expect(choiceOf('round-bush', 'flowerColour').choice.set).toBe('flowers')
    })

    it('makes a tree look the same as the one a palette was saved from', () => {
        const from = choiceOf('autumn-tree').choice
        const saved = useSettingsStore.getState().savePalette('Our game', from.set, from.current)
        const {scene, asset, specs} = choiceOf('spring-tree')
        const patched = updateTreeParameters(scene, asset.id, ownColoursPatch(from, saved.colours), STYLE).assets[0].parameters
        const after = paletteChoiceFor(specs.find((spec) => spec.key === 'palette')!, specs, patched)!

        expect(after.current).toEqual(from.current)
        expect(savedPaletteShowing(after, [saved])?.name).toBe('Our game')
    })

    it('gives a rock the stone of a saved palette', () => {
        const {scene, asset, specs, choice} = choiceOf('boulder')
        const patched = updateTreeParameters(scene, asset.id, ownColoursPatch(choice, GAME.slice(0, 4)), STYLE).assets[0].parameters

        expect(paletteChoiceFor(specs.find((spec) => spec.key === 'palette')!, specs, patched)!.current).toEqual(GAME.slice(0, 4))
    })

    it('names no saved palette while a built-in one is showing', () => {
        const {choice} = choiceOf('spring-tree')

        expect(savedPaletteShowing(choice, [{id: 'a', name: 'Same', set: TREE_SET, colours: choice.current}])).toBeUndefined()
    })

    it('finds palettes by any word of their name', () => {
        expect(matchesSearch('game forest', 'Our forest game')).toBe(true)
        expect(matchesSearch('desert', 'Our forest game')).toBe(false)
        expect(matchesSearch('', 'Anything')).toBe(true)
    })
})

describe('saved palettes', () => {
    it('updates a palette saved again under the same name, and keeps others apart', () => {
        const store = useSettingsStore.getState()
        const first = store.savePalette('Our game', TREE_SET, GAME)

        useSettingsStore.getState().savePalette(' our GAME ', TREE_SET, [...GAME].reverse())
        useSettingsStore.getState().savePalette('Our game', 'stone', GAME.slice(0, 4))

        const {palettes} = useSettingsStore.getState()

        expect(palettes).toHaveLength(2)
        expect(palettes.find((palette) => palette.id === first.id)?.colours).toEqual([...GAME].reverse())
    })

    it('renames and removes', () => {
        const {id} = useSettingsStore.getState().savePalette('Old name', TREE_SET, GAME)

        useSettingsStore.getState().renamePalette(id, 'New name')
        expect(useSettingsStore.getState().palettes[0].name).toBe('New name')

        useSettingsStore.getState().removePalette(id)
        expect(useSettingsStore.getState().palettes).toEqual([])
    })

    it('keeps good palettes from the settings file and drops damaged ones', () => {
        const file = parseSettings(
            JSON.stringify({
                version: 2,
                palettes: [
                    {id: 'a', name: 'Good', set: 'tree', colours: ['#AABBCC']},
                    {id: 'b', name: '', set: 'tree', colours: ['#aabbcc']},
                    {id: 'c', name: 'Bad colour', set: 'tree', colours: ['red']},
                    'nonsense',
                ],
            }),
        )

        expect(file.palettes).toEqual([{id: 'a', name: 'Good', set: 'tree', colours: ['#aabbcc']}])
    })
})
