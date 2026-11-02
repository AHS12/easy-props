/**
 * Copying text.
 *
 * The browser's clipboard comes first. Inside the desktop window it can be refused,
 * so Wails' own call is the fallback.
 */

interface ClipboardRuntime {
    ClipboardSetText(text: string): Promise<boolean>
}

const runtime = () =>
    typeof window === 'undefined' ? undefined : (window as unknown as {runtime?: ClipboardRuntime}).runtime

/** True when the text reached the clipboard. */
export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        // Try the desktop's own clipboard below.
    }

    try {
        return (await runtime()?.ClipboardSetText(text)) === true
    } catch {
        return false
    }
}
