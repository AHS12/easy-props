/**
 * Every setting, as data.
 *
 * The settings page and the palette both render from this list, so adding a
 * setting takes one entry. A setting is listed only once the feature it controls
 * works.
 */

import {z} from 'zod'
import type {PropSort} from '../library/prop-summary'

export type SettingPage = 'General' | 'Appearance' | 'Viewport' | 'Performance' | 'Export'

export const SETTING_PAGES: readonly SettingPage[] = ['General', 'Appearance', 'Viewport', 'Performance', 'Export']

interface Common {
    readonly key: string
    readonly page: SettingPage
    readonly label: string
    readonly help: string
    readonly keywords?: string
}

export interface ToggleSetting extends Common {
    readonly kind: 'toggle'
    readonly default: boolean
}

export interface ChoiceSetting extends Common {
    readonly kind: 'choice'
    readonly default: string
    /** An option's help, when there is one, replaces the setting's own while it's chosen. */
    readonly options: readonly {readonly value: string; readonly label: string; readonly help?: string}[]
}

export interface NumberSetting extends Common {
    readonly kind: 'number'
    readonly default: number
    readonly min: number
    readonly max: number
    readonly step: number
    readonly unit?: string
}

export interface ColourSetting extends Common {
    readonly kind: 'colour'
    readonly default: string
}

export type SettingSpec = ToggleSetting | ChoiceSetting | NumberSetting | ColourSetting

