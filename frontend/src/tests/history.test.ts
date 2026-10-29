import {describe, expect, it} from 'vitest'
import {
    canRedo,
    canUndo,
    EMPTY_HISTORY,
    pushHistory,
    redo,
    redoLabel,
    undo,
    undoLabel,
    type DocumentState,
} from '../core/history/history'
import {createInitialScene, createSceneFromPreset} from '../core/scene/initial-scene'
import {treePresets} from '../assets/trees/presets'

function state(presetId: string): DocumentState {
    return {
        scene: createSceneFromPreset(presetId),
        style: 'low-poly',
        presetId,
    }
}

describe('history', () => {
    it('starts with nothing to undo or redo', () => {
        expect(canUndo(EMPTY_HISTORY)).toBe(false)
        expect(canRedo(EMPTY_HISTORY)).toBe(false)
        expect(undoLabel(EMPTY_HISTORY)).toBeNull()
        expect(redoLabel(EMPTY_HISTORY)).toBeNull()
    })

    it('undoes and redoes a change', () => {
        const before = state(treePresets[0].id)
        const after = state(treePresets[1].id)

        const history = pushHistory(EMPTY_HISTORY, 'change tree', before, after)
        expect(canUndo(history)).toBe(true)

        const undone = undo(history)
        expect(undone?.document).toEqual(before)
        expect(undone?.history.index).toBe(-1)

        const redone = redo(undone!.history)
        expect(redone?.document).toEqual(after)
    })

    it('restores the preset the tree came from', () => {
        const before = state(treePresets[0].id)
        const after = state(treePresets[2].id)

        const history = pushHistory(EMPTY_HISTORY, 'change tree', before, after)
        const undone = undo(history)

        expect(undone?.document.presetId).toBe(treePresets[0].id)
    })

    it('names the operation it would reverse', () => {
        const history = pushHistory(
            EMPTY_HISTORY,
            'change tree',
            state(treePresets[0].id),
            state(treePresets[1].id),
        )

        expect(undoLabel(history)).toBe('change tree')
        expect(redoLabel(history)).toBeNull()
    })

    it('drops the redo entries when a new edit is made', () => {
        const first = pushHistory(
            EMPTY_HISTORY,
            'first',
            state(treePresets[0].id),
            state(treePresets[1].id),
        )
        const undone = undo(first)!

        const second = pushHistory(
            undone.history,
            'second',
            undone.document,
            state(treePresets[2].id),
        )

        expect(canRedo(second)).toBe(false)
        expect(second.entries).toHaveLength(1)
    })

    it('keeps the scene and the preset in step', () => {
        const scene = createInitialScene()
        const asset = scene.assets[0]

        expect(asset.parameters.height).toBe(treePresets[0].parameters.height)
    })

    it('does not mutate the states it is given', () => {
        const before = state(treePresets[0].id)
        const after = state(treePresets[1].id)
        const snapshot = {...before}

        pushHistory(EMPTY_HISTORY, 'change tree', before, after)

        expect(before).toEqual(snapshot)
    })
})
