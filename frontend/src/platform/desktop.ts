/**
 * The desktop boundary, from the frontend's side.
 *
 * In the app it calls Go through the bindings Wails injects. In a browser —
 * `pnpm dev`, or a test — it falls back to the file input and download the
 * web platform offers, so nothing here is app-only.
 *
 * Nothing in this module parses a file. It moves text and bytes and turns
 * failures into plain sentences.
 */

import {textFromBinding} from './bytes'

const PROJECT_FILTERS = ['*.json']
const BROWSER_DOWNLOADS = 'Downloads'

interface WailsApp {
    OpenFileDialog(title: string, filters: string[]): Promise<string>
    SaveFileDialog(title: string, defaultName: string, filters: string[]): Promise<string>
    ReadFile(path: string): Promise<number[]>
    WriteFile(path: string, contents: number[]): Promise<void>
    ChooseFolder(title: string, start: string): Promise<string>
    WriteFiles(folder: string, files: {name: string; contents: number[]}[]): Promise<void>
    ExistingFiles(folder: string, names: string[]): Promise<string[]>
}

declare global {
    interface Window {
        go?: {backend?: {App?: WailsApp}}
    }
}

function desktop(): WailsApp | undefined {
    return typeof window === 'undefined' ? undefined : window.go?.backend?.App
}

/** True when the app is running inside the desktop shell. */
export function isDesktop(): boolean {
    return desktop() !== undefined
}

async function writeWithBrowser(name: string, bytes: Uint8Array, type: string): Promise<void> {
    const blob = new Blob([new Uint8Array(bytes)], {type})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    URL.revokeObjectURL(url)
}

/** Asks for a project file and returns its path and contents, or null. */
export async function openProjectFile(): Promise<{path: string; text: string} | null> {
    const app = desktop()

    if (!app) {
        return openWithBrowser()
    }

    const path = await app.OpenFileDialog('Open a tree', PROJECT_FILTERS)

    if (!path) {
        return null
    }

    const bytes = await app.ReadFile(path)

    return {path, text: textFromBinding(bytes)}
}

/** Asks where to save, then writes. Returns the path, or null if cancelled. */
export async function saveProjectFile(
    text: string,
    path: string | null,
    suggestedName: string,
): Promise<string | null> {
    const app = desktop()

    if (!app) {
        await writeWithBrowser(suggestedName, new TextEncoder().encode(text), 'application/json')
        return suggestedName
    }

    const target = path ?? (await app.SaveFileDialog('Save tree', suggestedName, PROJECT_FILTERS))

    if (!target) {
        return null
    }

    await app.WriteFile(target, [...new TextEncoder().encode(text)])

    return target
}

/**
 * Asks for a folder and returns it, or null if cancelled. A browser has no
 * folders to offer, so it answers with where downloads go.
 */
export async function chooseFolder(start: string): Promise<string | null> {
    const app = desktop()

    if (!app) {
        return BROWSER_DOWNLOADS
    }

    return (await app.ChooseFolder('Export to folder', start)) || null
}

/** A folder inside another, where the platform has folders. */
export const desktopJoin = (folder: string, name: string) => (desktop() ? `${folder}/${name}` : folder)

/** Where an export ends up, in words. */
export const exportFolderLabel = (folder: string, name: string) =>
    desktop() ? `${folder}/${name}` : folder

/** Writes an export's files into a folder of its own, named after the prop. */
export function writeExportFiles(
    folder: string,
    name: string,
    files: readonly {name: string; bytes: Uint8Array}[],
): Promise<void> {
    return writeFilesTo(desktop() ? `${folder}/${name}` : folder, files)
}

/**
 * Which of an export's files are already in its folder. A browser downloads each
 * file afresh, so it never replaces one.
 */
export async function existingExportFiles(folder: string, name: string, names: readonly string[]): Promise<string[]> {
    const app = desktop()

    return app ? app.ExistingFiles(`${folder}/${name}`, [...names]) : []
}

/** Writes files straight into a folder, as a batch does. */
export async function writeFilesTo(
    folder: string,
    files: readonly {name: string; bytes: Uint8Array}[],
): Promise<void> {
    const app = desktop()

    if (!app) {
        for (const file of files) {
            await writeWithBrowser(file.name, file.bytes, 'application/octet-stream')
        }

        return
    }

    await app.WriteFiles(
        folder,
        files.map((file) => ({name: file.name, contents: [...file.bytes]})),
    )
}

function openWithBrowser(): Promise<{path: string; text: string} | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.addEventListener('change', async () => {
            const file = input.files?.[0]

            if (!file) {
                resolve(null)
                return
            }

            resolve({path: file.name, text: await file.text()})
        })
        input.addEventListener('cancel', () => resolve(null))
        input.click()
    })
}