export const SETTING_SPECS = [
    {
        key: 'startOn',
        page: 'General',
        kind: 'choice',
        label: 'Start on',
        help: 'What you see when the app opens.',
        default: 'home',
        options: [
            {value: 'home', label: 'Home'},
            {value: 'last', label: 'Last prop'},
        ],
    },
    {
        key: 'autosaveDelay',
        page: 'General',
        kind: 'choice',
        label: 'Autosave',
        help: 'How soon after a change your draft is written, so a crash cannot take your work.',
        keywords: 'draft interval',
        default: '600',
        options: [
            {value: '600', label: 'Right away'},
            {value: '5000', label: 'After 5 seconds'},
            {value: '30000', label: 'After 30 seconds'},
        ],
    },
    {
        key: 'confirmRemove',
        page: 'General',
        kind: 'toggle',
        label: 'Confirm before removing a part',
        help: 'Ask first. Off by default, because Undo always brings a part back.',
        keywords: 'delete',
        default: false,
    },
    {
        key: 'showWhatsNew',
        page: 'General',
        kind: 'toggle',
        label: "Show what's new after an update",
        help: 'Opens the list of changes once, the first time a new version starts.',
        keywords: 'changelog release notes version',
        default: true,
    },
    {
        key: 'checkUpdates',
        page: 'General',
        kind: 'toggle',
        label: 'Check for updates automatically',
        help: 'Once a week, when the app opens. It tells you when a new version is out, and never downloads anything by itself.',
        keywords: 'update upgrade new version github',
        default: true,
    },
    {
        key: 'closeButton',
        page: 'General',
        kind: 'choice',
        label: 'Close button',
        help: 'What happens when you close the window.',
        keywords: 'tray taskbar background hide exit quit system',
        default: 'quit',
        options: [
            {value: 'quit', label: 'Quits easy-props', help: 'Closing the window quits easy-props. It asks first if anything is unsaved.'},
            {
                value: 'tray',
                label: 'Keeps it running',
                help: 'Closing the window hides it, and easy-props keeps running in the tray, or in the menu bar at the top of the screen on a Mac. Click its icon there to bring it back. Quit in the File menu closes it for good.',
            },
        ],
    },
    {
        key: 'minimiseButton',
        page: 'General',
        kind: 'choice',
        label: 'Minimise button',
        help: 'What happens when you minimise the window.',
        keywords: 'tray taskbar background hide minimize system',
        default: 'taskbar',
        options: [
            {value: 'taskbar', label: 'Puts it on the taskbar', help: 'Minimising puts the window on the taskbar, or in the Dock on a Mac, as usual.'},
            {
                value: 'tray',
                label: 'Hides it in the tray',
                help: 'Minimising hides the window, off the taskbar, and easy-props waits in the tray, or in the menu bar at the top of the screen on a Mac. Click its icon there to bring it back.',
            },
        ],
    },
    {
        key: 'theme',
        page: 'Appearance',
        kind: 'choice',
        label: 'Theme',
        help: 'Follow your system, or always use one.',
        keywords: 'dark light mode',
        default: 'system',
        options: [
            {value: 'system', label: 'System'},
            {value: 'dark', label: 'Dark'},
            {value: 'light', label: 'Light'},
        ],
    },
    {
        key: 'scale',
        page: 'Appearance',
        kind: 'number',
        label: 'Interface scale',
        help: 'Makes the whole interface larger or smaller.',
        keywords: 'zoom size text',
        default: 100,
        min: 90,
        max: 130,
        step: 10,
        unit: '%',
    },
    {
        key: 'reduceMotion',
        page: 'Appearance',
        kind: 'toggle',
        label: 'Reduce motion',
        help: 'Turns off interface animation. Your system setting is respected either way.',
        keywords: 'animation accessibility',
        default: false,
    },
    {
        key: 'helpOnHover',
        page: 'Appearance',
        kind: 'toggle',
        label: 'Show help on hover',
        help: 'Explains a control when you rest the pointer on its name.',
        keywords: 'tooltip',
        default: true,
    },
    {
        key: 'cameraScheme',
        page: 'Viewport',
        kind: 'choice',
        label: 'Camera scheme',
        help: 'Which mouse buttons move the camera, to match the tool you already know.',
        keywords: 'mouse navigation orbit pan',
        default: 'easy-props',
        options: [
            {value: 'easy-props', label: 'Easy-props: left orbits, right pans'},
            {value: 'blender', label: 'Blender: middle orbits, Shift+middle pans'},
            {value: 'unreal', label: 'Unreal: Alt+left orbits, Alt+middle pans'},
        ],
    },
    {
        key: 'orbitSpeed',
        page: 'Viewport',
        kind: 'number',
        label: 'Orbit speed',
        help: 'How fast the camera turns as you drag.',
        default: 1,
        min: 0.2,
        max: 3,
        step: 0.1,
    },
    {
        key: 'zoomSpeed',
        page: 'Viewport',
        kind: 'number',
        label: 'Zoom speed',
        help: 'How far one turn of the wheel moves the camera.',
        default: 1,
        min: 0.2,
        max: 3,
        step: 0.1,
    },
    {
        key: 'invertZoom',
        page: 'Viewport',
        kind: 'toggle',
        label: 'Invert zoom',
        help: 'Swaps the direction of the mouse wheel.',
        default: false,
    },
    {
        key: 'fov',
        page: 'Viewport',
        kind: 'number',
        label: 'Field of view',
        help: 'Wider shows more around the prop, and exaggerates its perspective.',
        keywords: 'fov lens',
        default: 45,
        min: 20,
        max: 90,
        step: 1,
        unit: '°',
    },
    {
        key: 'backdrop',
        page: 'Viewport',
        kind: 'choice',
        label: 'Backdrop',
        help: 'What is behind the prop. Neutral grey is best for judging colour. The demos stand it in a finished outdoor scene.',
        keywords: 'background sky meadow grass',
        default: 'studio-sky',
        options: [
            {value: 'sky', label: 'Studio'},
            {value: 'studio-sky', label: 'Studio with sky'},
            {value: 'meadow', label: 'Meadow demo'},
            {value: 'grove', label: 'Grove demo'},
            {value: 'grey', label: 'Neutral grey'},
            {value: 'colour', label: 'A colour'},
        ],
    },
    {
        key: 'backdropColour',
        page: 'Viewport',
        kind: 'colour',
        label: 'Backdrop colour',
        help: 'Used when the backdrop is set to a colour.',
        default: '#3a4048',
    },
    {
        key: 'groundSlope',
        page: 'Viewport',
        kind: 'number',
        label: 'Slope',
        help: 'Tilts the ground under the prop, to see how it sits on a hillside. Only the view changes: the prop keeps its shape.',
        keywords: 'hill hillside slope tilt ground',
        default: 0,
        min: 0,
        max: 35,
        step: 1,
        unit: '°',
    },
    {
        key: 'groundDownhill',
        page: 'Viewport',
        kind: 'number',
        label: 'Downhill',
        help: 'Which way the sloping ground falls, turning around the prop. 0 falls towards the front.',
        keywords: 'hill hillside slope direction ground',
        default: 0,
        min: 0,
        max: 355,
        step: 5,
        unit: '°',
    },
    {
        key: 'grid',
        page: 'Viewport',
        kind: 'toggle',
        label: 'Grid',
        help: 'One square is one metre.',
        default: true,
    },
    {
        key: 'wind',
        page: 'Viewport',
        kind: 'toggle',
        label: 'Wind',
        help: 'Moves the prop in the view as the wind materials will move it in your engine.',
        keywords: 'sway animate move breeze',
        default: false,
    },
    {
        key: 'windStrength',
        page: 'Viewport',
        kind: 'number',
        label: 'Wind strength',
        help: 'From a calm day to a storm. The middle is how the engine kits start.',
        keywords: 'sway breeze storm',
        default: 1,
        min: 0.3,
        max: 2,
        step: 0.1,
    },
    {
        key: 'lineWeight',
        page: 'Viewport',
        kind: 'choice',
        label: 'Cartoon lines',
        help: 'How thick the dark lines are in the Cartoon and Comic views.',
        keywords: 'outline ink toon cel comic edge',
        default: '1',
        options: [
            {value: '0.6', label: 'Thin'},
            {value: '1', label: 'Medium'},
            {value: '1.7', label: 'Bold'},
        ],
    },
    {
        key: 'shadows',
        page: 'Viewport',
        kind: 'toggle',
        label: 'Shadows',
        help: 'Turn off for a faster view on a slow graphics card.',
        default: true,
    },
    {
        key: 'antialias',
        page: 'Viewport',
        kind: 'toggle',
        label: 'Smooth edges',
        help: 'Anti-aliasing. Turn off for a faster view on a slow graphics card.',
        keywords: 'anti-aliasing msaa',
        default: true,
    },
    {
        key: 'renderScale',
        page: 'Viewport',
        kind: 'number',
        label: 'Render scale',
        help: 'Below 100% draws fewer pixels: blurrier, and faster.',
        keywords: 'resolution',
        default: 100,
        min: 50,
        max: 100,
        step: 10,
        unit: '%',
    },
    {
        key: 'barkThreads',
        page: 'Performance',
        kind: 'choice',
        label: 'Background threads',
        help: 'How many threads build bark while you work. Applies the next time the app starts.',
        keywords: 'workers cpu',
        default: 'auto',
        options: [
            {value: 'auto', label: 'Automatic'},
            {value: '2', label: '2'},
            {value: '4', label: '4'},
            {value: '8', label: '8'},
        ],
    },
    {
        key: 'frameLimit',
        page: 'Performance',
        kind: 'choice',
        label: 'Frame limit',
        help: 'Caps how often the view redraws. Lower is kinder to a laptop battery.',
        keywords: 'fps',
        default: '0',
        options: [
            {value: '0', label: 'Match the display'},
            {value: '60', label: '60 per second'},
            {value: '30', label: '30 per second'},
        ],
    },
    {
        key: 'presetThumbnails',
        page: 'Performance',
        kind: 'toggle',
        label: 'Preset pictures',
        help: 'Shows a real picture of each preset. Off shows a simple icon instead.',
        keywords: 'thumbnails',
        default: true,
    },
] as const satisfies readonly SettingSpec[]

