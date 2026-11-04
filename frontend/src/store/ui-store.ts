/**
 * What the interface is showing: which dialogs are open, and passing moments such
 * as a control being pointed at. Nothing here is saved or undoable.
 */

import {create} from 'zustand'
import {settingValue, useSettingsStore} from './settings-store'

export type SettingsPageId =
    | 'General'
    | 'Appearance'
    | 'Palettes'
    | 'Viewport'
    | 'Performance'
    | 'Export'
    | 'Keyboard'
    | 'Storage'
    | 'Recently removed'
    | 'About'

export interface ConfirmRequest {
    readonly title: string
    readonly text: string
    readonly action: string
    readonly danger?: boolean
    /** The cancel button's words, when Cancel doesn't say enough. */
    readonly cancel?: string
    /** Shows a Don't ask again tick box, and passes whether it was ticked to run. */
    readonly offerDontAsk?: boolean
    readonly run: (dontAskAgain: boolean) => void
    readonly onCancel?: () => void
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
    showCollision: boolean
    toggleCollision(): void
    /** Wind was switched on in this session, which outweighs asking for less motion. */
    windChosen: boolean
    setWind(on: boolean): void
    /** How many shapes the view is showing, or null while they are worked out. */
    collisionShapeCount: number | null
    setCollisionShapeCount(count: number | null): void

    /** A control the palette is pointing at, flashed by the Details panel. */
    revealedControl: string | null
    revealControl(key: string | null): void

    confirm: ConfirmRequest | null
    askConfirm(request: ConfirmRequest | null): void

    /** The seed panel above the status bar. */
    seedPanelOpen: boolean
    setSeedPanelOpen(open: boolean): void

    /** Show me more's grid of versions. */
    variationsOpen: boolean
    setVariationsOpen(open: boolean): void
}

/** Whether someone's system or Settings asks for less movement on screen. */
export function asksForLessMotion(): boolean {
    return settingValue('reduceMotion') === true || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * Whether the prop should move in the wind. Asking for less motion keeps it still
 * until Wind is switched on again in this session, even if it was on last time.
 */
export function windWanted(): boolean {
    return settingValue('wind') === true && (useUiStore.getState().windChosen || !asksForLessMotion())
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
    showCollision: false,
    toggleCollision: () => set((state) => ({showCollision: !state.showCollision})),
    windChosen: false,
    setWind: (on) => {
        useSettingsStore.getState().setValue('wind', on)
        set({windChosen: on})
    },
    collisionShapeCount: null,
    setCollisionShapeCount: (collisionShapeCount) => set({collisionShapeCount}),

    revealedControl: null,
    revealControl: (revealedControl) => set({revealedControl}),

    confirm: null,
    askConfirm: (confirm) => set({confirm}),

    seedPanelOpen: false,
    setSeedPanelOpen: (seedPanelOpen) => set({seedPanelOpen}),

    variationsOpen: false,
    setVariationsOpen: (variationsOpen) => set({variationsOpen}),
}))
