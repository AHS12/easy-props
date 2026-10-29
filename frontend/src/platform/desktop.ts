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

const PROJECT_FILTERS = ['*.json']
const EXPORT_FILTERS = ['*.glb']

interface WailsApp {
    OpenFileDialog(title: string, filters: string[]): Promise<string>
    SaveFileDialog(title: string, defaultName: string, filters: string[]): Promise<string>
    ReadFile(path: string): Promise<number[]>
    WriteFile(path: string, contents: number[]): Promise<void>
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

    return {path, text: new TextDecoder().decode(new Uint8Array(bytes))}
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

/** Asks where to put a GLB, then writes it. Returns the path, or null. */
export async function exportGLBFile(
    bytes: ArrayBuffer,
    suggestedName: string,
): Promise<string | null> {
    const app = desktop()

    if (!app) {
        await writeWithBrowser(suggestedName, new Uint8Array(bytes), 'model/gltf-binary')
        return suggestedName
    }

    const target = await app.SaveFileDialog('Export model', suggestedName, EXPORT_FILTERS)

    if (!target) {
        return null
    }

    await app.WriteFile(target, [...new Uint8Array(bytes)])

    return target
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
