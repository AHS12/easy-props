/**
 * The window's own controls, for the frameless desktop window.
 *
 * In a plain browser there is no window to control, so none are drawn.
 */

import {desktopApp, desktopRuntime} from './shell'

const runtime = desktopRuntime

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

/** Does what the system's own close button does, which may only hide the window. */
export const closeWindow = () => runtime()?.WindowClose()

interface QuitBindings {
    QuitApp(): Promise<void>
    SetCloseToTray(on: boolean): Promise<void>
    SetMinimiseToTray(on: boolean): Promise<void>
}

/** Only the desktop app can quit, or keep running with its window hidden. */
export const canQuit = () => desktopApp<QuitBindings>() !== undefined

/** Quits the whole app, asking about unsaved work first. */
export const quitApp = () => desktopApp<QuitBindings>()?.QuitApp()

/** Tells Go whether the close button hides the window and keeps the app running. */
export const setCloseToTray = (on: boolean) => desktopApp<QuitBindings>()?.SetCloseToTray(on)

/** Tells Go whether minimising hides the window in the tray instead of the taskbar. */
export const setMinimiseToTray = (on: boolean) => desktopApp<QuitBindings>()?.SetMinimiseToTray(on)
