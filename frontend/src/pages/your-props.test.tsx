import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {Toast} from '../panels/Toast'
import {DEFAULT_CLOUD_BACKUP} from '../core/settings/settings-spec'
import {useEditorStore} from '../store/editor-store'
import {useSettingsStore} from '../store/settings-store'
import {YourPropsPage} from './YourPropsPage'
import {fakeDesktop} from '../platform/shell'

const documentOf = (name: string, generatorId: string, seed: number) =>
    JSON.stringify({
        schemaVersion: 2,
        generator: 'easy-props',
        createdAt: '2026-10-02T09:00:00.000Z',
        modifiedAt: '2026-11-01T09:00:00.000Z',
        name,
        style: 'low-poly',
        scene: {id: 'scene-1', assets: [{id: 'asset-1', kind: 'tree', generatorId, generatorVersion: 1, seed, components: [], parameters: {}, materials: {bark: 'b', leaves: 'l'}}]},
    })

interface File {
    contents: string
    savedAt: string
}

/** A saved props folder and its bin, kept in memory and changed as Go would change them. */
function fakeLibrary() {
    const saved = new Map<string, File>([
        ['oak', {contents: documentOf('Old oak', 'painted-tree', 48213), savedAt: '2026-11-03T10:00:00Z'}],
        ['rock', {contents: documentOf('Mossy boulder', 'cut-rock', 7), savedAt: '2026-11-02T10:00:00Z'}],
        ['fern', {contents: documentOf('Fern', 'plant', 3), savedAt: '2026-11-01T10:00:00Z'}],
    ])
    const bin = new Map<string, File>()
    const bytes = (text: string) => [...new TextEncoder().encode(text)]
    const move = (from: Map<string, File>, to: Map<string, File>, id: string) => {
        const file = from.get(id)

        if (!file || to.has(id)) {
            throw new Error(`cannot move ${id}`)
        }

        from.delete(id)
        to.set(id, file)
    }

    return {
        saved,
        bin,
        ListProps: vi.fn(async () =>
            [...saved].map(([id, file]) => ({id, savedAt: file.savedAt, size: file.contents.length, hasPicture: true})),
        ),
        ReadProp: vi.fn(async (id: string) => bytes(saved.get(id)?.contents ?? '')),
        WriteProp: vi.fn(async (id: string, contents: number[]) => {
            saved.set(id, {contents: new TextDecoder().decode(new Uint8Array(contents)), savedAt: '2026-11-04T10:00:00Z'})
        }),
        CopyPropPicture: vi.fn(async () => undefined),
        ReadPropsIndex: vi.fn(async () => null),
        WritePropsIndex: vi.fn(async () => undefined),
        ShowProp: vi.fn(async () => undefined),
        RemoveProp: vi.fn(async (id: string) => move(saved, bin, id)),
        PutBackProp: vi.fn(async (id: string) => move(bin, saved, id)),
        ForgetRemovedProp: vi.fn(async (id: string) => void bin.delete(id)),
        ListRemovedProps: vi.fn(async () =>
            [...bin].map(([id, file]) => ({id, savedAt: file.savedAt, removedAt: '2026-11-04T09:00:00Z', size: 1, hasPicture: false})),
        ),
        ReadRemovedProp: vi.fn(async (id: string) => bytes(bin.get(id)?.contents ?? '')),
    }
}

let app: ReturnType<typeof fakeLibrary>
const openTree = vi.fn(async () => undefined)

beforeEach(() => {
    app = fakeLibrary()
    fakeDesktop(app)
    useEditorStore.setState({
        page: 'props',
        pickedPropId: null,
        batchPicked: null,
        batchSavedIds: [],
        batchOpen: false,
        removedProps: [],
        toast: null,
        currentTreeId: null,
        openTree,
    })
})

afterEach(() => {
    cleanup()
    fakeDesktop()
    openTree.mockClear()
})

const tile = (name: string) => screen.getByRole('button', {name: new RegExp(`^${name}`)})

async function showPage() {
    render(
        <>
            <YourPropsPage />
            <Toast />
        </>,
    )
    await waitFor(() => expect(tile('Old oak')).toBeInTheDocument())
}

