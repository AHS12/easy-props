/**
 * Theme handling.
 *
 * The theme is applied by setting `data-theme` and a class on the document
 * element, so the whole palette is a single cascade and HeroUI follows it too.
 * The default is dark, unless the system asks for light.
 */

export type ThemeName = 'light' | 'dark'

export type ThemeChoice = ThemeName | 'system'

/** Read by index.html before the app loads, so the window never flashes. */
const FIRST_PAINT_KEY = 'easy-props.theme'

export function systemTheme(): ThemeName {
    if (typeof window.matchMedia !== 'function') {
        return 'dark'
    }

    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function resolveTheme(choice: ThemeChoice): ThemeName {
    return choice === 'system' ? systemTheme() : choice
}

export function applyTheme(theme: ThemeName): void {
    const root = document.documentElement

    root.dataset.theme = theme
    root.classList.toggle('dark', theme === 'dark')
    root.classList.toggle('light', theme === 'light')

    try {
        window.localStorage.setItem(FIRST_PAINT_KEY, theme)
    } catch {
        // The theme still applies. The next start may flash, nothing worse.
    }
}

/** Calls back when the operating system's theme changes. */
export function watchSystemTheme(callback: () => void): () => void {
    if (typeof window.matchMedia !== 'function') {
        return () => undefined
    }

    const query = window.matchMedia('(prefers-color-scheme: light)')

    query.addEventListener('change', callback)

    return () => query.removeEventListener('change', callback)
}
