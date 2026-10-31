/**
 * The gallery's files, from the frontend's side.
 *
 * A tree in the gallery is one project file in a folder the app owns, plus a
 * PNG beside it. Go lists and moves the files; this module turns that into
 * something a panel can draw.
 *
 * Reading a tree's name is the only parsing here, and it is deliberately
 * shallow: a gallery with one unreadable file should still list the rest.
 */

import {pngDataUrlFromBinding, textFromBinding} from './bytes'

const BINDINGS = (): LibraryBindings | undefined =>
    typeof window === 'undefined'
        ? undefined
        : (window.go?.backend?.App as unknown as LibraryBindings | undefined)

interface PropFile {
    id: string
    savedAt: string
    size: number
}

interface LibraryBindings {
    ListProps(): Promise<PropFile[] | null>
    ReadProp(id: string): Promise<unknown>
    ReadPropThumbnail(id: string): Promise<unknown>
    WriteProp(id: string, contents: number[], thumbnail: number[]): Promise<void>
    DeleteProp(id: string): Promise<void>
}

/** One tree as the gallery shows it. */
export interface SavedTree {
    readonly id: string
    readonly name: string
    /** ISO timestamp of the last save. */
    readonly savedAt: string
    /** A PNG data URL, or null when the preview could not be drawn. */
    readonly thumbnail: string | null
}

export class LibraryUnavailableError extends Error {
    constructor() {
        super('The tree gallery is only available in the app.')
        this.name = 'LibraryUnavailableError'
    }
}

export function isLibraryAvailable(): boolean {
    return BINDINGS() !== undefined
}

function dataUrlToBytes(dataUrl: string): number[] {
    const comma = dataUrl.indexOf(',')
    const binary = atob(comma === -1 ? dataUrl : dataUrl.slice(comma + 1))
    const bytes: number[] = []

    for (let i = 0; i < binary.length; i++) {
        bytes.push(binary.charCodeAt(i))
    }

    return bytes
}

/** The name inside a project file, without validating the whole document. */
function nameOf(text: string): string {
    try {
        const parsed = JSON.parse(text)

        if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
            return parsed.name
        }
    } catch {
        // A broken file still belongs in the list, marked as unreadable.
    }

    return 'Unreadable tree'
}

/** Every saved tree, newest first. */
export async function listTrees(): Promise<SavedTree[]> {
    const bindings = BINDINGS()

    if (!bindings) {
        return []
    }

    const files = (await bindings.ListProps()) ?? []

    return Promise.all(
        files.map(async (file) => {
            const [text, thumbnail] = await Promise.all([
                bindings.ReadProp(file.id).then(textFromBinding),
                bindings.ReadPropThumbnail(file.id).catch(() => null),
            ])

            return {
                id: file.id,
                name: nameOf(text),
                savedAt: file.savedAt,
                thumbnail: pngDataUrlFromBinding(thumbnail),
            }
        }),
    )
}

/** A tree's project text, ready for `parseProject`. */
export async function readTree(id: string): Promise<string> {
    const bindings = BINDINGS()

    if (!bindings) {
        throw new LibraryUnavailableError()
    }

    return textFromBinding(await bindings.ReadProp(id))
}

/** Writes a tree, and its preview when one could be drawn. */
export async function writeTree(
    id: string,
    text: string,
    thumbnail: string | null,
): Promise<void> {
    const bindings = BINDINGS()

    if (!bindings) {
        throw new LibraryUnavailableError()
    }

    await bindings.WriteProp(
        id,
        [...new TextEncoder().encode(text)],
        thumbnail ? dataUrlToBytes(thumbnail) : [],
    )
}

export async function deleteTree(id: string): Promise<void> {
    const bindings = BINDINGS()

    if (!bindings) {
        throw new LibraryUnavailableError()
    }

    await bindings.DeleteProp(id)
}

/** An id the library accepts: a file stem, safe on every platform. */
export function newTreeId(): string {
    const stamp = Date.now().toString(36)
    const salt = Math.random().toString(36).slice(2, 6)

    return `t${stamp}${salt}`
}
