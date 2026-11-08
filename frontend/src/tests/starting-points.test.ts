import {beforeEach, describe, expect, it, vi} from 'vitest'
import {canUndo, EMPTY_HISTORY} from '../core/history/history'
import {summarizeProp} from '../core/library/prop-summary'
import {parsePropsIndex, serializePropsIndex} from '../core/library/props-index'
import {isStartingPoint, parseProject, serializeProject} from '../core/project/project-document'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {hasUnsavedChanges, useEditorStore} from '../store/editor-store'

vi.mock('../core/export/tree-thumbnail', () => ({renderTreeThumbnail: vi.fn(async () => 'data:image/png;base64,AA==')}))

const store = () => useEditorStore.getState()
const bytes = (text: string) => [...new TextEncoder().encode(text)]
const textOf = (contents: number[]) => new TextDecoder().decode(new Uint8Array(contents))

/** The saved props folder, in memory. */
function fakeLibrary(files: Record<string, string>) {
    const saved = new Map(Object.entries(files))

    return {
        saved,
        ListProps: vi.fn(async () => [...saved].map(([id, text]) => ({id, savedAt: '2026-11-08T10:00:00Z', size: text.length, hasPicture: false}))),
        ReadProp: vi.fn(async (id: string) => bytes(saved.get(id) ?? '')),
        WriteProp: vi.fn(async (id: string, contents: number[]) => void saved.set(id, textOf(contents))),
        ReadPropsIndex: vi.fn(async () => null),
        WritePropsIndex: vi.fn(async () => undefined),
    }
}

const ourScene = createSceneFromPreset('oak')
const startingPointFile = serializeProject({
    scene: ourScene,
    name: 'Our ourScene',
    style: 'low-poly',
    presetId: 'oak',
    extras: {startingPoint: true, createdAt: '2026-10-01T00:00:00.000Z'},
})

let app: ReturnType<typeof fakeLibrary>

beforeEach(() => {
    app = fakeLibrary({ours: startingPointFile})
    window.go = {backend: {App: app as never}}

    const scene = createSceneFromPreset('maple')

    useEditorStore.setState({
        scene,
        savedScene: scene,
        history: EMPTY_HISTORY,
        currentTreeId: null,
        projectExtras: {},
        treeName: 'Red maple',
        gallery: [],
        savePrompt: null,
        toast: null,
    })
})

describe('a starting point', () => {
    it('is marked in its file, and listed as one', () => {
        expect(summarizeProp(startingPointFile).startingPoint).toBe(true)
        expect(summarizeProp(serializeProject({scene: ourScene, style: 'low-poly'})).startingPoint).toBe(false)
    })

    it('keeps its mark through an older reader, which keeps keys it does not know', () => {
        expect(isStartingPoint(parseProject(startingPointFile).extras)).toBe(true)
    })

    it('opens as a new, unsaved copy that is not a starting point', async () => {
        await store().startFromStartingPoint('ours')

        expect(store().currentTreeId).toBeNull()
        expect(store().treeName).toBe('Our ourScene')
        expect(store().scene).toEqual(ourScene)
        expect(isStartingPoint(store().projectExtras)).toBe(false)
        expect(store().projectExtras.createdAt).toBeUndefined()
        expect(hasUnsavedChanges(store())).toBe(false)
    })

    it('never changes when the copy made from it is saved', async () => {
        await store().startFromStartingPoint('ours')
        store().saveTree()
        await store().finishSave('Pine for level 2')

        expect(app.saved.get('ours')).toBe(startingPointFile)

        const copy = [...app.saved].find(([id]) => id !== 'ours')![1]

        expect(summarizeProp(copy).startingPoint).toBe(false)
    })

    it('is saved from the prop in hand under a name of its own', async () => {
        store().saveStartingPoint()
        expect(store().savePrompt?.title).toBe('Save as my preset')

        await store().finishSave('Our maple')

        const [, written] = [...app.saved].find(([id]) => id !== 'ours')!

        expect(summarizeProp(written)).toMatchObject({name: 'Our maple', startingPoint: true})
        expect(store().toast?.message).toBe('Saved "Our maple" to My presets')
    })

    it('stops being one and stays a saved prop', async () => {
        await store().setStartingPoint('ours', false)

        expect(summarizeProp(app.saved.get('ours')!)).toMatchObject({name: 'Our ourScene', startingPoint: false})
    })

    it('can be picked in the editor as one step to undo, as a preset can', async () => {
        const before = store().scene

        await store().applyStartingPoint('ours')
        expect(store().scene).toEqual(ourScene)

        store().undo()
        expect(store().scene).toBe(before)
        expect(canUndo(store().history)).toBe(false)
    })
})

describe('the index of saved props', () => {
    it('keeps a palm, a flower or a cactus, not only trees, rocks and bushes', () => {
        const summary = {...summarizeProp(startingPointFile), kind: 'cactus' as const}
        const text = serializePropsIndex({one: {size: 1, savedAt: 'now', summary}})

        expect(parsePropsIndex(text).one?.summary.kind).toBe('cactus')
    })
})

describe('Your props', () => {
    it('opens on My presets alone when asked, and on everything otherwise', () => {
        store().showProps(true)
        expect(store().onlyMyPresets).toBe(true)

        store().showProps()
        expect(store().onlyMyPresets).toBe(false)
    })
})
