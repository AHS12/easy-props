/**
 * Backing up to a file, and restoring from one.
 *
 * It lives outside the settings window, as updates do, because a restore can
 * start from an empty Home as well as from Settings, and its screen outlives
 * whatever opened it.
 */

import {create} from 'zustand'
import {APP_VERSION} from '../core/export/export-preferences'
import {summarizeProp, type PropSummary} from '../core/library/prop-summary'
import {mergePalettes, planRestore} from '../core/library/restore-plan'
import {
    backUpToFile,
    chooseBackupSource,
    chooseBackupTarget,
    clearHolding,
    onBackupProgress,
    openBackupFile,
    readHeldProp,
    restoreFromHolding,
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
}

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
    }
})
