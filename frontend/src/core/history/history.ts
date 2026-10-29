/**
 * Undo and redo.
 *
 * A history of document snapshots rather than mesh clones. Editing a
 * parameter regenerates geometry from the scene graph, so storing the graph
 * is enough to restore anything.
 */

import type {StyleProfileId} from '../../assets/style/style-profiles'
import type {Scene} from '../scene/scene-model'

/** The parts of the document a user can change. */
export interface DocumentState {
    readonly scene: Scene
    readonly style: StyleProfileId
    /** The preset the tree came from. */
    readonly presetId: string
}

export interface HistoryEntry {
    readonly label: string
    readonly before: DocumentState
    readonly after: DocumentState
}

export interface History {
    readonly entries: readonly HistoryEntry[]
    /** Index of the last applied entry. -1 means nothing has been applied. */
    readonly index: number
}

export const EMPTY_HISTORY: History = {entries: [], index: -1}

/** How many steps are kept. */
const MAX_DEPTH = 200

/**
 * Records an edit.
 *
 * Any redo entries are dropped, because the user has changed the document
 * since they were made.
 */
export function pushHistory(
    history: History,
    label: string,
    before: DocumentState,
    after: DocumentState,
): History {
    const kept =
        history.index < history.entries.length - 1
            ? history.entries.slice(0, history.index + 1)
            : history.entries

    const entries = [...kept, {label, before, after}].slice(-MAX_DEPTH)

    return {entries, index: entries.length - 1}
}

export function canUndo(history: History): boolean {
    return history.index >= 0
}

export function canRedo(history: History): boolean {
    return history.index < history.entries.length - 1
}

/** The name of the operation that undo would reverse. */
export function undoLabel(history: History): string | null {
    return canUndo(history) ? history.entries[history.index].label : null
}

/** The name of the operation that redo would repeat. */
export function redoLabel(history: History): string | null {
    return canRedo(history) ? history.entries[history.index + 1].label : null
}

export function undo(history: History): {history: History; document: DocumentState} | null {
    if (!canUndo(history)) {
        return null
    }

    const entry = history.entries[history.index]

    return {
        history: {...history, index: history.index - 1},
        document: entry.before,
    }
}

export function redo(history: History): {history: History; document: DocumentState} | null {
    if (!canRedo(history)) {
        return null
    }

    const entry = history.entries[history.index + 1]

    return {
        history: {...history, index: history.index + 1},
        document: entry.after,
    }
}
