import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it} from 'vitest'
import {GODOT_IMPORT_NOTE, saveExportPreferences} from '../core/export/export-preferences'
import {useEditorStore} from '../store/editor-store'
import {BatchExportDialog} from './BatchExportDialog'
import {ExportDialog} from './ExportDialog'

const PREFERENCES = {levels: 3, collision: true, wind: true, folder: ''}

afterEach(() => {
    cleanup()
    localStorage.clear()
    useEditorStore.setState({exportOpen: false, batchOpen: false})
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
