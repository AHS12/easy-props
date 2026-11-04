import {cleanup, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {cloudBackupDue, cloudMayBeDue, failingTooLong} from '../core/backup/auto'
import {DEFAULT_CLOUD_BACKUP, DEFAULT_FOLDER_BACKUP} from '../core/settings/settings-spec'
import {useBackupAttention, useBackupStore} from './backup-store'
import {useEditorStore} from './editor-store'
import {useSettingsStore} from './settings-store'

const on = {...DEFAULT_CLOUD_BACKUP, service: 'r2', endpoint: 'abc.r2.cloudflarestorage.com', bucket: 'b'}

let fingerprint = 'props-1'
let app: Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
    fingerprint = 'props-1'
    app = {
        LibraryFingerprint: vi.fn(async () => fingerprint),
        BackUpToCloud: vi.fn(async () => ({props: 3, uploaded: 1, changedElsewhere: 0, removed: 0})),
        FolderExists: vi.fn(async () => true),
        BackUpToFile: vi.fn(async () => ({props: 3, bytes: 10})),
        PruneFolderBackups: vi.fn(async () => 0),
        SetBackupDue: vi.fn(async () => undefined),
        StopBackup: vi.fn(async () => undefined),
        WriteSettings: vi.fn(async () => undefined),
    }
    window.go = {backend: {App: app as never}}
    useBackupStore.setState({phase: 'idle', progress: null, cloudProblem: null, folderProblem: null})
    useEditorStore.setState({toast: null})
    useSettingsStore.setState({palettes: [], folderBackup: DEFAULT_FOLDER_BACKUP, cloudBackup: on})
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
    delete window.go
})

describe('when a cloud backup is due', () => {
    it('is due whenever something changed, with no once-a-day limit', () => {
        expect(cloudBackupDue({...on, lastFingerprint: 'a'}, 'b')).toBe(true)
        expect(cloudBackupDue({...on, lastFingerprint: 'a'}, 'a')).toBe(false)
    })

    it('is never due when it is off, or not set up', () => {
        expect(cloudMayBeDue({...on, auto: false})).toBe(false)
        expect(cloudMayBeDue(DEFAULT_CLOUD_BACKUP)).toBe(false)
    })

    it('counts a day of failures as too long, and not less', () => {
        const now = new Date('2026-11-05T10:00:00Z')

        expect(failingTooLong('2026-11-04T09:59:00Z', now)).toBe(true)
        expect(failingTooLong('2026-11-04T10:30:00Z', now)).toBe(false)
        expect(failingTooLong('', now)).toBe(false)
    })
})

describe('backing up to the cloud by itself', () => {
    it('backs up quietly when something changed, and remembers what it backed up', async () => {
        expect(await useBackupStore.getState().runCloudBackup()).toBe('written')

        expect(app.BackUpToCloud).toHaveBeenCalledTimes(1)
        expect(useSettingsStore.getState().cloudBackup.lastFingerprint.startsWith('props-1:')).toBe(true)
        expect(useEditorStore.getState().toast).toBeNull()
    })

    it('asks nothing of the bucket when nothing changed', async () => {
        await useBackupStore.getState().runCloudBackup()

        expect(await useBackupStore.getState().runCloudBackup()).toBe('not-due')
        expect(app.BackUpToCloud).toHaveBeenCalledTimes(1)
    })

    it('backs up again after every change, the same day', async () => {
        await useBackupStore.getState().runCloudBackup()
        fingerprint = 'props-2'

        expect(await useBackupStore.getState().runCloudBackup()).toBe('written')
        expect(app.BackUpToCloud).toHaveBeenCalledTimes(2)
    })

    it('does nothing with Back up automatically off', async () => {
        useSettingsStore.getState().setCloudBackup({auto: false})

        expect(await useBackupStore.getState().runCloudBackup()).toBe('not-due')
        expect(app.LibraryFingerprint).not.toHaveBeenCalled()
    })

    it('keeps quiet about a failure until it has failed for a day, then says so once', async () => {
        app.BackUpToCloud.mockRejectedValue(new Error("easy-props: cloud: couldn't reach the storage"))

        expect(await useBackupStore.getState().runCloudBackup()).toBe('failed')
        expect(useEditorStore.getState().toast).toBeNull()
        expect(useBackupStore.getState().cloudProblem).toContain("couldn't reach abc.r2.cloudflarestorage.com")
        expect(useSettingsStore.getState().cloudBackup.failingSince).not.toBe('')

        useSettingsStore.getState().setCloudBackup({failingSince: '2026-01-01T00:00:00Z'})
        await useBackupStore.getState().runCloudBackup()

        expect(useEditorStore.getState().toast?.message).toMatch(/^Cloud backup hasn't worked for a day\./)
        expect(useEditorStore.getState().toast?.action?.label).toBe('Open backup settings')

        useEditorStore.setState({toast: null})
        await useBackupStore.getState().runCloudBackup()

        expect(useEditorStore.getState().toast).toBeNull()
    })

    it('forgets a run of failures once a backup works', async () => {
        useSettingsStore.getState().setCloudBackup({failingSince: '2026-01-01T00:00:00Z'})

        await useBackupStore.getState().runCloudBackup()

        expect(useSettingsStore.getState().cloudBackup.failingSince).toBe('')
        expect(useBackupStore.getState().cloudProblem).toBeNull()
    })

    it('runs both the folder and the cloud a minute after a run of changes', async () => {
        vi.useFakeTimers()
        useSettingsStore.getState().setFolderBackup({folder: 'D:/Backups'})

        useBackupStore.getState().scheduleBackups()
        await vi.advanceTimersByTimeAsync(30_000)
        useBackupStore.getState().scheduleBackups()
        await vi.advanceTimersByTimeAsync(61_000)

        expect(app.BackUpToFile).toHaveBeenCalledTimes(1)
        expect(app.BackUpToCloud).toHaveBeenCalledTimes(1)
    })

    it('holds the close for a cloud backup only when something changed', async () => {
        await useBackupStore.getState().refreshBackupDue()
        expect(app.SetBackupDue).toHaveBeenLastCalledWith(true)

        await useBackupStore.getState().runCloudBackup()
        await useBackupStore.getState().refreshBackupDue()
        expect(app.SetBackupDue).toHaveBeenLastCalledWith(false)
    })
})

function Attention() {
    const attention = useBackupAttention()

    return <p>{attention ?? 'all well'}</p>
}

describe('a backup that needs attention', () => {
    it('shows for a missing folder straight away', () => {
        useBackupStore.setState({folderProblem: 'The folder is gone.'})
        render(<Attention />)

        expect(screen.getByText('The folder is gone.')).toBeInTheDocument()
    })

    it('shows for the cloud only after a day of failures', async () => {
        useBackupStore.setState({cloudProblem: 'No connection.'})
        useSettingsStore.getState().setCloudBackup({failingSince: new Date().toISOString()})
        render(<Attention />)

        expect(screen.getByText('all well')).toBeInTheDocument()

        useSettingsStore.getState().setCloudBackup({failingSince: '2026-01-01T00:00:00Z'})

        await waitFor(() => expect(screen.getByText('No connection.')).toBeInTheDocument())
    })
})
