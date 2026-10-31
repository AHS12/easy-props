/**
 * Where settings are kept: a file written by Go, so they survive a WebView reset.
 *
 * A copy goes in the browser's storage as well, which is the only place in a plain
 * browser, and lets the first paint use the right theme and layout before Go answers.
 */

import {textFromBinding} from './bytes'

interface SettingsBindings {
    ReadSettings(): Promise<unknown>
    WriteSettings(contents: number[]): Promise<void>
    SetLibraryFolder(folder: string): Promise<void>
    GetLibraryInfo(): Promise<LibraryInfo>
    OpenLibraryFolder(): Promise<void>
}

export interface LibraryInfo {
    readonly folder: string
    readonly props: number
    readonly bytes: number
}

const BROWSER_KEY = 'easy-props.settings'

const bindings = () =>
    typeof window === 'undefined' ? undefined : (window.go?.backend?.App as unknown as SettingsBindings | undefined)

export function readSettingsCopy(): string | null {
    try {
        return window.localStorage.getItem(BROWSER_KEY)
    } catch {
        return null
    }
}

/** The file's text, or null when there is none or it cannot be read. */
export async function readSettingsFile(): Promise<string | null> {
    const app = bindings()

    if (!app) {
        return null
    }

    try {
        const text = textFromBinding(await app.ReadSettings())

        return text === '' ? null : text
    } catch {
        return null
    }
}

export async function writeSettingsFile(text: string): Promise<void> {
    try {
        window.localStorage.setItem(BROWSER_KEY, text)
    } catch {
        // The file below is the real copy.
    }

    await bindings()?.WriteSettings([...new TextEncoder().encode(text)])
}

export const hasDesktopStorage = () => bindings() !== undefined

export const libraryInfo = async () => (await bindings()?.GetLibraryInfo()) ?? null

export const openLibraryFolder = async () => bindings()?.OpenLibraryFolder()

export const setLibraryFolder = async (folder: string) => bindings()?.SetLibraryFolder(folder)
