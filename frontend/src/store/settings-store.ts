/**
 * The one settings store.
 *
 * Never in undo, and never in a saved prop. Changes apply at once and are written
 * shortly after, so dragging a slider does not write a file per step.
 */

import {create} from 'zustand'
import {
    DEFAULT_LAYOUT,
    DEFAULT_SETTINGS,
    DEFAULT_VALUES,
    parseSettings,
    SETTING_SPECS,
    type PanelLayout,
    type SettingKey,
    type SettingPage,
    type SettingsFile,
    type SettingValue,
} from '../core/settings/settings-spec'
import {readSettingsCopy, readSettingsFile, setLibraryFolder, writeSettingsFile} from '../platform/settings'

const WRITE_DELAY_MS = 300
const RECENT_LIMIT = 5

export interface SettingsStore extends SettingsFile {
    /** True once the settings on disk have been read, or could not be. */
    readonly loaded: boolean
    /** Replaces the settings with what is on disk. Called once at startup. */
    load(): Promise<void>
    setValue(key: SettingKey, value: SettingValue): void
    resetPage(page: SettingPage): void
    setLayout(patch: Partial<PanelLayout>): void
    resetLayout(): void
    setShortcut(commandId: string, keys: string | null): void
    resetShortcuts(): void
    /** Remembers a palette or menu choice, for ordering what comes first. */
    noteUsed(id: string): void
    setOpenGroups(family: string, groups: readonly string[]): void
    setTourSeen(seen: boolean): void
    setGalleryTourSeen(seen: boolean): void
    setLastSeenVersion(version: string): void
    setLastTreeId(id: string | null): void
    setLibraryFolder(folder: string): void
}

let writeTimer: number | undefined

export const useSettingsStore = create<SettingsStore>((set, get) => {
    const fileOf = (): SettingsFile => {
        const {version, values, shortcuts, recent, usage, openGroups, layout, tourSeen, galleryTourSeen, lastSeenVersion, lastTreeId, libraryFolder} = get()

        return {version, values, shortcuts, recent, usage, openGroups, layout, tourSeen, galleryTourSeen, lastSeenVersion, lastTreeId, libraryFolder}
    }

    const change = (patch: Partial<SettingsFile>) => {
        set(patch)

        window.clearTimeout(writeTimer)
        writeTimer = window.setTimeout(() => {
            // Losing a preference is not worth interrupting anyone for.
            void writeSettingsFile(JSON.stringify(fileOf())).catch(() => undefined)
        }, WRITE_DELAY_MS)
    }

    return {
        ...parseSettings(readSettingsCopy()),
        loaded: false,

        load: async () => {
            const text = await readSettingsFile().catch(() => null)

            if (text) {
                set(parseSettings(text))
            }

            set({loaded: true})

            const {libraryFolder} = get()

            if (libraryFolder) {
                await setLibraryFolder(libraryFolder).catch(() => undefined)
            }
        },

        setValue: (key, value) => change({values: {...get().values, [key]: value}}),

        resetPage: (page) => {
            const values = {...get().values}

            for (const spec of SETTING_SPECS) {
                if (spec.page === page) {
                    values[spec.key] = DEFAULT_VALUES[spec.key]
                }
            }

            change({values})
        },

        setLayout: (patch) => change({layout: {...get().layout, ...patch}}),
        resetLayout: () => change({layout: DEFAULT_LAYOUT}),

        setShortcut: (commandId, keys) => {
            const shortcuts = {...get().shortcuts}

            if (keys === null) {
                delete shortcuts[commandId]
            } else {
                shortcuts[commandId] = keys
            }

            change({shortcuts})
        },

        resetShortcuts: () => change({shortcuts: DEFAULT_SETTINGS.shortcuts}),

        noteUsed: (id) => {
            const {recent, usage} = get()

            change({
                recent: [id, ...recent.filter((entry) => entry !== id)].slice(0, RECENT_LIMIT),
                usage: {...usage, [id]: (usage[id] ?? 0) + 1},
            })
        },

        setOpenGroups: (family, groups) => change({openGroups: {...get().openGroups, [family]: groups}}),
        setTourSeen: (tourSeen) => change({tourSeen}),
        setGalleryTourSeen: (galleryTourSeen) => change({galleryTourSeen}),
        setLastSeenVersion: (lastSeenVersion) => change({lastSeenVersion}),
        setLastTreeId: (lastTreeId) => change({lastTreeId}),

        setLibraryFolder: (libraryFolder) => {
            change({libraryFolder})
            void setLibraryFolder(libraryFolder).catch(() => undefined)
        },
    }
})

export const useSetting = (key: SettingKey) => useSettingsStore((state) => state.values[key])

export const settingValue = (key: SettingKey) => useSettingsStore.getState().values[key]

/** Reads a stored number chosen from a list, where the options are strings. */
export const settingNumber = (key: SettingKey) => Number(settingValue(key))

/** The interface scale, where 1 is 100%. A size set in code multiplies by this, or uses rems. */
export const uiScale = () => settingNumber('scale') / 100