describe('Your props', () => {
    it('lists every saved prop, with a count for each kind it has', async () => {
        await showPage()

        const kinds = screen.getByRole('tablist', {name: 'Kind of prop'})

        expect(within(kinds).getByRole('tab', {name: /All/}).textContent).toContain('3')
        expect(within(kinds).getByRole('tab', {name: /Rock/}).textContent).toContain('1')
        expect(within(kinds).getByRole('tab', {name: /Flower/}).textContent).toContain('1')
        expect(within(kinds).queryByRole('tab', {name: /Cactus/})).toBeNull()
    })

    it('shows only the props of the kind picked', async () => {
        await showPage()

        fireEvent.click(screen.getByRole('tab', {name: /Rock/}))

        expect(screen.queryByRole('button', {name: /^Old oak/})).toBeNull()
        expect(tile('Mossy boulder')).toBeInTheDocument()
    })

    it('says what the picked prop is beside the list', async () => {
        await showPage()

        fireEvent.click(tile('Mossy boulder'))

        const details = screen.getByRole('complementary', {name: 'About Mossy boulder'})

        expect(within(details).getByText('Rock')).toBeInTheDocument()
        expect(within(details).getByText('7')).toBeInTheDocument()
    })

    it('opens the picked prop with Enter', async () => {
        await showPage()

        fireEvent.click(tile('Fern'))
        fireEvent.keyDown(tile('Fern'), {key: 'Enter'})

        expect(openTree).toHaveBeenCalledWith('fern')
    })

    it('exports a prop without opening it', async () => {
        await showPage()

        fireEvent.click(tile('Old oak'))
        fireEvent.click(screen.getByRole('button', {name: /Export/}))

        expect(useEditorStore.getState().batchSavedIds).toEqual(['oak'])
        expect(useEditorStore.getState().batchOpen).toBe(true)
        expect(openTree).not.toHaveBeenCalled()
    })

    it('finds a prop by part of its name', async () => {
        await showPage()

        fireEvent.change(screen.getByRole('textbox', {name: 'Search your props'}), {target: {value: 'boul'}})

        expect(screen.queryByRole('button', {name: /^Old oak/})).toBeNull()
        expect(tile('Mossy boulder')).toBeInTheDocument()
    })

    it('shows a prop in its folder', async () => {
        await showPage()

        fireEvent.click(screen.getByRole('button', {name: 'Show in folder'}))

        await waitFor(() => expect(app.ShowProp).toHaveBeenCalledWith('oak'))
    })
})

