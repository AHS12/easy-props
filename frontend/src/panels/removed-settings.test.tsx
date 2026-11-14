import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {useEditorStore} from '../store/editor-store'
import {useUiStore} from '../store/ui-store'
import {SettingsDialog} from './SettingsDialog'
import {fakeDesktop} from '../platform/shell'

const documentOf = (name: string) => JSON.stringify({name, scene: {assets: [{generatorId: 'painted-tree', seed: 1}]}})

/** A bin kept in memory, changed as Go would change it. */
function fakeBin() {
    const bin = new Map<string, string>([
        ['oak', documentOf('Old oak')],
        ['fern', documentOf('Fern')],
    ])
    const saved = new Set<string>()

    return {
        bin,
        saved,
        ListRemovedProps: vi.fn(async () =>
            [...bin.keys()].map((id) => ({id, savedAt: '2026-11-01T10:00:00Z', removedAt: '2026-11-04T09:00:00Z', size: 1, hasPicture: false})),
        ),
        ReadRemovedProp: vi.fn(async (id: string) => [...new TextEncoder().encode(bin.get(id) ?? '')]),
        PutBackProp: vi.fn(async (id: string) => {
            bin.delete(id)
            saved.add(id)
        }),
        ForgetRemovedProp: vi.fn(async (id: string) => void bin.delete(id)),
        ListProps: vi.fn(async () => []),
        ReadPropsIndex: vi.fn(async () => null),
        WritePropsIndex: vi.fn(async () => undefined),
        GetLibraryInfo: vi.fn(async () => ({folder: 'C:/props', props: 0, bytes: 0})),
        ReadSettings: vi.fn(async () => null),
        WriteSettings: vi.fn(async () => undefined),
    }
}

let app: ReturnType<typeof fakeBin>

beforeEach(() => {
    app = fakeBin()
    fakeDesktop(app)
    useEditorStore.setState({removedProps: [], toast: null})
    useUiStore.getState().openSettings('Recently removed')
})

afterEach(() => {
    cleanup()
    useUiStore.getState().closeSettings()
    fakeDesktop()
})

describe('Recently removed in Settings', () => {
    it('lists the props in the bin', async () => {
        render(<SettingsDialog />)

        expect(await screen.findByText('Old oak')).toBeInTheDocument()
        expect(screen.getByText('Fern')).toBeInTheDocument()
    })

    it('puts a prop back', async () => {
        render(<SettingsDialog />)

        fireEvent.click(await screen.findByRole('button', {name: 'Put back Old oak'}))

        await waitFor(() => expect(screen.queryByText('Old oak')).toBeNull())
        expect(app.saved.has('oak')).toBe(true)
    })

    it('asks before removing a prop for good', async () => {
        render(<SettingsDialog />)

        fireEvent.click(await screen.findByRole('button', {name: 'Remove Fern for good'}))

        expect(app.ForgetRemovedProp).not.toHaveBeenCalled()

        fireEvent.click(within(screen.getByRole('group', {name: /Remove “Fern” for good/})).getByRole('button', {name: 'Remove for good'}))

        await waitFor(() => expect(app.ForgetRemovedProp).toHaveBeenCalledWith('fern'))
    })

    it('empties the whole bin after asking', async () => {
        render(<SettingsDialog />)

        fireEvent.click(await screen.findByRole('button', {name: 'Empty the bin'}))
        fireEvent.click(within(screen.getByRole('group', {name: /Remove all 2 props for good/})).getByRole('button', {name: 'Remove for good'}))

        await waitFor(() => expect(screen.getByText('Nothing here.')).toBeInTheDocument())
        expect(app.bin.size).toBe(0)
        expect(app.saved.size).toBe(0)
    })

    it('puts every prop back at once', async () => {
        render(<SettingsDialog />)

        fireEvent.click(await screen.findByRole('button', {name: 'Put all back'}))

        await waitFor(() => expect(app.saved.size).toBe(2))
    })

    it('is reached from the Storage page', async () => {
        useUiStore.getState().openSettings('Storage')
        render(<SettingsDialog />)

        await waitFor(() => expect(screen.getByText(/2 props, kept for 30 days/)).toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', {name: 'Show'}))

        expect(await screen.findByText('Old oak')).toBeInTheDocument()
    })
})
