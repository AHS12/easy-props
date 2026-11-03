import {afterEach, describe, expect, it} from 'vitest'
import {findPreset, treePresets} from '../assets/trees/presets'
import {parseProject, serializeProject} from '../core/project/project-document'
import {createSceneFromPreset, DEFAULT_PRESET_ID, presetOfScene} from '../core/scene/initial-scene'
import {updateTreeParameters} from '../core/scene/scene-ops'
import {getStyleProfile} from '../assets/style/style-profiles'
import {useEditorStore} from '../store/editor-store'

const STYLE = getStyleProfile('low-poly')
const DRAFT_KEY = 'easy-props:draft'

afterEach(() => localStorage.removeItem(DRAFT_KEY))

/** A cherry blossom with a few changes, as someone would have saved it. */
function editedCherry() {
    const scene = createSceneFromPreset('cherry-blossom')

    return updateTreeParameters(scene, scene.assets[0].id, {height: 9, droop: 0.4}, STYLE)
}

describe('saving and opening', () => {
    it('opens a saved prop of every kind again', () => {
        const kinds = new Map(treePresets.map((preset) => [preset.generatorId, preset.id]))

        for (const presetId of kinds.values()) {
            const scene = createSceneFromPreset(presetId)

            expect(() => parseProject(serializeProject({scene, style: 'low-poly'})), presetId).not.toThrow()
        }
    })
})

describe('restoring a saved prop', () => {
    it('writes the preset into the file, and reads it back', () => {
        const text = serializeProject({scene: editedCherry(), style: 'low-poly', presetId: 'cherry-blossom'})
        const loaded = parseProject(text)

        expect(loaded.presetId).toBe('cherry-blossom')
        expect(loaded.extras).not.toHaveProperty('preset')
    })

    it('finds the closest preset of the same kind for a file from before it was saved', () => {
        expect(presetOfScene(editedCherry(), null)).toBe('cherry-blossom')
        expect(presetOfScene(createSceneFromPreset('boulder'), null)).toBe('boulder')
    })

    it('never takes a preset of another kind from the file', () => {
        expect(presetOfScene(createSceneFromPreset('boulder'), 'cherry-blossom')).toBe('boulder')
    })

    it('goes back to its own preset, not the older style tree, after picking up a draft', async () => {
        const text = serializeProject({scene: editedCherry(), style: 'low-poly'})

        localStorage.setItem(DRAFT_KEY, JSON.stringify({treeId: null, text}))
        useEditorStore.getState().applyPreset(DEFAULT_PRESET_ID)
        await useEditorStore.getState().restoreDraft()
        useEditorStore.getState().restoreTree()

        const asset = useEditorStore.getState().scene.assets[0]

        expect(asset.generatorId).toBe(findPreset('cherry-blossom')!.generatorId)
        expect(asset.parameters).toEqual(findPreset('cherry-blossom')!.parameters)
    })
})
