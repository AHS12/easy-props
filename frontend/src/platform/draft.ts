/**
 * The draft: one unsaved document, kept so a close cannot destroy work.
 *
 * It lives outside the gallery folder, so it never appears as a saved prop,
 * and it exists only while there are unsaved changes — a successful save
 * clears it.
 */

import {textFromBinding} from './bytes'
import {desktopApp} from './shell'

interface DraftBindings {
    WriteDraft(contents: number[]): Promise<void>
    ReadDraft(): Promise<unknown>
    ClearDraft(): Promise<void>
    SetUnsaved(unsaved: boolean): Promise<void>
}

const BROWSER_KEY = 'easy-props:draft'

function bindings(): DraftBindings | undefined {
    return desktopApp<DraftBindings>()
}

/** The draft's text, or null when there is none. */
export async function readDraftText(): Promise<string | null> {
    const app = bindings()

    if (!app) {
        try {
            return window.localStorage.getItem(BROWSER_KEY)
        } catch {
            return null
        }
    }

    const text = textFromBinding(await app.ReadDraft())

    return text === '' ? null : text
}

export async function writeDraftText(text: string): Promise<void> {
    const app = bindings()

    if (!app) {
        try {
            window.localStorage.setItem(BROWSER_KEY, text)
        } catch {
            // A full quota is not worth interrupting the user for.
        }

        return
    }

    await app.WriteDraft([...new TextEncoder().encode(text)])
}

export async function clearDraftText(): Promise<void> {
    const app = bindings()

    if (!app) {
        try {
            window.localStorage.removeItem(BROWSER_KEY)
        } catch {
            // Nothing to do.
        }

        return
    }

    await app.ClearDraft()
}

/** Tells the desktop shell whether closing would lose anything. */
export async function setUnsaved(unsaved: boolean): Promise<void> {
    await bindings()?.SetUnsaved(unsaved)
}