export type SettingKey = (typeof SETTING_SPECS)[number]['key']

export type SettingValue = boolean | number | string

export type SettingValues = Readonly<Record<SettingKey, SettingValue>>

export const DEFAULT_VALUES = Object.fromEntries(
    SETTING_SPECS.map((spec) => [spec.key, spec.default]),
) as unknown as SettingValues

/** The current settings file's shape. Bump when a change cannot be read as-is. */
export const SETTINGS_VERSION = 2
/** Before this version the backdrop started as plain Studio, so that was no one's choice. */
const BRIGHT_BACKDROP_VERSION = 2

export interface PanelLayout {
    readonly leftWidth: number
    readonly rightWidth: number
    readonly leftOpen: boolean
    readonly rightOpen: boolean
}

export const DEFAULT_LAYOUT: PanelLayout = {leftWidth: 264, rightWidth: 320, leftOpen: true, rightOpen: true}

export interface SettingsFile {
    readonly version: number
    readonly values: SettingValues
    /** Command id to the keys the user chose. An empty string means no shortcut. */
    readonly shortcuts: Readonly<Record<string, string>>
    /** Commands run recently, newest first. */
    readonly recent: readonly string[]
    /** How often each palette entry was chosen, to rank between similar scores. */
    readonly usage: Readonly<Record<string, number>>
    /** Open groups in the Details panel, per kind of prop. */
    readonly openGroups: Readonly<Record<string, readonly string[]>>
    readonly layout: PanelLayout
    readonly tourSeen: boolean
    readonly galleryTourSeen: boolean
    /** The version whose What's new was last closed. */
    readonly lastSeenVersion: string
    readonly lastTreeId: string | null
    readonly libraryFolder: string
    /** When updates were last looked for successfully, in milliseconds. 0 for never. */
    readonly lastUpdateCheck: number
    /** Colours picked lately in any colour picker, newest first. */
    readonly recentColours: readonly string[]
    /** The user's own palette, shown in every colour picker. */
    readonly myColours: readonly string[]
    /** Palettes saved with a name, such as one for each game. */
    readonly palettes: readonly SavedPalette[]
    /** How Your props is sorted. */
    readonly propsSort: PropSort
    readonly folderBackup: FolderBackupSettings
    readonly cloudBackup: CloudBackupSettings
}

