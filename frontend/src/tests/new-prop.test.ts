import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {COMMANDS} from '../core/commands/commands'
import {canUndo, EMPTY_HISTORY} from '../core/history/history'
import {createInitialScene} from '../core/scene/initial-scene'
import {hasUnsavedChanges, useEditorStore} from '../store/editor-store'
import {useUiStore} from '../store/ui-store'

const store = () => useEditorStore.getState()
const newTree = COMMANDS.find((command) => command.id === 'new-tree')!

beforeEach(() => {
    const scene = createInitialScene()

    useEditorStore.setState({scene, savedScene: scene, history: EMPTY_HISTORY, propInHand: false})
    useUiStore.setState({confirm: null})
})

afterEach(() => {
    useUiStore.setState({confirm: null})
})

describe('starting a new prop', () => {
    it('has no unsaved changes', () => {
        store().startNewProp('blossom-tree')

        expect(hasUnsavedChanges(store())).toBe(false)
        expect(store().treeName).toBe('Blossom tree')
    })

    it('has unsaved changes once a slider moves', () => {
        store().startNewProp('blossom-tree')
        store().updateTreeParameters({height: 7}, 'change height')

        expect(hasUnsavedChanges(store())).toBe(true)
    })

    it('leaves nothing to undo', () => {
        store().startNewProp('blossom-tree')
        const scene = store().scene

        store().undo()

        expect(canUndo(store().history)).toBe(false)
        expect(store().scene).toBe(scene)
    })

    it('leaves a prop to go back to from Home', () => {
        store().startNewProp('blossom-tree')

        expect(store().propInHand).toBe(true)
    })

    it('starts straight away when nothing is unsaved', () => {
        store().startNewProp('spring-tree')
        newTree.run(store())

        expect(useUiStore.getState().confirm).toBeNull()
        expect(store().presetId).toBe('blossom-tree')
    })

    it('asks first over unsaved work, and cancelling keeps that work', () => {
        store().startNewProp('blossom-tree')
        store().updateTreeParameters({height: 7}, 'change height')
        const work = store().scene

        newTree.run(store())

        expect(useUiStore.getState().confirm?.action).toBe('Start a new prop')
        expect(store().scene).toBe(work)

        useUiStore.getState().askConfirm(null)

        expect(store().scene).toBe(work)
        expect(hasUnsavedChanges(store())).toBe(true)
    })
})

describe('picking a preset in the editor', () => {
    it('is still undoable and still unsaved', () => {
        store().startNewProp('blossom-tree')
        const before = store().scene

        store().applyPreset('spring-tree')

        expect(hasUnsavedChanges(store())).toBe(true)

        store().undo()

        expect(store().scene).toBe(before)
    })
})
