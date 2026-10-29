/**
 * Theme handling.
 *
 * Two themes share one visual language: Forest Workshop in daylight and the
 * same language at dusk. The accent does not change; only the surfaces,
 * borders, and text flip.
 *
 * The theme is applied by setting `data-theme` on the document element, so
 * the whole palette is a single CSS cascade rather than a per-component
 * branch.
 */

export type ThemeName = 'light' | 'dark'

const STORAGE_KEY = 'easy-props.theme'

/** The user's explicit choice, or `null` when they have not chosen one. */
export function readStoredTheme(): ThemeName | null {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY)
        return stored === 'light' || stored === 'dark' ? stored : null
    } catch {
        return null
    }
}

export function storeTheme(theme: ThemeName): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
        // Storage can be unavailable in a locked-down profile. The theme still
        // applies for this session, it just will not be remembered.
    }
}

/** The theme the operating system asks for. */
export function systemTheme(): ThemeName {
    if (typeof window.matchMedia !== 'function') {
        return 'light'
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * The theme to start with: the user's choice if they made one, otherwise
 * whatever the operating system asks for.
 */
export function resolveInitialTheme(): ThemeName {
    return readStoredTheme() ?? systemTheme()
}

export function applyTheme(theme: ThemeName): void {
    document.documentElement.dataset.theme = theme
}

/**
 * Watches for the operating system theme changing.
 *
 * The callback only fires while the user has not made an explicit choice.
 */
export function watchSystemTheme(callback: (theme: ThemeName) => void): () => void {
    const query = window.matchMedia('(prefers-color-scheme: dark)')

    const listener = (event: MediaQueryListEvent) => {
        if (readStoredTheme() !== null) {
            return
        }

        callback(event.matches ? 'dark' : 'light')
    }

    query.addEventListener('change', listener)

    return () => query.removeEventListener('change', listener)
}
