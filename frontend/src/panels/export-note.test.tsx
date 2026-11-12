import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it} from 'vitest'
import {GODOT_IMPORT_NOTE, loadExportPreferences, saveExportPreferences} from '../core/export/export-preferences'
import {useEditorStore} from '../store/editor-store'
import {BatchExportDialog} from './BatchExportDialog'
import {ExportDialog} from './ExportDialog'

const PREFERENCES = {levels: 3, collision: true, wind: true, join: false, far: false, look: 'lit' as const, materials: false, folder: '', askBeforeReplacing: true, folderPerProp: false, pictureSize: 512 as const}

afterEach(() => {
    cleanup()
    localStorage.clear()
    useEditorStore.setState({exportOpen: false, batchOpen: false})
})

describe('the Join parts choice', () => {
    it('is off at first and remembered once changed', () => {
        expect(loadExportPreferences().join).toBe(false)

        saveExportPreferences({...PREFERENCES, engine: 'plain', join: true})

        expect(loadExportPreferences().join).toBe(true)
    })

    it('can be changed in the Export dialog for every engine', () => {
        useEditorStore.setState({exportOpen: true})

        for (const engine of ['plain', 'godot', 'unreal'] as const) {
            saveExportPreferences({...PREFERENCES, engine})

            const dialog = render(<ExportDialog />)

            expect(screen.getByRole('switch', {name: 'Join parts'})).toBeInTheDocument()
            dialog.unmount()
        }
    })
})

describe('the Godot import note', () => {
    it.each([
        ['Export', ExportDialog, {exportOpen: true}],
        ['Export many', BatchExportDialog, {batchOpen: true}],
    ] as const)('shows in %s only for Godot', async (_, Dialog, open) => {
        saveExportPreferences({...PREFERENCES, engine: 'godot'})
        useEditorStore.setState(open)

        const godot = render(<Dialog />)

        expect(screen.getByText(GODOT_IMPORT_NOTE)).toBeInTheDocument()
        godot.unmount()

        saveExportPreferences({...PREFERENCES, engine: 'unreal'})
        render(<Dialog />)

        expect(screen.queryByText(GODOT_IMPORT_NOTE)).not.toBeInTheDocument()
    })
})