describe('removing props', () => {
    it('moves a prop to the bin without asking, and Undo puts it back', async () => {
        await showPage()

        fireEvent.click(tile('Fern'))
        fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', {name: /Remove/}))

        await waitFor(() => expect(screen.queryByRole('button', {name: /^Fern/})).toBeNull())
        expect(app.bin.has('fern')).toBe(true)
        expect(screen.getByText('Removed "Fern"')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', {name: 'Undo'}))

        await waitFor(() => expect(tile('Fern')).toBeInTheDocument())
        expect(app.saved.has('fern')).toBe(true)
        expect(app.bin.size).toBe(0)
        expect(screen.getByRole('complementary', {name: 'About Fern'})).toBeInTheDocument()
    })

    it('lists removed props under Recently removed, where they can be put back', async () => {
        await showPage()

        fireEvent.click(tile('Fern'))
        fireEvent.keyDown(tile('Fern'), {key: 'Delete'})

        fireEvent.click(await screen.findByRole('button', {name: 'Recently removed (1)'}))

        const bin = screen.getByRole('region', {name: 'Recently removed'})

        expect(within(bin).getByText('Fern')).toBeInTheDocument()

        fireEvent.click(within(bin).getByRole('button', {name: /Put back/}))

        await waitFor(() => expect(app.saved.has('fern')).toBe(true))
        await waitFor(() => expect(within(bin).getByText('Nothing here.')).toBeInTheDocument())
    })

    it('asks before removing a prop in the bin for good', async () => {
        await showPage()

        fireEvent.keyDown(tile('Old oak'), {key: 'Delete'})
        fireEvent.click(await screen.findByRole('button', {name: 'Recently removed (1)'}))
        fireEvent.click(screen.getByRole('button', {name: 'Remove Old oak for good'}))

        expect(app.ForgetRemovedProp).not.toHaveBeenCalled()

        fireEvent.click(within(screen.getByRole('group', {name: /Remove “Old oak” for good/})).getByRole('button', {name: 'Remove for good'}))

        await waitFor(() => expect(app.ForgetRemovedProp).toHaveBeenCalledWith('oak'))
    })
})

describe('copying a prop', () => {
    it('saves a copy named after it, with its picture, and picks the copy', async () => {
        await showPage()

        fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', {name: /Copy/}))

        await waitFor(() => expect(tile('Old oak copy')).toBeInTheDocument())

        const [[copyId, contents]] = app.WriteProp.mock.calls
        const copy = JSON.parse(new TextDecoder().decode(new Uint8Array(contents)))

        expect(copy.name).toBe('Old oak copy')
        expect(copy.createdAt).not.toBe('2026-10-02T09:00:00.000Z')
        expect(app.CopyPropPicture).toHaveBeenCalledWith('oak', copyId)
        expect(screen.getByRole('complementary', {name: 'About Old oak copy'})).toBeInTheDocument()
        expect(app.saved.get('oak')?.contents).toBe(documentOf('Old oak', 'painted-tree', 48213))
    })
})

describe('ticking several props', () => {
    it('ticks with Ctrl-click and acts on all of them at once', async () => {
        await showPage()

        fireEvent.click(tile('Old oak'))
        fireEvent.click(tile('Fern'), {ctrlKey: true})

        const panel = screen.getByRole('complementary', {name: '2 props ticked'})

        fireEvent.click(within(panel).getByRole('button', {name: /Export/}))

        expect(useEditorStore.getState().batchSavedIds).toEqual(['oak', 'fern'])
    })

    it('ticks a run with Shift-click', async () => {
        await showPage()

        fireEvent.click(tile('Old oak'))
        fireEvent.click(tile('Fern'), {shiftKey: true})

        expect(screen.getByRole('complementary', {name: '3 props ticked'})).toBeInTheDocument()
    })

    it('removes every ticked prop, and Undo brings them all back', async () => {
        await showPage()

        fireEvent.click(tile('Old oak'))
        fireEvent.click(tile('Mossy boulder'), {ctrlKey: true})
        fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', {name: /Remove/}))

        await waitFor(() => expect(screen.getByText('Removed 2 props')).toBeInTheDocument())
        expect(app.saved.size).toBe(1)

        fireEvent.click(screen.getByRole('button', {name: 'Undo'}))

        await waitFor(() => expect(app.saved.size).toBe(3))
    })

    it('clears the ticks with Escape', async () => {
        await showPage()

        fireEvent.click(tile('Old oak'))
        fireEvent.click(tile('Fern'), {ctrlKey: true})

        act(() => {
            fireEvent.keyDown(tile('Fern'), {key: 'Escape'})
        })

        expect(screen.queryByRole('complementary', {name: /ticked/})).toBeNull()
    })
})

describe('the backup line in the panel', () => {
    it('says whether the picked prop is backed up to the cloud', async () => {
        const status = vi.fn(async (_target: unknown, id: string) => (id === 'oak' ? 'backed-up' : 'changed'))
        fakeDesktop({...app, CloudPropStatus: status})
        useSettingsStore.setState({cloudBackup: {...DEFAULT_CLOUD_BACKUP, service: 'r2', endpoint: 'abc.r2.cloudflarestorage.com', bucket: 'b'}})

        await showPage()

        const details = screen.getByRole('complementary', {name: 'About Old oak'})

        await waitFor(() => expect(within(details).getByText('Backed up to the cloud')).toBeInTheDocument())

        fireEvent.click(tile('Fern'))

        await waitFor(() => expect(screen.getByText('Changed since the last backup')).toBeInTheDocument())
    })

    it('says nothing about backups when there is no cloud backup', async () => {
        useSettingsStore.setState({cloudBackup: DEFAULT_CLOUD_BACKUP})

        await showPage()

        expect(screen.queryByText('Backup')).toBeNull()
    })
})
