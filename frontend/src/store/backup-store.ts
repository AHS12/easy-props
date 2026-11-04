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
    cloudBackupDue,
    cloudMayBeDue,
    failingTooLong,
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
    backUpToCloud,
    checkCloudBackup,
    forgetCloudKeys,
    openBackupFile,
    openCloudBackup,
    saveCloudKeys,
    readHeldProp,
    pruneFolderBackups,
    restoreFromHolding,
    setBackupDue,
    stopBackup,
    type CloudTarget,
    type HeldBackup,
    type HeldProp,
} from '../platform/backup'
import {newTreeId} from '../platform/library'
import {useEditorStore} from './editor-store'
import type {CloudBackupSettings} from '../core/settings/settings-spec'
import {useSettingsStore} from './settings-store'
import {useUiStore} from './ui-store'

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
    /** Waits a minute after the last change, then makes whichever backups are due. */
    scheduleBackups(): void
    /** Makes whichever automatic backups are due now: the folder's, then the cloud's. */
    runAutoBackups(): Promise<void>
    /** Backs up to the cloud by itself, if it's on and something changed. Quiet unless it keeps failing. */
    runCloudBackup(): Promise<'written' | 'not-due' | 'failed'>
    /** Tells the close guard whether closing should come to us first. */
    refreshBackupDue(): Promise<void>
    /** Backs up if due before the window closes, giving up after ten seconds. */
    backUpBeforeClosing(): Promise<void>
    chooseFolder(): Promise<void>
    turnOffFolderBackup(): void

    /** The cloud setup form is open. */
    readonly cloudSetupOpen: boolean
    openCloudSetup(): void
    closeCloudSetup(): void
    /**
     * Saves the keys, then checks the connection with exactly what's in the
     * form. Null when it worked, or what went wrong in plain words.
     */
    checkCloud(target: CloudTarget, accessKey: string, secretKey: string): Promise<string | null>
    /** Keeps the form's target as the place cloud backups go. */
    saveCloudSetup(target: CloudTarget): void
    /** What went wrong with the last cloud backup, or null when all's well. */
    readonly cloudProblem: string | null
    backUpToCloudNow(): Promise<void>
    /** Downloads the cloud backup and shows what's in it. */
    openCloudRestore(): Promise<void>
    /** Stops backing up to the cloud and removes the keys from the keychain. Nothing in the bucket is touched. */
    turnOffCloud(): Promise<void>
    setCloudAuto(auto: boolean): void
}

export type FolderBackupResult = 'written' | 'not-due' | 'missing' | 'failed'

export const NEWER_BACKUP = 'This backup was made by a newer easy-props. Update the app, then try again.'
export const CLOUD_WRONG_KEYS = "The storage didn't accept these keys. Check the access key and secret key, and that they're for this bucket."
export const CLOUD_NO_WRITE = 'These keys can read but not write. easy-props needs to read, write and list in this bucket.'
export const CLOUD_REDIRECTED =
    'That address sends easy-props somewhere else. Use only the storage address, such as <account>.r2.cloudflarestorage.com, without the bucket name or a path.'
export const CLOUD_NO_KEYS = 'No keys are saved for cloud backup. Open Set up in Settings, Backup, and enter them again.'

/** What went wrong talking to the storage, in words a person can act on. Null for anything else. */
export function describeCloudFailure(error: unknown, target: {bucket: string; endpoint: string}): string | null {
    const detail = error instanceof Error ? error.message : String(error)

    if (detail.includes("didn't accept these keys")) {
        return CLOUD_WRONG_KEYS
    }

    if (detail.includes("these keys can't write")) {
        return CLOUD_NO_WRITE
    }

    if (detail.includes('there is no such bucket')) {
        return `There's no bucket called ${target.bucket} at this address. Check the name, or create it on the service's site first.`
    }

    if (detail.includes("couldn't reach the storage")) {
        return `easy-props couldn't reach ${target.endpoint || 'Amazon S3'}. Check the address and your internet connection.`
    }

    if (detail.includes('leads somewhere else')) {
        return CLOUD_REDIRECTED
    }

    if (detail.includes('no keys are saved')) {
        return CLOUD_NO_KEYS
    }

    if (detail.includes("isn't a storage address")) {
        return 'That address has something extra in it. Use only the storage address, without https:// or a path.'
    }

    return null
}
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

/**
 * A backup that needs the person: a missing folder straight away, and the
 * cloud once it has failed for a day. Null while all's well. It puts a dot on
 * Settings, so nobody has to open it to find out.
 */
