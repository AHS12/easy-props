/**
 * The export choices the app remembers between exports.
 *
 * Kept in the browser's storage. A missing or damaged entry gives the defaults, never an error.
 */

import {BUDGET_TARGETS, DEFAULT_BUDGET_TARGET, type BudgetTargetId} from './pipeline/budget'
import {ENGINE_LABELS, EXPORT_LOOKS, PICTURE_SIZES, type EngineId, type ExportLook, type PictureSize} from './pipeline/types'

export const APP_VERSION = '0.4.2'

/** What Godot needs told. Its own simplifying deletes leaf cards, and a file cannot turn it off. */
export const GODOT_IMPORT_NOTE =
    'In Godot, once per project: Project Settings > Import Defaults > Scene, set Import Script to easy_props_import.gd and untick Meshes > Generate LODs, then reimport. Without the script, Godot 4.7 brings props in white. With automatic LODs, the leaves disappear.'

/** What each look asks of the engine, in the user's words. */
export const LOOK_HELP =
    'How your game will draw the prop. Cartoon and Comic need the materials in the engine kit. Comic also makes the colours in the files flat.'

export const PICTURE_SIZE_HELP =
    'How sharp bark, stone and cut ends are up close. Larger pictures make larger files. Only the closest level uses them.'

export const PICTURE_SIZE_OPTIONS = PICTURE_SIZES.map((size) => ({value: String(size), label: `${size}`}))

export const MATERIALS_HELP = 'Puts the Godot materials for this look beside the files: wood and leaves that move in the wind, and lines for Cartoon and Comic.'

const STORAGE_KEY = 'easy-props.export'
const BUDGET_KEY = 'easy-props.budget-target'

export interface ExportPreferences {
    readonly engine: EngineId
    readonly levels: number
    readonly collision: boolean
    readonly wind: boolean
    readonly join: boolean
    /** A far-away card, for the props that offer one. */
    readonly far: boolean
    /** How the game will draw the prop. */
    readonly look: ExportLook
    /** The look's Godot materials, written beside the files. */
    readonly materials: boolean
    /** How many pixels across the closest level's pictures are. */
    readonly pictureSize: PictureSize
    readonly folder: string
    /** Off once someone ticks Don't ask again, since replacing is the usual case while tuning a prop. */
    readonly askBeforeReplacing: boolean
    /** Export many: each prop in a folder named after it, as one export does. */
    readonly folderPerProp: boolean
}

const DEFAULTS: ExportPreferences = {
    engine: 'plain',
    levels: 3,
    collision: true,
    wind: true,
    join: false,
    far: true,
    look: 'lit',
    materials: true,
    pictureSize: 512,
    folder: '',
    askBeforeReplacing: true,
    folderPerProp: false,
}

export function loadExportPreferences(): ExportPreferences {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<ExportPreferences>

        return {
            engine: raw.engine && raw.engine in ENGINE_LABELS ? raw.engine : DEFAULTS.engine,
            levels: raw.levels === 1 || raw.levels === 2 || raw.levels === 3 ? raw.levels : DEFAULTS.levels,
            collision: typeof raw.collision === 'boolean' ? raw.collision : DEFAULTS.collision,
            wind: typeof raw.wind === 'boolean' ? raw.wind : DEFAULTS.wind,
            join: typeof raw.join === 'boolean' ? raw.join : DEFAULTS.join,
            far: typeof raw.far === 'boolean' ? raw.far : DEFAULTS.far,
            look: raw.look && EXPORT_LOOKS.includes(raw.look) ? raw.look : DEFAULTS.look,
            materials: typeof raw.materials === 'boolean' ? raw.materials : DEFAULTS.materials,
            pictureSize: PICTURE_SIZES.includes(raw.pictureSize as PictureSize) ? (raw.pictureSize as PictureSize) : DEFAULTS.pictureSize,
            folder: typeof raw.folder === 'string' ? raw.folder : DEFAULTS.folder,
            askBeforeReplacing: typeof raw.askBeforeReplacing === 'boolean' ? raw.askBeforeReplacing : DEFAULTS.askBeforeReplacing,
            folderPerProp: typeof raw.folderPerProp === 'boolean' ? raw.folderPerProp : DEFAULTS.folderPerProp,
        }
    } catch {
        return DEFAULTS
    }
}

export function saveExportPreferences(preferences: ExportPreferences): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    } catch {
        // Only a convenience: the next export starts from the defaults.
    }
}

export function loadBudgetTarget(): BudgetTargetId {
    try {
        const raw = localStorage.getItem(BUDGET_KEY)

        return BUDGET_TARGETS.find((target) => target.id === raw)?.id ?? DEFAULT_BUDGET_TARGET
    } catch {
        return DEFAULT_BUDGET_TARGET
    }
}

export function saveBudgetTarget(id: BudgetTargetId): void {
    try {
        localStorage.setItem(BUDGET_KEY, id)
    } catch {
        // As above.
    }
}
