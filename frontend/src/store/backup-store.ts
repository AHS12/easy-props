/**
 * Backing up to a file, and restoring from one.
 *
 * It lives outside the settings window, as updates do, because a restore can
 * start from an empty Home as well as from Settings, and its screen outlives
 * whatever opened it.
 */

import {create} from 'zustand'
import {
    AUTO_BACKUP_DELAY_MS,
    CLOSE_WAIT_MS,
    folderBackupDue,
    localDay,
    mayBeDue,
    palettesFingerprint,
    pathInFolder,
} from '../core/backup/auto'
import {APP_VERSION} from '../core/export/export-preferences'
import {summarizeProp, type PropSummary} from '../core/library/prop-summary'
import {mergePalettes, planRestore} from '../core/library/restore-plan'
import {
    backUpToFile,
    backupFileName,
    canBackUp,
    chooseBackupFolder,
    chooseBackupSource,
    chooseBackupTarget,
    clearHolding,
    folderExists,
    libraryFingerprint,
    onBackupProgress,
    openBackupFile,
    readHeldProp,
    pruneFolderBackups,
    restoreFromHolding,
    setBackupDue,
    stopBackup,
    type HeldBackup,
    type HeldProp,
} from '../platform/backup'
import {newTreeId} from '../platform/library'
import {useEditorStore} from './editor-store'
import {useSettingsStore} from './settings-store'

export type BackupPhase = 'idle' | 'backing-up' | 'opening' | 'restoring'

/** A prop in the backup with what it is, read from its file. */
export interface HeldPropView extends HeldProp, PropSummary {}

export interface OpenRestore {
    readonly backup: HeldBackup
    readonly props: readonly HeldPropView[]
}

export interface BackupStore {
    readonly phase: BackupPhase
    /** Files done of how many, while something is under way. */
    readonly progress: {readonly done: number; readonly total: number} | null
    /** A backup unpacked and waiting for the person to choose. */
    readonly restoring: OpenRestore | null
    backUp(): Promise<void>
    /** Asks for a backup and shows what's in it. */
    openRestore(): Promise<void>
    /** Brings in the ticked props, and the backup's palettes. */
    restore(ticked: ReadonlySet<string>): Promise<void>
    cancelRestore(): Promise<void>
    stop(): void

    /** What went wrong with the last folder backup, or null when all's well. */
    readonly folderProblem: string | null
    /** Writes today's backup to the folder, if one is due. Says what happened. */
    runFolderBackup(): Promise<FolderBackupResult>
    /** Waits a minute after the last change, then backs up if it's due. */
    scheduleFolderBackup(): void
    /** Tells the close guard whether closing should come to us first. */
    refreshBackupDue(): void
    /** Backs up if due before the window closes, giving up after ten seconds. */
    backUpBeforeClosing(): Promise<void>
    chooseFolder(): Promise<void>
    turnOffFolderBackup(): void
}

export type FolderBackupResult = 'written' | 'not-due' | 'missing' | 'failed'

export const NEWER_BACKUP = 'This backup was made by a newer easy-props. Update the app, then try again.'
export const NOT_A_BACKUP = "That file isn't an easy-props backup. Pick a .zip made with Back up to a file."
export const BACKUP_STOPPED = 'Stopped. Nothing was changed.'

/** Go's error, in words a person can act on. */
function describeBackupFailure(error: unknown, doing: 'back up' | 'open' | 'restore'): string {
    const detail = error instanceof Error ? error.message : String(error)

    if (detail.includes('newer easy-props')) {
        return NEWER_BACKUP
    }

    if (detail.includes('not an easy-props backup')) {
        return NOT_A_BACKUP
    }

    if (detail.includes('was stopped')) {
        return BACKUP_STOPPED
    }

    return doing === 'back up'
        ? `Couldn't make the backup. Check there's room on the drive and that you can save there. ${detail}`
        : `Couldn't ${doing} the backup. ${detail}`
}

/** The folder a file is in, for Show the files. */
const folderOf = (path: string): string => path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')))

const propsLabel = (count: number) => (count === 1 ? '1 prop' : `${count} props`)

const newPaletteId = () => `palette-${newTreeId()}`

/** The minute's wait after a change, restarted by every change. */
let folderBackupTimer: ReturnType<typeof setTimeout> | undefined

/** A missing folder is said once a session, not on every save. */
let toldFolderMissing = false

export const folderMissing = (folder: string) =>
    `Couldn't back up to ${folder}: the folder isn't there. Plug the drive in, or choose another folder in Settings, Backup.`

