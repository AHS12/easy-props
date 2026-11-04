/**
 * The gallery's files, from the frontend's side.
 *
 * A prop in the gallery is one project file in a folder the app owns, plus a
 * PNG beside it. Go lists and moves the files; this module turns that into
 * something a page can draw.
 *
 * Pictures aren't read here at all. Go serves them at an address of their own,
 * so a page only loads the ones on screen. What each file holds comes from the
 * index of saved props, and only files that changed since are read again.
 */

import {summarizeProp, type PropSummary} from '../core/library/prop-summary'
import {parsePropsIndex, refreshPropsIndex, serializePropsIndex} from '../core/library/props-index'
import {textFromBinding} from './bytes'

const BINDINGS = (): LibraryBindings | undefined =>
    typeof window === 'undefined'
        ? undefined
        : (window.go?.backend?.App as unknown as LibraryBindings | undefined)

interface PropFile {
    id: string
    savedAt: string
    size: number
    hasPicture: boolean
}

interface LibraryBindings {
    ListProps(): Promise<PropFile[] | null>
    ReadProp(id: string): Promise<unknown>
    WriteProp(id: string, contents: number[], thumbnail: number[]): Promise<void>
    WritePropPicture(id: string, picture: number[]): Promise<void>
    DeleteProp(id: string): Promise<void>
    ShowProp(id: string): Promise<void>
    ReadPropsIndex(): Promise<unknown>
    WritePropsIndex(contents: number[]): Promise<void>
}

/** One saved prop as the pages show it. */
export interface SavedTree extends PropSummary {
    readonly id: string
    /** ISO timestamp of the last save. */
    readonly savedAt: string
    /** Bytes on disk. */
    readonly size: number
    /** Where its picture is served, or null when it has none yet. */
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

/** The address Go serves a prop's picture at. The time saved keeps an old copy from showing. */
export const pictureAddress = (id: string, savedAt: string): string =>
    `/your-props/${encodeURIComponent(id)}.png?v=${encodeURIComponent(savedAt)}`

async function readIndex(bindings: LibraryBindings): Promise<string | null> {
    try {
        return textFromBinding(await bindings.ReadPropsIndex())
    } catch {
        return null
    }
}

/** Every saved prop, newest first. */
export async function listTrees(): Promise<SavedTree[]> {
    const bindings = BINDINGS()

    if (!bindings) {
        return []
    }

    const [files, indexText] = await Promise.all([bindings.ListProps().then((list) => list ?? []), readIndex(bindings)])

    const {index, summaries, changed} = await refreshPropsIndex(parsePropsIndex(indexText), files, async (id) =>
        summarizeProp(textFromBinding(await bindings.ReadProp(id))),
    )

    if (changed) {
        // Losing the index only costs reading the files again next time.
        void bindings.WritePropsIndex([...new TextEncoder().encode(serializePropsIndex(index))]).catch(() => undefined)
    }

    return files.map((file) => ({
        ...(summaries.get(file.id) as PropSummary),
        id: file.id,
        savedAt: file.savedAt,
        size: file.size,
        thumbnail: file.hasPicture ? pictureAddress(file.id, file.savedAt) : null,
    }))
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

/** Writes only a prop's picture, so it keeps its place in Last changed. */
export async function writeTreePicture(id: string, picture: string): Promise<void> {
    const bindings = BINDINGS()

    if (!bindings) {
        throw new LibraryUnavailableError()
    }

    await bindings.WritePropPicture(id, dataUrlToBytes(picture))
}

/** Shows the prop's file in the system's file manager. */
export async function showTreeFile(id: string): Promise<void> {
    const bindings = BINDINGS()

    if (!bindings) {
        throw new LibraryUnavailableError()
    }

    await bindings.ShowProp(id)
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
