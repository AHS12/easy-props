/**
 * The window's own controls, for the frameless desktop window.
 *
 * In a plain browser there is no window to control, so none are drawn.
 */

interface WindowRuntime {
    WindowMinimise(): void
    WindowToggleMaximise(): void
    WindowIsMaximised(): Promise<boolean>
    Quit(): void
    BrowserOpenURL(url: string): void
}

const runtime = () =>
    typeof window === 'undefined' ? undefined : (window as unknown as {runtime?: WindowRuntime}).runtime

export const isMac = () => typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

/** A Mac keeps its own window buttons. */
export const hasWindowControls = () => runtime() !== undefined && !isMac()

/** Whether the system's window buttons sit over the top left of the menu bar. */
export const hasInsetTitleBar = () => runtime() !== undefined && isMac()

export const minimiseWindow = () => runtime()?.WindowMinimise()

export const toggleMaximiseWindow = () => runtime()?.WindowToggleMaximise()

export const windowIsMaximised = async () => (await runtime()?.WindowIsMaximised()) ?? false

/** Opens a link in the system's browser, not inside the app's own window. */
export const openLink = (url: string) => {
    const desktop = runtime()

    if (desktop) {
        desktop.BrowserOpenURL(url)
    } else {
        window.open(url, '_blank', 'noopener')
    }
}

/** Goes through the close guard, like the system's own close button. */
export const closeWindow = () => runtime()?.Quit()
