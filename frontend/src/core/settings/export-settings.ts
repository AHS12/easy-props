/**
 * The export defaults, as settings.
 *
 * The Export dialog remembers these itself, so a setting here is a view of the same
 * values, and the palette and the settings page can offer them like any other.
 */

import {useEditorStore} from '../../store/editor-store'
import {BUDGET_TARGETS, type BudgetTargetId} from '../export/pipeline/budget'
import {ENGINE_LABELS, type EngineId} from '../export/pipeline/types'
import {loadExportPreferences, saveExportPreferences} from '../export/export-preferences'

export interface ExportSetting {
    readonly key: string
    readonly label: string
    readonly help: string
    readonly keywords?: string
    readonly options?: readonly {readonly value: string; readonly label: string}[]
    get(): boolean | string
    set(value: boolean | string): void
}

const update = (patch: Parameters<typeof saveExportPreferences>[0] extends infer P ? Partial<P> : never) =>
    saveExportPreferences({...loadExportPreferences(), ...patch})

export const EXPORT_SETTINGS: readonly ExportSetting[] = [
    {
        key: 'engine',
        label: 'Default engine',
        help: 'Which game engine exports are prepared for.',
        keywords: 'unreal godot blender',
        options: (Object.keys(ENGINE_LABELS) as EngineId[]).map((id) => ({value: id, label: ENGINE_LABELS[id]})),
        get: () => loadExportPreferences().engine,
        set: (value) => update({engine: value as EngineId}),
    },
    {
        key: 'levels',
        label: 'Detail levels (LOD)',
        help: 'How many versions to write, from full detail to light.',
        keywords: 'lod poly',
        options: ['1', '2', '3'].map((value) => ({value, label: value})),
        get: () => String(loadExportPreferences().levels),
        set: (value) => update({levels: Number(value)}),
    },
    {
        key: 'collision',
        label: 'Collision',
        help: 'Also write simple shapes for the trunk and heavy branches, for walking into.',
        get: () => loadExportPreferences().collision,
        set: (value) => update({collision: value === true}),
    },
    {
        key: 'wind',
        label: 'Wind data',
        help: 'Store how each part may move, for the wind materials in your engine.',
        keywords: 'sway flutter',
        get: () => loadExportPreferences().wind,
        set: (value) => update({wind: value === true}),
    },
    {
        key: 'far',
        label: 'Far-away card',
        help: 'Also write a flat picture of each tree and bush, for showing far away.',
        keywords: 'billboard impostor far distance',
        get: () => loadExportPreferences().far,
        set: (value) => update({far: value === true}),
    },
    {
        key: 'join',
        label: 'Join parts',
        help: 'Makes wood and leaves one object, for placing many at once.',
        keywords: 'merge combine single forest',
        get: () => loadExportPreferences().join,
        set: (value) => update({join: value === true}),
    },
    {
        key: 'askBeforeReplacing',
        label: 'Ask before replacing files',
        help: 'Ask before an export replaces files already in its folder, which your game may be using.',
        keywords: 'overwrite replace warning existing',
        get: () => loadExportPreferences().askBeforeReplacing,
        set: (value) => update({askBeforeReplacing: value === true}),
    },
    {
        key: 'budget',
        label: 'Budget target',
        help: 'What a prop is for, which sets the face count the status bar checks it against.',
        keywords: 'faces polygons triangles',
        options: BUDGET_TARGETS.map(({id, label, faces}) => ({value: id, label: `${label}: ${faces.toLocaleString()} faces`})),
        get: () => useEditorStore.getState().budgetTarget,
        set: (value) => useEditorStore.getState().setBudgetTarget(value as BudgetTargetId),
    },
]
