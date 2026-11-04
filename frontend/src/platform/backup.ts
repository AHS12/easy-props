/**
 * Backups, from the frontend's side.
 *
 * Go writes and unpacks the zip and moves the files; this module asks it to,
 * picks the files with the system's own dialogs, and hears how far along it is.
 */

import {textFromBinding} from './bytes'
import type {HeldStatus, RestoreChoice} from '../core/library/restore-plan'

const BACKUP_FILTERS = ['*.zip']
const PROGRESS_EVENT = 'backup:progress'

interface BackupBindings {
    SaveFileDialog(title: string, defaultName: string, filters: string[]): Promise<string>
    OpenFileDialog(title: string, filters: string[]): Promise<string>
    BackUpToFile(path: string, palettes: number[], appVersion: string): Promise<{props: number; bytes: number}>
    OpenBackupFile(path: string): Promise<HeldBackupFile>
    ReadHeldProp(id: string): Promise<unknown>
    RestoreFromHolding(choices: RestoreChoice[]): Promise<number>
    ClearHolding(): Promise<void>
    StopBackup(): Promise<void>
    LibraryFingerprint(): Promise<string>
    FolderExists(folder: string): Promise<boolean>
    PruneFolderBackups(folder: string, keep: number): Promise<number>
    SetBackupDue(due: boolean): Promise<void>
    ChooseFolder(title: string, start: string): Promise<string>
}

interface HeldBackupFile {
    app: string
    madeAt: string
    props: {id: string; savedAt: string; size: number; hasPicture: boolean; status: HeldStatus}[] | null
    palettes: string
}

interface ProgressRuntime {
    EventsOn?(name: string, callback: (done: number, total: number) => void): (() => void) | undefined
}

const bindings = (): BackupBindings | undefined =>
    typeof window === 'undefined' ? undefined : (window.go?.backend?.App as unknown as BackupBindings | undefined)

function backupBindings(): BackupBindings {
    const app = bindings()

    if (!app) {
        throw new Error('Backups need the desktop app.')
    }

    return app
}

/** Backups move files on disk, so a plain browser can't make one. */
export const canBackUp = (): boolean => bindings() !== undefined

/** `easy-props-backup-2026-11-04.zip`, by the local date. */
export function backupFileName(now: Date = new Date()): string {
    const pad = (value: number) => String(value).padStart(2, '0')

    return `easy-props-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`
}

/** Asks where to save a backup. Null when the person cancels. */
export async function chooseBackupTarget(): Promise<string | null> {
    return (await backupBindings().SaveFileDialog('Back up your props', backupFileName(), BACKUP_FILTERS)) || null
}

/** Asks for a backup to restore. Null when the person cancels. */
export async function chooseBackupSource(): Promise<string | null> {
    return (await backupBindings().OpenFileDialog('Restore from a backup', BACKUP_FILTERS)) || null
}

export async function backUpToFile(path: string, palettes: string, appVersion: string): Promise<{props: number; bytes: number}> {
    return backupBindings().BackUpToFile(path, [...new TextEncoder().encode(palettes)], appVersion)
}

export interface HeldProp {
    readonly id: string
    readonly savedAt: string
    readonly size: number
    readonly status: HeldStatus
    /** Where its picture is served while the backup is held, or null. */
    readonly picture: string | null
}

export interface HeldBackup {
    readonly app: string
    readonly madeAt: string
    readonly props: readonly HeldProp[]
    readonly palettes: string
}

export async function openBackupFile(path: string): Promise<HeldBackup> {
    const held = await backupBindings().OpenBackupFile(path)

    return {
        app: held.app,
        madeAt: held.madeAt,
        palettes: held.palettes,
        props: (held.props ?? []).map((prop) => ({
            id: prop.id,
            savedAt: prop.savedAt,
            size: prop.size,
            status: prop.status,
            picture: prop.hasPicture ? `/your-props/restoring/${encodeURIComponent(prop.id)}.png?v=${encodeURIComponent(held.madeAt)}` : null,
        })),
    }
}

export async function readHeldProp(id: string): Promise<string> {
    return textFromBinding(await backupBindings().ReadHeldProp(id))
}

export const restoreFromHolding = (choices: RestoreChoice[]): Promise<number> => backupBindings().RestoreFromHolding(choices)

/** Clears what a restore unpacked. Nothing to do in a browser. */
export async function clearHolding(): Promise<void> {
    await bindings()?.ClearHolding()
}

/** Sums up the saved props without reading them, to tell whether anything changed. */
export const libraryFingerprint = (): Promise<string> => backupBindings().LibraryFingerprint()

/** Whether a folder is there now, such as a drive that may be unplugged. */
export const folderExists = (folder: string): Promise<boolean> => backupBindings().FolderExists(folder)

/** Keeps the newest of the app's own backups in a folder, and never touches anything else. */
export const pruneFolderBackups = (folder: string, keep: number): Promise<number> => backupBindings().PruneFolderBackups(folder, keep)

/** Tells the close guard a backup may be due, so closing comes to us first. */
export async function setBackupDue(due: boolean): Promise<void> {
    await bindings()?.SetBackupDue(due)
}

/** Asks for the folder automatic backups go to. Null when the person cancels. */
export async function chooseBackupFolder(start: string): Promise<string | null> {
    return (await backupBindings().ChooseFolder('Back up to this folder', start)) || null
}

export const stopBackup = async (): Promise<void> => bindings()?.StopBackup()

/** Calls back as a backup or restore goes, with how many files are done of how many. */
export function onBackupProgress(handler: (done: number, total: number) => void): () => void {
    const runtime = typeof window === 'undefined' ? undefined : (window.runtime as unknown as ProgressRuntime | undefined)

    return runtime?.EventsOn?.(PROGRESS_EVENT, handler) ?? (() => {})
}