export function useBackupAttention(): string | null {
    const folderProblem = useBackupStore((state) => state.folderProblem)
    const cloudProblem = useBackupStore((state) => state.cloudProblem)
    const failingSince = useSettingsStore((state) => state.cloudBackup.failingSince)

    return folderProblem ?? (cloudProblem && failingTooLong(failingSince, new Date()) ? cloudProblem : null)
}

/** Where cloud backups go, from the settings: everything but when it last ran. */
export function cloudTargetOf(cloud: CloudBackupSettings): CloudTarget {
    return {
        service: cloud.service,
        endpoint: cloud.endpoint,
        region: cloud.region,
        bucket: cloud.bucket,
        folder: cloud.folder,
        pathStyle: cloud.pathStyle,
    }
}

const targetOf = (cloud: CloudBackupSettings) => JSON.stringify(cloudTargetOf(cloud))

/** "Backed up 23 props", and anything left as it was. */
export function cloudSummaryMessage(summary: {props: number; changedElsewhere: number}): string {
    const elsewhere =
        summary.changedElsewhere === 0
            ? ''
            : summary.changedElsewhere === 1
              ? '. 1 prop was changed on another computer and was left as it is there'
              : `. ${summary.changedElsewhere} props were changed on another computer and were left as they are there`

    return `Backed up ${propsLabel(summary.props)} to the cloud${elsewhere}`
}

/** The minute's wait after a change, restarted by every change. */
let backupTimer: ReturnType<typeof setTimeout> | undefined

/** A cloud backup failing for a day is said once a session, not after every save. */
let toldCloudFailing = false

/** What the saved props and palettes are now, to tell whether anything changed since a backup. */
async function currentFingerprint(): Promise<string> {
    return `${await libraryFingerprint()}:${palettesFingerprint(useSettingsStore.getState().palettes)}`
}

/** A missing folder is said once a session, not on every save. */
let toldFolderMissing = false

export const folderMissing = (folder: string) =>
    `Couldn't back up to ${folder}: the folder isn't there. Plug the drive in, or choose another folder in Settings, Backup.`

