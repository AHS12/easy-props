/**
 * What the interface is showing: which dialogs are open, and passing moments such
 * as a control being pointed at. Nothing here is saved or undoable.
 */

import {create} from 'zustand'

export type SettingsPageId =
    | 'General'
    | 'Appearance'
    | 'Viewport'
    | 'Performance'
    | 'Export'
    | 'Keyboard'
    | 'Storage'
    | 'About'

export interface ConfirmRequest {
    readonly title: string
    readonly text: string
    readonly action: string
    readonly danger?: boolean
    readonly run: () => void
}

interface UiStore {
    paletteOpen: boolean
    setPaletteOpen(open: boolean): void

    settingsPage: SettingsPageId | null
    openSettings(page?: SettingsPageId): void
    closeSettings(): void

    tourOpen: boolean
    setTourOpen(open: boolean): void

    whatsNewOpen: boolean
    setWhatsNewOpen(open: boolean): void

    /** Hides both panels: Ctrl+\. */
    panelsHidden: boolean
    togglePanels(): void
    /** Hides everything but the view: Ctrl+Space. */
    maximized: boolean
    toggleMaximized(): void

    leftTab: 'presets' | 'outliner' | 'parts'
    setLeftTab(tab: 'presets' | 'outliner' | 'parts'): void

    showStats: boolean
    toggleStats(): void
    showScaleFigure: boolean
    toggleScaleFigure(): void

    /** A control the palette is pointing at, flashed by the Details panel. */
    revealedControl: string | null
    revealControl(key: string | null): void

    confirm: ConfirmRequest | null
    askConfirm(request: ConfirmRequest | null): void

    /** The seed panel above the status bar. */
    seedPanelOpen: boolean
    setSeedPanelOpen(open: boolean): void
}

export const useUiStore = create<UiStore>((set) => ({
    paletteOpen: false,
    setPaletteOpen: (paletteOpen) => set({paletteOpen}),

    settingsPage: null,
    openSettings: (page = 'General') => set({settingsPage: page, paletteOpen: false}),
    closeSettings: () => set({settingsPage: null}),

    tourOpen: false,
    setTourOpen: (tourOpen) => set({tourOpen}),

    whatsNewOpen: false,
    setWhatsNewOpen: (whatsNewOpen) => set({whatsNewOpen}),

    panelsHidden: false,
    togglePanels: () => set((state) => ({panelsHidden: !state.panelsHidden})),
    maximized: false,
    toggleMaximized: () => set((state) => ({maximized: !state.maximized})),

    leftTab: 'presets',
    setLeftTab: (leftTab) => set({leftTab}),

    showStats: false,
    toggleStats: () => set((state) => ({showStats: !state.showStats})),
    showScaleFigure: false,
    toggleScaleFigure: () => set((state) => ({showScaleFigure: !state.showScaleFigure})),

    revealedControl: null,
    revealControl: (revealedControl) => set({revealedControl}),

    confirm: null,
    askConfirm: (confirm) => set({confirm}),

    seedPanelOpen: false,
    setSeedPanelOpen: (seedPanelOpen) => set({seedPanelOpen}),
}))