/**
 * Where cloud backups go. None of it is secret: the keys are in the system's
 * keychain, never here, since this file is also copied into the browser's storage.
 */
export interface CloudBackupSettings {
    /** The service picked in the setup, or empty when cloud backup isn't set up. */
    readonly service: string
    readonly endpoint: string
    readonly region: string
    readonly bucket: string
    /** Where in the bucket the backup lives. */
    readonly folder: string
    /** The bucket in the path rather than the address, as every service but Amazon gets. */
    readonly pathStyle: boolean
    /** When the last backup to the cloud finished, as an ISO time. */
    readonly lastAt: string
    /** Back up by itself, a minute after a change, at start and at close. */
    readonly auto: boolean
    /** What the props and palettes were at the last cloud backup, to tell whether anything changed. */
    readonly lastFingerprint: string
    /** When automatic backups started failing, as an ISO time, or empty while they work. */
    readonly failingSince: string
}

export const DEFAULT_CLOUD_BACKUP: CloudBackupSettings = {
    service: '',
    endpoint: '',
    region: '',
    bucket: '',
    folder: 'easy-props',
    pathStyle: true,
    lastAt: '',
    auto: true,
    lastFingerprint: '',
    failingSince: '',
}

/** Backing up to a folder by itself, once a day when something changed. */
export interface FolderBackupSettings {
    /** Where the dated backups go. Empty when it's off. */
    readonly folder: string
    /** How many of the app's own backups to keep there. */
    readonly keep: number
    /** The local day of the last backup there, as 2026-11-04. */
    readonly lastDay: string
    /** What the props and palettes were at the last backup, to tell whether anything changed. */
    readonly lastFingerprint: string
    /** When the last backup there was made, as an ISO time. */
    readonly lastAt: string
}

export const DEFAULT_FOLDER_BACKUP: FolderBackupSettings = {folder: '', keep: 10, lastDay: '', lastFingerprint: '', lastAt: ''}

/** A palette saved with a name, for one set of colours. */
export interface SavedPalette {
    readonly id: string
    readonly name: string
    /** Which colours it's for: a tree's five, or a rock's stone, and so on. */
    readonly set: string
    readonly colours: readonly string[]
}

export const DEFAULT_SETTINGS: SettingsFile = {
    version: SETTINGS_VERSION,
    values: DEFAULT_VALUES,
    shortcuts: {},
    recent: [],
    usage: {},
    openGroups: {},
    layout: DEFAULT_LAYOUT,
    tourSeen: false,
    galleryTourSeen: false,
    lastSeenVersion: '',
    lastTreeId: null,
    libraryFolder: '',
    lastUpdateCheck: 0,
    recentColours: [],
    myColours: [],
    palettes: [],
    propsSort: 'changed',
    folderBackup: DEFAULT_FOLDER_BACKUP,
    cloudBackup: DEFAULT_CLOUD_BACKUP,
}

