import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {loadExportPreferences, saveExportPreferences} from '../core/export/export-preferences'
import {folderNameOf} from '../core/export/pipeline/types'
import {useEditorStore} from '../store/editor-store'
import {BatchExportDialog} from './BatchExportDialog'
import {fakeDesktop} from '../platform/shell'

// Writing a real file needs a canvas for the textures, which tests don't have.
vi.mock('../core/export/glb-exporter', () => ({
    writeGLB: async () => new ArrayBuffer(8),
}))

const app = {
    WriteFiles: vi.fn(async () => undefined),
    ChooseFolder: vi.fn(async () => 'C:/Games/kits'),
    ListTrees: vi.fn(async () => []),
}

beforeEach(() => {
    fakeDesktop(app)
    saveExportPreferences({...loadExportPreferences(), engine: 'plain', levels: 1, folder: 'C:/Games/props', folderPerProp: false})
    useEditorStore.setState({batch: null, batchOpen: true, batchPicked: null, gallery: []})
})

afterEach(() => {
    cleanup()
    fakeDesktop()
    app.WriteFiles.mockClear()
    useEditorStore.setState({batch: null, batchOpen: false})
})

/** Ticks one rock and starts the batch, then waits for it to finish. */
async function exportOneRock() {
    fireEvent.click(screen.getByRole('checkbox', {name: 'Boulder'}))
    fireEvent.click(screen.getByRole('button', {name: 'Export 1 prop'}))

    await waitFor(() => expect(useEditorStore.getState().batch?.summary).toBeTruthy(), {timeout: 10000})
}

const foldersWritten = () => (app.WriteFiles.mock.calls as unknown as [string][]).map(([folder]) => folder)

describe('Export many', () => {
    it('has every choice one export has', () => {
        render(<BatchExportDialog />)

        for (const name of ['Engine', 'Detail levels (LOD)', 'Collision', 'Wind data', 'Join parts', 'Folder', 'Subfolder', 'A folder for each prop']) {
            expect(screen.getAllByLabelText(name).length).toBeGreaterThan(0)
        }
    })

    it('writes straight into the chosen folder by default', async () => {
        render(<BatchExportDialog />)
        await exportOneRock()

        expect(foldersWritten()).toEqual(['C:/Games/props'])
    }, 20000)

    it('puts the whole batch in a subfolder', async () => {
        render(<BatchExportDialog />)
        fireEvent.change(screen.getByRole('textbox', {name: 'Subfolder'}), {target: {value: 'Forest pack'}})
        expect(screen.getByText(/Files go in C:\/Games\/props\/Forest pack\./)).toBeInTheDocument()
        await exportOneRock()

        expect(foldersWritten()).toEqual(['C:/Games/props/Forest pack'])
        // Show the files opens where they went.
        expect(useEditorStore.getState().batch?.folder).toBe('C:/Games/props/Forest pack')
    }, 20000)

    it('can give each prop a folder of its own, as one export does', async () => {
        render(<BatchExportDialog />)
        fireEvent.change(screen.getByRole('textbox', {name: 'Subfolder'}), {target: {value: 'Rocks'}})
        fireEvent.click(screen.getByRole('switch', {name: 'A folder for each prop'}))
        await exportOneRock()

        expect(foldersWritten()).toEqual(['C:/Games/props/Rocks/boulder_01'])
        expect(loadExportPreferences().folderPerProp).toBe(true)
    }, 20000)

    it('uses the detail levels chosen here', async () => {
        saveExportPreferences({...loadExportPreferences(), levels: 2, collision: false})
        render(<BatchExportDialog />)
        await exportOneRock()

        const files = (app.WriteFiles.mock.calls as unknown as [string, {name: string}[]][])[0][1].map((file) => file.name)

        expect(files.filter((name) => name.endsWith('.glb'))).toEqual(['boulder_01_LOD0.glb', 'boulder_01_LOD1.glb'])
    }, 20000)
})

describe('a subfolder name', () => {
    it('keeps what people typed, minus what no file system allows', () => {
        expect(folderNameOf('  Forest   pack ')).toBe('Forest pack')
        expect(folderNameOf('Rocks: big/small?')).toBe('Rocks bigsmall')
        expect(folderNameOf('Trees...')).toBe('Trees')
        expect(folderNameOf('..')).toBe('')
        expect(folderNameOf('')).toBe('')
    })
})
