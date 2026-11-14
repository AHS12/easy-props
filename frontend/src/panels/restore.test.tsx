import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {backupFileName} from '../platform/backup'
import {NEWER_BACKUP, useBackupStore} from '../store/backup-store'
import {useEditorStore} from '../store/editor-store'
import {useSettingsStore} from '../store/settings-store'
import {RestoreDialog} from './RestoreDialog'
import {fakeDesktop} from '../platform/shell'

const propText = (name: string) => JSON.stringify({name, preset: 'oak', scene: {assets: [{generatorId: 'painted-tree', seed: 4}]}})

const held = {
    app: '0.4.0',
    madeAt: '2026-11-01T10:00:00Z',
    palettes: JSON.stringify([{id: 'p1', name: 'Forest', set: 'tree', colours: ['#112233']}]),
    props: [
        {id: 'birch', savedAt: '2026-10-01T10:00:00Z', size: 10, hasPicture: false, status: 'new'},
        {id: 'oak', savedAt: '2026-10-02T10:00:00Z', size: 10, hasPicture: false, status: 'different'},
        {id: 'pine', savedAt: '2026-10-03T10:00:00Z', size: 10, hasPicture: false, status: 'same'},
    ],
}

const names: Record<string, string> = {birch: 'Birch', oak: 'Old oak', pine: 'Pine'}

let app: Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
    app = {
        OpenFileDialog: vi.fn(async () => 'C:/backups/easy-props-backup.zip'),
        SaveFileDialog: vi.fn(async () => 'C:/backups/easy-props-backup.zip'),
        OpenBackupFile: vi.fn(async () => held),
        ReadHeldProp: vi.fn(async (id: string) => [...new TextEncoder().encode(propText(names[id]))]),
        RestoreFromHolding: vi.fn(async (choices: unknown[]) => choices.length),
        ClearHolding: vi.fn(async () => undefined),
        BackUpToFile: vi.fn(async () => ({props: 3, bytes: 100})),
        StopBackup: vi.fn(async () => undefined),
        ListProps: vi.fn(async () => []),
        ReadPropsIndex: vi.fn(async () => null),
        WritePropsIndex: vi.fn(async () => undefined),
        WriteSettings: vi.fn(async () => undefined),
    }
    fakeDesktop(app)
    useBackupStore.setState({phase: 'idle', progress: null, restoring: null})
    useEditorStore.setState({toast: null, gallery: [{name: 'Old oak'} as never]})
    useSettingsStore.setState({palettes: []})
})

afterEach(() => {
    cleanup()
    fakeDesktop()
})

async function openTheBackup() {
    render(<RestoreDialog />)
    await useBackupStore.getState().openRestore()
    await screen.findByRole('dialog')
}

describe('restoring from a backup', () => {
    it('shows new props and props that differ, ticked, and says how many are already here', async () => {
        await openTheBackup()

        const fresh = screen.getByRole('region', {name: 'New to this computer'})
        const different = screen.getByRole('region', {name: 'Different from the one here'})

        expect(within(fresh).getByRole('checkbox', {name: 'Birch'})).toHaveAttribute('aria-checked', 'true')
        expect(within(different).getByRole('checkbox', {name: 'Old oak'})).toHaveAttribute('aria-checked', 'true')
        expect(screen.queryByRole('checkbox', {name: 'Pine'})).toBeNull()
        expect(screen.getByText(/1 prop is already here/)).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Restore 2 props'})).toBeEnabled()
    })

    it('brings in a prop that differs as a renamed second copy, and merges the palettes', async () => {
        await openTheBackup()

        fireEvent.click(screen.getByRole('button', {name: 'Restore 2 props'}))

        await waitFor(() => expect(app.RestoreFromHolding).toHaveBeenCalled())

        const [choices] = app.RestoreFromHolding.mock.calls[0] as [{id: string; copyId: string; copyContents: string}[]]

        expect(choices[0]).toEqual({id: 'birch', copyId: '', copyContents: ''})
        expect(choices[1].id).toBe('oak')
        expect(choices[1].copyId).not.toBe('')
        expect(JSON.parse(choices[1].copyContents).name).toBe('Old oak (from backup)')

        await waitFor(() => expect(useEditorStore.getState().toast?.message).toBe('Restored 2 props and 1 palette'))
        expect(useSettingsStore.getState().palettes.map((palette) => palette.name)).toEqual(['Forest'])
        expect(app.ClearHolding).toHaveBeenCalled()
        expect(useBackupStore.getState().restoring).toBeNull()
    })

    it('leaves out a prop that is unticked', async () => {
        await openTheBackup()

        fireEvent.click(screen.getByRole('checkbox', {name: 'Old oak'}))
        fireEvent.click(screen.getByRole('button', {name: 'Restore 1 prop'}))

        await waitFor(() => expect(app.RestoreFromHolding).toHaveBeenCalledWith([{id: 'birch', copyId: '', copyContents: ''}]))
    })

    it('clears what it unpacked when cancelled', async () => {
        await openTheBackup()

        fireEvent.click(screen.getByRole('button', {name: 'Cancel'}))

        await waitFor(() => expect(app.ClearHolding).toHaveBeenCalled())
        expect(app.RestoreFromHolding).not.toHaveBeenCalled()
        expect(useBackupStore.getState().restoring).toBeNull()
    })

    it('says plainly when a backup comes from a newer app', async () => {
        app.OpenBackupFile.mockRejectedValue(new Error('easy-props: this backup was made by a newer easy-props'))

        await useBackupStore.getState().openRestore()

        expect(useEditorStore.getState().toast?.message).toBe(NEWER_BACKUP)
        expect(useBackupStore.getState().restoring).toBeNull()
    })

    it('does nothing when the person cancels choosing a file', async () => {
        app.OpenFileDialog.mockResolvedValue('')

        await useBackupStore.getState().openRestore()

        expect(app.OpenBackupFile).not.toHaveBeenCalled()
    })
})

describe('backing up to a file', () => {
    it('offers a dated name, sends the palettes, and says how many props it saved', async () => {
        useSettingsStore.setState({palettes: [{id: 'p1', name: 'Forest', set: 'tree', colours: ['#112233']}]})

        await useBackupStore.getState().backUp()

        expect(app.SaveFileDialog).toHaveBeenCalledWith('Back up your props', backupFileName(), ['*.zip'])

        const [path, palettes] = app.BackUpToFile.mock.calls[0] as [string, number[]]

        expect(path).toBe('C:/backups/easy-props-backup.zip')
        expect(JSON.parse(new TextDecoder().decode(new Uint8Array(palettes)))[0].name).toBe('Forest')
        expect(useEditorStore.getState().toast).toMatchObject({message: 'Backed up 3 props', folder: 'C:/backups'})
    })

    it('names the file by the local date', () => {
        expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe('easy-props-backup-2026-01-05.zip')
    })
})
