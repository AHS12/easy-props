import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {loadExportPreferences, saveExportPreferences} from '../core/export/export-preferences'
import {useEditorStore} from '../store/editor-store'
import {useUiStore} from '../store/ui-store'
import {ConfirmDialog} from './ConfirmDialog'
import {ExportDialog} from './ExportDialog'

// The question is what's tested here, not the files, so the build is a stand-in.
vi.mock('../core/export/pipeline/package', () => ({
    buildExport: async () => [{name: 'Boulder_LOD0.glb', bytes: new Uint8Array([1]), faces: 10}],
}))

const PREFERENCES = {engine: 'plain', levels: 1, collision: false, wind: false, join: false, far: false, look: 'lit', materials: false, folder: 'C:/Games/props', askBeforeReplacing: true, folderPerProp: false} as const

let existing: string[] = []
const app = {
    ExistingFiles: vi.fn(async () => existing),
    WriteFiles: vi.fn(async () => undefined),
}

async function pressExport() {
    render(
        <>
            <ExportDialog />
            <ConfirmDialog />
        </>,
    )
    act(() => useEditorStore.setState({exportOpen: true}))

    const button = await screen.findByRole('button', {name: 'Export'})

    await waitFor(() => expect(button).not.toBeDisabled(), {timeout: 5000})
    fireEvent.click(button)
}

beforeEach(() => {
    window.go = {backend: {App: app as never}}
    saveExportPreferences(PREFERENCES)
    useEditorStore.getState().startNewProp('boulder')
    existing = []
    app.ExistingFiles.mockClear()
    app.WriteFiles.mockClear()
})

afterEach(() => {
    cleanup()
    localStorage.clear()
    delete window.go
    useUiStore.setState({confirm: null})
    useEditorStore.setState({exportOpen: false})
})

describe('exporting over files already there', () => {
    it('asks first, and writes nothing until told to', async () => {
        existing = ['Boulder_LOD0.glb']
        await pressExport()

        expect(await screen.findByText('Replace the files for "Boulder"?')).toBeInTheDocument()
        expect(screen.getByText('This folder already has 1 of them. Your game may be using these.')).toBeInTheDocument()
        expect(app.WriteFiles).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', {name: 'Replace files'}))

        await waitFor(() => expect(app.WriteFiles).toHaveBeenCalledOnce())
    })

    it('keeps them when asked to', async () => {
        existing = ['Boulder_LOD0.glb']
        await pressExport()

        fireEvent.click(await screen.findByRole('button', {name: 'Keep them'}))

        expect(useUiStore.getState().confirm).toBeNull()
        expect(app.WriteFiles).not.toHaveBeenCalled()
    })

    it('writes straight away when nothing is there yet', async () => {
        await pressExport()

        await waitFor(() => expect(app.WriteFiles).toHaveBeenCalledOnce())
        expect(useUiStore.getState().confirm).toBeNull()
    })

    it("stops asking only once Don't ask again is ticked and the files are replaced", async () => {
        existing = ['Boulder_LOD0.glb']
        await pressExport()

        fireEvent.click(await screen.findByRole('checkbox', {name: "Don't ask again"}))
        fireEvent.click(screen.getByRole('button', {name: 'Replace files'}))

        await waitFor(() => expect(app.WriteFiles).toHaveBeenCalledOnce())
        expect(loadExportPreferences().askBeforeReplacing).toBe(false)
    })

    it("keeps asking when Don't ask again is ticked but the files are kept", async () => {
        existing = ['Boulder_LOD0.glb']
        await pressExport()

        fireEvent.click(await screen.findByRole('checkbox', {name: "Don't ask again"}))
        fireEvent.click(screen.getByRole('button', {name: 'Keep them'}))

        expect(loadExportPreferences().askBeforeReplacing).toBe(true)
    })

    it('does not look for files once asking is turned off', async () => {
        existing = ['Boulder_LOD0.glb']
        saveExportPreferences({...PREFERENCES, askBeforeReplacing: false})
        await pressExport()

        await waitFor(() => expect(app.WriteFiles).toHaveBeenCalledOnce())
        expect(app.ExistingFiles).not.toHaveBeenCalled()
    })
})