export const useBackupStore = create<BackupStore>((set, get) => {
    /** Runs one long job, showing its progress, and always ends idle. */
    /** Opens a backup into the holding folder, reads what each prop is, and shows the restore screen. */
    async function openHeld(load: () => Promise<HeldBackup>): Promise<OpenRestore> {
        return underWay('opening', async (): Promise<OpenRestore> => {
            const backup = await load()
            const props = await Promise.all(
                backup.props.map(async (prop) => ({...summarizeProp(await readHeldProp(prop.id).catch(() => '')), ...prop})),
            )

            return {backup, props}
        })
    }

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

                set({restoring: await openHeld(() => openBackupFile(source))})
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
                const fingerprint = await currentFingerprint()

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
                void get().refreshBackupDue()

                return 'written'
            } catch (error) {
                set({folderProblem: describeBackupFailure(error, 'back up')})

                return 'failed'
            }
        },

        scheduleBackups: () => {
            const {folderBackup, cloudBackup} = useSettingsStore.getState()

            if (!folderBackup.folder && !cloudMayBeDue(cloudBackup)) {
                return
            }

            // The day may have turned since the last check, with the app left open.
            void get().refreshBackupDue()

            clearTimeout(backupTimer)
            backupTimer = setTimeout(() => void get().runAutoBackups(), AUTO_BACKUP_DELAY_MS)
        },

        runAutoBackups: async () => {
            await get().runFolderBackup()
            await get().runCloudBackup()
        },

        runCloudBackup: async () => {
            const cloud = useSettingsStore.getState().cloudBackup

            if (!canBackUp() || !cloudMayBeDue(cloud) || get().phase !== 'idle') {
                return 'not-due'
            }

            const target = cloudTargetOf(cloud)

            try {
                // Asking Go what changed costs nothing; asking the bucket costs a connection.
                const fingerprint = await currentFingerprint()

                if (!cloudBackupDue(cloud, fingerprint)) {
                    return 'not-due'
                }

                await underWay('backing-up', () =>
                    backUpToCloud(target, JSON.stringify(useSettingsStore.getState().palettes), APP_VERSION),
                )

                useSettingsStore.getState().setCloudBackup({lastAt: new Date().toISOString(), lastFingerprint: fingerprint, failingSince: ''})
                toldCloudFailing = false
                set({cloudProblem: null})
                void get().refreshBackupDue()

                return 'written'
            } catch (error) {
                const message = describeCloudFailure(error, target) ?? describeBackupFailure(error, 'back up')
                const failingSince = useSettingsStore.getState().cloudBackup.failingSince || new Date().toISOString()

                useSettingsStore.getState().setCloudBackup({failingSince})
                set({cloudProblem: message})

                // A dropped connection fixes itself; only a day of failures is worth interrupting for.
                if (failingTooLong(failingSince, new Date()) && !toldCloudFailing) {
                    toldCloudFailing = true
                    useEditorStore.getState().notify(`Cloud backup hasn't worked for a day. ${message}`, undefined, {
                        label: 'Open backup settings',
                        run: () => useUiStore.getState().openSettings('Backup'),
                    })
                }

                return 'failed'
            }
        },

        refreshBackupDue: async () => {
            const {folderBackup, cloudBackup} = useSettingsStore.getState()
            let due = mayBeDue(folderBackup, localDay(new Date()))

            if (!due && cloudMayBeDue(cloudBackup)) {
                due = await currentFingerprint().then(
                    (fingerprint) => cloudBackupDue(cloudBackup, fingerprint),
                    () => false,
                )
            }

            await setBackupDue(due).catch(() => undefined)
        },

        backUpBeforeClosing: async () => {
            clearTimeout(backupTimer)

            await Promise.race([get().runAutoBackups(), new Promise((resolve) => setTimeout(resolve, CLOSE_WAIT_MS))])
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
            void get().refreshBackupDue()
            await get().runFolderBackup()
        },

        cloudSetupOpen: false,
        openCloudSetup: () => set({cloudSetupOpen: true}),
        closeCloudSetup: () => set({cloudSetupOpen: false}),

        checkCloud: async (target, accessKey, secretKey) => {
            try {
                await saveCloudKeys(accessKey.trim(), secretKey.trim())
                await checkCloudBackup(target)

                return null
            } catch (error) {
                return describeCloudFailure(error, target) ?? `The check didn't finish. ${error instanceof Error ? error.message : String(error)}`
            }
        },

        saveCloudSetup: (target) => {
            const settings = useSettingsStore.getState()
            const moved = targetOf(settings.cloudBackup) !== JSON.stringify(target)

            // A new place has none of this computer's props yet, so the first backup there runs straight away.
            settings.setCloudBackup({...target, ...(moved ? {lastAt: '', lastFingerprint: '', failingSince: ''} : {})})
            set({cloudSetupOpen: false, cloudProblem: null})
            void get().runCloudBackup()
        },

        cloudProblem: null,

        backUpToCloudNow: async () => {
            const cloud = useSettingsStore.getState().cloudBackup

            if (!cloud.service || get().phase !== 'idle') {
                return
            }

            const target = cloudTargetOf(cloud)

            try {
                // Asked for on purpose, so it goes ahead even if what changed can't be told.
                const fingerprint = await currentFingerprint().catch(() => '')
                const palettes = JSON.stringify(useSettingsStore.getState().palettes)
                const summary = await underWay('backing-up', () => backUpToCloud(target, palettes, APP_VERSION))

                useSettingsStore.getState().setCloudBackup({lastAt: new Date().toISOString(), lastFingerprint: fingerprint, failingSince: ''})
                toldCloudFailing = false
                set({cloudProblem: null})
                void get().refreshBackupDue()
                notify(cloudSummaryMessage(summary))
            } catch (error) {
                const message = describeCloudFailure(error, target) ?? describeBackupFailure(error, 'back up')

                set({cloudProblem: message})
                notify(message)
            }
        },

        openCloudRestore: async () => {
            const cloud = useSettingsStore.getState().cloudBackup

            if (!cloud.service || get().phase !== 'idle') {
                return
            }

            const target = cloudTargetOf(cloud)

            try {
                set({restoring: await openHeld(() => openCloudBackup(target))})
            } catch (error) {
                await clearHolding().catch(() => undefined)
                notify(describeCloudFailure(error, target) ?? describeBackupFailure(error, 'open'))
            }
        },

        turnOffCloud: async () => {
            useSettingsStore.getState().setCloudBackup({service: '', lastAt: '', lastFingerprint: '', failingSince: ''})
            set({cloudProblem: null})
            void get().refreshBackupDue()
            await forgetCloudKeys().catch(() => undefined)
        },

        turnOffFolderBackup: () => {
            useSettingsStore.getState().setFolderBackup({folder: ''})
            set({folderProblem: null})
            void get().refreshBackupDue()
        },

        setCloudAuto: (auto) => {
            useSettingsStore.getState().setCloudBackup({auto})
            void get().refreshBackupDue()

            if (auto) {
                void get().runCloudBackup()
            }
        },
    }
})
