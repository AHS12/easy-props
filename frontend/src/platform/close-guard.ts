/**
 * The close guard, from the frontend's side.
 *
 * Go does not show a dialog of its own. It cancels the close and tells us
 * about it, we show a dialog that looks like the rest of the app, and if the
 * user agrees we ask Go to close for real.
 */

/** Matches `CloseRequestedEvent` in backend/app.go. */
const CLOSE_EVENT = 'app:close-requested'

interface WailsRuntime {
    EventsOn(name: string, callback: () => void): (() => void) | undefined
}

interface CloseBindings {
    ConfirmClose(): Promise<void>
}

declare global {
    interface Window {
        runtime?: WailsRuntime
    }
}

/** Calls back when the shell wants to close and the work is unsaved. */
export function onCloseRequested(handler: () => void): () => void {
    const runtime = typeof window === 'undefined' ? undefined : window.runtime

    if (!runtime?.EventsOn) {
        return () => {}
    }

    return runtime.EventsOn(CLOSE_EVENT, handler) ?? (() => {})
}

/** Tells Go the user agreed, which closes the window. */
export async function confirmClose(): Promise<void> {
    const app = window.go?.backend?.App as unknown as CloseBindings | undefined

    await app?.ConfirmClose()
}