/** A setting's value if it is valid for its spec, otherwise its default. */
export function validSettingValue(spec: SettingSpec, value: unknown): SettingValue {
    switch (spec.kind) {
        case 'toggle':
            return typeof value === 'boolean' ? value : spec.default
        case 'choice':
            return spec.options.some((option) => option.value === value) ? (value as string) : spec.default
        case 'number':
            return typeof value === 'number' && Number.isFinite(value)
                ? Math.min(spec.max, Math.max(spec.min, value))
                : spec.default
        case 'colour':
            return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : spec.default
    }
}

/** Codes in any other form are dropped, so a hand-edited file can't break a picker. */
const colourList = z
    .array(z.unknown())
    .catch([])
    .transform((codes) => [
        ...new Set(
            codes
                .filter((code): code is string => typeof code === 'string')
                .map((code) => code.toLowerCase())
                .filter((code) => /^#[0-9a-f]{6}$/.test(code)),
        ),
    ])

const paletteSchema = z.object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    set: z.string().min(1),
    colours: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).min(1),
})

/** One saved palette, or nothing if it's damaged, so one bad entry can't lose the rest. */
export function savedPalette(entry: unknown): SavedPalette[] {
    const result = paletteSchema.safeParse(entry)

    return result.success ? [{...result.data, colours: result.data.colours.map((colour) => colour.toLowerCase())}] : []
}

const fileSchema = z.object({
    version: z.number(),
    values: z.record(z.string(), z.unknown()).catch({}),
    shortcuts: z.record(z.string(), z.string()).catch({}),
    recent: z.array(z.string()).catch([]),
    usage: z.record(z.string(), z.number()).catch({}),
    openGroups: z.record(z.string(), z.array(z.string())).catch({}),
    layout: z
        .object({
            leftWidth: z.number().min(180).max(480),
            rightWidth: z.number().min(240).max(520),
            leftOpen: z.boolean(),
            rightOpen: z.boolean(),
        })
        .catch(DEFAULT_LAYOUT),
    tourSeen: z.boolean().catch(false),
    galleryTourSeen: z.boolean().catch(false),
    lastSeenVersion: z.string().catch(''),
    lastTreeId: z.string().nullable().catch(null),
    libraryFolder: z.string().catch(''),
    lastUpdateCheck: z.number().catch(0),
    recentColours: colourList,
    myColours: colourList,
    palettes: z.array(z.unknown()).catch([]).transform((entries) => entries.flatMap(savedPalette)),
    propsSort: z.enum(['changed', 'name', 'made']).catch('changed'),
    folderBackup: z
        .object({
            folder: z.string().catch(''),
            keep: z.number().int().min(1).max(100).catch(10),
            lastDay: z.string().catch(''),
            lastFingerprint: z.string().catch(''),
            lastAt: z.string().catch(''),
        })
        .catch(DEFAULT_FOLDER_BACKUP),
    cloudBackup: z
        .object({
            service: z.string().catch(''),
            endpoint: z.string().catch(''),
            region: z.string().catch(''),
            bucket: z.string().catch(''),
            folder: z.string().catch('easy-props'),
            pathStyle: z.boolean().catch(true),
            lastAt: z.string().catch(''),
            auto: z.boolean().catch(true),
            lastFingerprint: z.string().catch(''),
            failingSince: z.string().catch(''),
        })
        .catch(DEFAULT_CLOUD_BACKUP),
})

/** Never throws: a damaged or foreign file gives the defaults. */
export function parseSettings(text: string | null): SettingsFile {
    if (!text) {
        return DEFAULT_SETTINGS
    }

    try {
        const file = fileSchema.parse(JSON.parse(text))

        // A newer build's file might mean something else by the same names.
        if (file.version > SETTINGS_VERSION) {
            return DEFAULT_SETTINGS
        }

        const values = Object.fromEntries(
            SETTING_SPECS.map((spec) => [spec.key, validSettingValue(spec, file.values[spec.key])]),
        ) as unknown as SettingValues

        const backdrop = file.version < BRIGHT_BACKDROP_VERSION && values.backdrop === 'sky' ? 'studio-sky' : values.backdrop

        return {...file, version: SETTINGS_VERSION, values: {...values, backdrop}}
    } catch {
        return DEFAULT_SETTINGS
    }
}
