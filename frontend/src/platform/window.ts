/**
 * The window's own controls, for the frameless desktop window.
 *
 * In a plain browser there is no window to control, so none are drawn.
 */

import {desktopApp, desktopRuntime} from './shell'

const runtime = desktopRuntime

export const isMac = () => typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

/** WebKitGTK says "X11; Linux" whether the desktop runs X11 or Wayland. */
export const isLinux = () => typeof navigator !== 'undefined' && /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent)

/**
 * Only Windows draws its own window buttons. A Mac keeps the system's, inset over the menu
 * bar, and Linux keeps the system's whole title bar, as GNOME and KDE users expect.
 */
export const hasWindowControls = () => runtime() !== undefined && !isMac() && !isLinux()

/** Whether the system's window buttons sit over the top left of the menu bar. */
export const hasInsetTitleBar = () => runtime() !== undefined && isMac()

/**
 * Whether the app can hide in a tray icon. Not on Linux: GNOME shows none without an
 * extension, so a window closed to the tray would have no way back.
 */
export const hasTray = () => !isLinux()

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
