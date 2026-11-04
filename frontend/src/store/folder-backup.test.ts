import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {localDay} from '../core/backup/auto'
import {DEFAULT_FOLDER_BACKUP} from '../core/settings/settings-spec'
import {backupFileName} from '../platform/backup'
import {folderMissing, useBackupStore} from './backup-store'
import {useEditorStore} from './editor-store'
import {useSettingsStore} from './settings-store'

let fingerprint = 'props-1'
let app: Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
    fingerprint = 'props-1'
    app = {
        LibraryFingerprint: vi.fn(async () => fingerprint),
        FolderExists: vi.fn(async () => true),
        BackUpToFile: vi.fn(async () => ({props: 3, bytes: 100})),
        PruneFolderBackups: vi.fn(async () => 0),
        SetBackupDue: vi.fn(async () => undefined),
        StopBackup: vi.fn(async () => undefined),
        WriteSettings: vi.fn(async () => undefined),
    }
    window.go = {backend: {App: app as never}}
    useBackupStore.setState({phase: 'idle', progress: null, folderProblem: null})
    useEditorStore.setState({toast: null})
    useSettingsStore.setState({palettes: [], folderBackup: {...DEFAULT_FOLDER_BACKUP, folder: 'D:\\Backups', keep: 5}})
})

afterEach(() => {
    vi.useRealTimers()
    delete window.go
})

describe('backing up to a folder by itself', () => {
    it('writes a dated backup, keeps only the newest, and remembers the day', async () => {
        expect(await useBackupStore.getState().runFolderBackup()).toBe('written')

        expect(app.BackUpToFile).toHaveBeenCalledWith(`D:\\Backups\\${backupFileName()}`, expect.any(Array), expect.any(String))
        expect(app.PruneFolderBackups).toHaveBeenCalledWith('D:\\Backups', 5)
        expect(useSettingsStore.getState().folderBackup.lastDay).toBe(localDay(new Date()))
        // Written today, so closing no longer needs to wait for one.
        expect(app.SetBackupDue).toHaveBeenLastCalledWith(false)
    })

    it('writes at most one backup a day, even after more changes', async () => {
        await useBackupStore.getState().runFolderBackup()
        fingerprint = 'props-2'

        expect(await useBackupStore.getState().runFolderBackup()).toBe('not-due')
        expect(app.BackUpToFile).toHaveBeenCalledTimes(1)
    })

    it('does nothing when nothing changed since the last backup', async () => {
        await useBackupStore.getState().runFolderBackup()
        useSettingsStore.getState().setFolderBackup({lastDay: '2026-01-01'})

        expect(await useBackupStore.getState().runFolderBackup()).toBe('not-due')
        expect(app.BackUpToFile).toHaveBeenCalledTimes(1)
    })

    it('counts a changed palette as something to back up', async () => {
        await useBackupStore.getState().runFolderBackup()
        useSettingsStore.getState().setFolderBackup({lastDay: '2026-01-01'})
        useSettingsStore.setState({palettes: [{id: 'p', name: 'Forest', set: 'tree', colours: ['#112233']}]})

        expect(await useBackupStore.getState().runFolderBackup()).toBe('written')
    })

    it('says once when the folder is missing, and keeps saying so in Settings', async () => {
        app.FolderExists.mockResolvedValue(false)

        expect(await useBackupStore.getState().runFolderBackup()).toBe('missing')
        expect(useEditorStore.getState().toast?.message).toBe(folderMissing('D:\\Backups'))

        useEditorStore.setState({toast: null})
        await useBackupStore.getState().runFolderBackup()

        expect(useEditorStore.getState().toast).toBeNull()
        expect(useBackupStore.getState().folderProblem).toBe(folderMissing('D:\\Backups'))
        expect(app.BackUpToFile).not.toHaveBeenCalled()
    })

    it('makes one backup a minute after a run of changes', async () => {
        vi.useFakeTimers()

        for (let save = 0; save < 5; save++) {
            useBackupStore.getState().scheduleFolderBackup()
            await vi.advanceTimersByTimeAsync(20_000)
        }

        expect(app.BackUpToFile).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(60_000)

        expect(app.BackUpToFile).toHaveBeenCalledTimes(1)
    })

    it('waits at most ten seconds for a backup before closing', async () => {
        vi.useFakeTimers()
        app.BackUpToFile.mockReturnValue(new Promise(() => undefined))

        let closed = false
        void useBackupStore
            .getState()
            .backUpBeforeClosing()
            .then(() => {
                closed = true
            })

        await vi.advanceTimersByTimeAsync(9_000)
        expect(closed).toBe(false)

        await vi.advanceTimersByTimeAsync(1_500)
        expect(closed).toBe(true)
    })

    it('closes at once when nothing is due', async () => {
        useSettingsStore.getState().setFolderBackup({lastDay: localDay(new Date())})

        await useBackupStore.getState().backUpBeforeClosing()

        expect(app.LibraryFingerprint).not.toHaveBeenCalled()
    })

    it('never runs with no folder chosen', async () => {
        useSettingsStore.getState().setFolderBackup({folder: ''})

        expect(await useBackupStore.getState().runFolderBackup()).toBe('not-due')
        expect(app.LibraryFingerprint).not.toHaveBeenCalled()
    })
})
