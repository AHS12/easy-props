import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {useEditorStore} from '../store/editor-store'
import {YourPropsPage} from './YourPropsPage'

const documentOf = (name: string, generatorId: string, seed: number) =>
    JSON.stringify({
        schemaVersion: 2,
        generator: 'easy-props',
        createdAt: '2026-10-02T09:00:00.000Z',
        modifiedAt: '2026-11-01T09:00:00.000Z',
        name,
        style: 'low-poly',
        scene: {id: 'scene-1', assets: [{id: 'asset-1', kind: 'tree', generatorId, seed}]},
    })

const files: Record<string, string> = {
    oak: documentOf('Old oak', 'painted-tree', 48213),
    rock: documentOf('Mossy boulder', 'cut-rock', 7),
    fern: documentOf('Fern', 'plant', 3),
}

const app = {
    ListProps: vi.fn(async () => [
        {id: 'oak', savedAt: '2026-11-03T10:00:00Z', size: 2048, hasPicture: true},
        {id: 'rock', savedAt: '2026-11-02T10:00:00Z', size: 1024, hasPicture: true},
        {id: 'fern', savedAt: '2026-11-01T10:00:00Z', size: 512, hasPicture: true},
    ]),
    ReadProp: vi.fn(async (id: string) => [...new TextEncoder().encode(files[id])]),
    ReadPropsIndex: vi.fn(async () => null),
    WritePropsIndex: vi.fn(async () => undefined),
    ShowProp: vi.fn(async () => undefined),
}

const openTree = vi.fn(async () => undefined)

beforeEach(() => {
    window.go = {backend: {App: app as never}}
    useEditorStore.setState({page: 'props', pickedPropId: null, batchPicked: null, batchOpen: false, openTree})
})

afterEach(() => {
    cleanup()
    delete window.go
    openTree.mockClear()
    app.ShowProp.mockClear()
})

const tile = (name: string) => screen.getByRole('button', {name: new RegExp(name)})

describe('Your props', () => {
    it('lists every saved prop, with a count for each kind', async () => {
        render(<YourPropsPage />)

        await waitFor(() => expect(tile('Old oak')).toBeInTheDocument())

        const kinds = screen.getByRole('tablist', {name: 'Kind of prop'})

        expect(within(kinds).getByRole('tab', {name: /All/}).textContent).toContain('3')
        expect(within(kinds).getByRole('tab', {name: /Rock/}).textContent).toContain('1')
        expect(within(kinds).getByRole('tab', {name: /Bush/}).textContent).toContain('1')
    })

    it('shows only the props of the kind picked', async () => {
        render(<YourPropsPage />)
        await waitFor(() => expect(tile('Old oak')).toBeInTheDocument())

        fireEvent.click(screen.getByRole('tab', {name: /Rock/}))

        expect(screen.queryByRole('button', {name: /Old oak/})).toBeNull()
        expect(tile('Mossy boulder')).toBeInTheDocument()
    })

    it('says what the picked prop is beside the list', async () => {
        render(<YourPropsPage />)
        await waitFor(() => expect(tile('Mossy boulder')).toBeInTheDocument())

        fireEvent.click(tile('Mossy boulder'))

        const details = screen.getByRole('complementary', {name: 'About Mossy boulder'})

        expect(within(details).getByText('Rock')).toBeInTheDocument()
        expect(within(details).getByText('7')).toBeInTheDocument()
        expect(within(details).getByText('1 KB')).toBeInTheDocument()
    })

    it('opens the picked prop with Enter', async () => {
        render(<YourPropsPage />)
        await waitFor(() => expect(tile('Fern')).toBeInTheDocument())

        fireEvent.click(tile('Fern'))
        fireEvent.keyDown(tile('Fern'), {key: 'Enter'})

        expect(openTree).toHaveBeenCalledWith('fern')
    })

    it('exports a prop without opening it', async () => {
        render(<YourPropsPage />)
        await waitFor(() => expect(tile('Old oak')).toBeInTheDocument())

        fireEvent.click(tile('Old oak'))
        fireEvent.click(screen.getByRole('button', {name: /Export/}))

        expect(useEditorStore.getState().batchPicked).toEqual({kind: 'saved', id: 'oak', name: 'Old oak'})
        expect(useEditorStore.getState().batchOpen).toBe(true)
        expect(openTree).not.toHaveBeenCalled()
    })

    it('finds a prop by part of its name', async () => {
        render(<YourPropsPage />)
        await waitFor(() => expect(tile('Old oak')).toBeInTheDocument())

        fireEvent.change(screen.getByRole('textbox', {name: 'Search your props'}), {target: {value: 'boul'}})

        expect(screen.queryByRole('button', {name: /Old oak/})).toBeNull()
        expect(tile('Mossy boulder')).toBeInTheDocument()
    })

    it('shows a prop in its folder', async () => {
        render(<YourPropsPage />)
        await waitFor(() => expect(tile('Old oak')).toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', {name: 'Show in folder'}))

        await waitFor(() => expect(app.ShowProp).toHaveBeenCalledWith('oak'))
    })
})
