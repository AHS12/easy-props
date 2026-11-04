/**
 * When an automatic backup is due.
 *
 * Saved props only change while the app is open, so the app backs up at the
 * moments something can have changed: a minute after a save, at start, and at
 * close. No system scheduler is needed (spec 16, decision 7). A folder gets at
 * most one dated backup a day, and only when something changed since the last.
 */

import type {CloudBackupSettings, FolderBackupSettings, SavedPalette} from '../settings/settings-spec'

/** A run of quick saves restarts the wait, so it becomes one backup. */
export const AUTO_BACKUP_DELAY_MS = 60_000

/** Closing waits this long for a backup, then closes anyway. */
export const CLOSE_WAIT_MS = 10_000

/** The local calendar day, as 2026-11-04, so "once a day" means the person's day. */
export function localDay(now: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0')

    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * True when a folder backup could be due today, before asking what changed.
 * It holds the close for the interface, which then checks properly.
 */
export function mayBeDue(settings: FolderBackupSettings, today: string): boolean {
    return settings.folder !== '' && settings.lastDay !== today
}

/** True when today's folder backup hasn't been written and something changed since the last. */
export function folderBackupDue(settings: FolderBackupSettings, fingerprint: string, today: string): boolean {
    return mayBeDue(settings, today) && fingerprint !== settings.lastFingerprint
}

/**
 * True when cloud backup is set up and runs by itself. Unlike a folder, the
 * cloud has no once-a-day limit: only changed files go up, so it's cheap.
 */
export function cloudMayBeDue(settings: CloudBackupSettings): boolean {
    return settings.service !== '' && settings.auto
}

/** True when something changed since the last cloud backup. */
export function cloudBackupDue(settings: CloudBackupSettings, fingerprint: string): boolean {
    return cloudMayBeDue(settings) && fingerprint !== settings.lastFingerprint
}

/** Failing this long, a backup says so once, instead of quietly trying again. */
export const FAILING_TOO_LONG_MS = 24 * 60 * 60 * 1000

export function failingTooLong(failingSince: string, now: Date): boolean {
    const since = Date.parse(failingSince)

    return !Number.isNaN(since) && now.getTime() - since >= FAILING_TOO_LONG_MS
}

/** A short, stable sum of the palettes, so changing one counts as a change worth backing up. */
export function palettesFingerprint(palettes: readonly SavedPalette[]): string {
    const text = JSON.stringify(palettes)
    let hash = 0x811c9dc5

    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193) >>> 0
    }

    return hash.toString(16).padStart(8, '0')
}

/** The backup's path in the folder, written the way the folder already is. */
export function pathInFolder(folder: string, name: string): string {
    const separator = folder.includes('\\') ? '\\' : '/'

    return folder.endsWith(separator) ? `${folder}${name}` : `${folder}${separator}${name}`
}
