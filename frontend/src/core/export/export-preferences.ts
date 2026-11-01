/**
 * The export choices the app remembers between exports.
 *
 * Kept in the browser's storage. A missing or damaged entry gives the defaults, never an error.
 */

import {BUDGET_TARGETS, DEFAULT_BUDGET_TARGET, type BudgetTargetId} from './pipeline/budget'
import {ENGINE_LABELS, type EngineId} from './pipeline/types'

export const APP_VERSION = '0.1.5'

/** What Godot needs told. Its own simplifying deletes leaf cards, and a file cannot turn it off. */
export const GODOT_IMPORT_NOTE =
    'In Godot, turn off automatic LODs or the leaves disappear: select each LOD file, open the Import tab, untick Meshes > Generate LODs, then press Reimport.'

const STORAGE_KEY = 'easy-props.export'
const BUDGET_KEY = 'easy-props.budget-target'

export interface ExportPreferences {
    readonly engine: EngineId
    readonly levels: number
    readonly collision: boolean
    readonly wind: boolean
    readonly folder: string
}

const DEFAULTS: ExportPreferences = {engine: 'plain', levels: 3, collision: true, wind: true, folder: ''}

export function loadExportPreferences(): ExportPreferences {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<ExportPreferences>

        return {
            engine: raw.engine && raw.engine in ENGINE_LABELS ? raw.engine : DEFAULTS.engine,
            levels: raw.levels === 1 || raw.levels === 2 || raw.levels === 3 ? raw.levels : DEFAULTS.levels,
            collision: typeof raw.collision === 'boolean' ? raw.collision : DEFAULTS.collision,
            wind: typeof raw.wind === 'boolean' ? raw.wind : DEFAULTS.wind,
            folder: typeof raw.folder === 'string' ? raw.folder : DEFAULTS.folder,
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
