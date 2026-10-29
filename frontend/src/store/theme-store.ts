/**
 * The theme store.
 *
 * Theme is app chrome rather than editor content, so it lives in its own
 * store rather than in the editor store.
 */

import {create} from 'zustand'
import {
    applyTheme,
    resolveInitialTheme,
    storeTheme,
    type ThemeName,
} from '../core/settings/theme'

export interface ThemeStore {
    theme: ThemeName
    /** Switches to the other theme and remembers the choice. */
    toggle(): void
    /** Applies a theme without remembering it. Used when following the OS. */
    follow(theme: ThemeName): void
}

export const useThemeStore = create<ThemeStore>((set) => ({
    theme: resolveInitialTheme(),

    toggle: () =>
        set((state) => {
            const theme: ThemeName = state.theme === 'light' ? 'dark' : 'light'
            storeTheme(theme)
            applyTheme(theme)
            return {theme}
        }),

    follow: (theme) =>
        set(() => {
            applyTheme(theme)
            return {theme}
        }),
}))