export const useBackupStore = create<BackupStore>((set, get) => {
    /** Runs one long job, showing its progress, and always ends idle. */
    async function underWay<T>(phase: BackupPhase, job: () => Promise<T>): Promise<T> {
        set({phase, progress: null})

        const unwatch = onBackupProgress((done, total) => set({progress: {done, total}}))

        try {
            return await job()
        } finally {
            unwatch()
            set({phase: 'idle', progress: null})
        }
    }

    const notify = (message: string, folder?: string) => useEditorStore.getState().notify(message, folder)

    return {
        phase: 'idle',
        progress: null,
        restoring: null,

        backUp: async () => {
            if (get().phase !== 'idle') {
                return
            }

            try {
                const target = await chooseBackupTarget()

                if (!target) {
                    return
                }

                const palettes = JSON.stringify(useSettingsStore.getState().palettes)
                const summary = await underWay('backing-up', () => backUpToFile(target, palettes, APP_VERSION))

                notify(`Backed up ${propsLabel(summary.props)}`, folderOf(target))
            } catch (error) {
                notify(describeBackupFailure(error, 'back up'))
            }
        },

        openRestore: async () => {
            if (get().phase !== 'idle') {
                return
            }

            try {
                const source = await chooseBackupSource()

                if (!source) {
                    return
                }

                const restoring = await underWay('opening', async (): Promise<OpenRestore> => {
                    const backup = await openBackupFile(source)
                    const props = await Promise.all(
                        backup.props.map(async (prop) => ({...summarizeProp(await readHeldProp(prop.id).catch(() => '')), ...prop})),
                    )

                    return {backup, props}
                })

                set({restoring})
            } catch (error) {
                await clearHolding().catch(() => undefined)
                notify(describeBackupFailure(error, 'open'))
            }
        },

        restore: async (ticked) => {
            const open = get().restoring

            if (!open || get().phase !== 'idle') {
                return
            }

            const editor = useEditorStore.getState()
            const texts = new Map<string, string>()

            try {
                // Only props coming in as a second copy need their text, to be renamed.
                for (const prop of open.props) {
                    if (ticked.has(prop.id) && prop.status === 'different') {
                        texts.set(prop.id, await readHeldProp(prop.id))
                    }
                }

                const choices = planRestore(
                    open.props,
                    ticked,
                    editor.gallery.map((tree) => tree.name),
                    (id) => texts.get(id) ?? '{}',
                    newTreeId,
                )
                const restored = await underWay('restoring', () => restoreFromHolding(choices))

                const settings = useSettingsStore.getState()
                const {palettes, added} = mergePalettes(settings.palettes, open.backup.palettes, newPaletteId)

                if (added > 0) {
                    settings.setPalettes(palettes)
                }

                set({restoring: null})
                await clearHolding()
                await editor.refreshGallery()

                notify(
                    restored === 0 && added === 0
                        ? 'Everything in that backup is already here.'
                        : `Restored ${propsLabel(restored)}${added > 0 ? ` and ${added === 1 ? '1 palette' : `${added} palettes`}` : ''}`,
                )
            } catch (error) {
                notify(describeBackupFailure(error, 'restore'))
                await editor.refreshGallery()
            }
        },

        cancelRestore: async () => {
            set({restoring: null})
            await clearHolding().catch(() => undefined)
        },

        stop: () => void stopBackup(),

        folderProblem: null,

        runFolderBackup: async () => {
            const settings = useSettingsStore.getState()
            const backup = settings.folderBackup
            const today = localDay(new Date())

            // A backup or restore under way already has the files; this one waits for the next chance.
            if (!canBackUp() || !mayBeDue(backup, today) || get().phase !== 'idle') {
                return 'not-due'
            }

            try {
                const fingerprint = `${await libraryFingerprint()}:${palettesFingerprint(settings.palettes)}`

                if (!folderBackupDue(backup, fingerprint, today)) {
                    return 'not-due'
                }

                if (!(await folderExists(backup.folder))) {
                    const problem = folderMissing(backup.folder)

                    set({folderProblem: problem})

                    if (!toldFolderMissing) {
                        toldFolderMissing = true
                        notify(problem)
                    }

                    return 'missing'
                }

                await underWay('backing-up', () =>
                    backUpToFile(pathInFolder(backup.folder, backupFileName()), JSON.stringify(settings.palettes), APP_VERSION),
                )
                await pruneFolderBackups(backup.folder, backup.keep).catch(() => 0)

                useSettingsStore.getState().setFolderBackup({lastDay: today, lastFingerprint: fingerprint, lastAt: new Date().toISOString()})
                set({folderProblem: null})
                get().refreshBackupDue()

                return 'written'
            } catch (error) {
                set({folderProblem: describeBackupFailure(error, 'back up')})

                return 'failed'
            }
        },

        scheduleFolderBackup: () => {
            if (!useSettingsStore.getState().folderBackup.folder) {
                return
            }

            // The day may have turned since the last check, with the app left open.
            get().refreshBackupDue()

            clearTimeout(folderBackupTimer)
            folderBackupTimer = setTimeout(() => void get().runFolderBackup(), AUTO_BACKUP_DELAY_MS)
        },

        refreshBackupDue: () => {
            void setBackupDue(mayBeDue(useSettingsStore.getState().folderBackup, localDay(new Date()))).catch(() => undefined)
        },

        backUpBeforeClosing: async () => {
            clearTimeout(folderBackupTimer)

            await Promise.race([get().runFolderBackup(), new Promise((resolve) => setTimeout(resolve, CLOSE_WAIT_MS))])
        },

        chooseFolder: async () => {
            const settings = useSettingsStore.getState()
            const folder = await chooseBackupFolder(settings.folderBackup.folder)

            if (!folder) {
                return
            }

            // A new folder starts afresh, so its first backup is made straight away.
            settings.setFolderBackup({folder, lastDay: '', lastFingerprint: '', lastAt: ''})
            toldFolderMissing = false
            set({folderProblem: null})
            get().refreshBackupDue()
            await get().runFolderBackup()
        },

        turnOffFolderBackup: () => {
            clearTimeout(folderBackupTimer)
            useSettingsStore.getState().setFolderBackup({folder: ''})
            set({folderProblem: null})
            get().refreshBackupDue()
        },
    }
})
