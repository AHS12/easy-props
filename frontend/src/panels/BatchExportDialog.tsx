/**
 * Exporting many props at once.
 *
 * The batch itself belongs to the store, so closing this panel leaves it running
 * and the rest of the app in your hands. The status bar keeps count meanwhile.
 */

import {useEffect, useState} from 'react'
import {presetGroups} from '../assets/trees/presets'
import {MAX_VARIATIONS, type BatchChoice} from '../core/export/batch-items'
import {GODOT_IMPORT_NOTE, loadExportPreferences, saveExportPreferences} from '../core/export/export-preferences'
import {findBudgetTarget} from '../core/export/pipeline/budget'
import {ENGINE_LABELS, type EngineId} from '../core/export/pipeline/types'
import {chooseFolder} from '../platform/desktop'
import {useEditorStore} from '../store/editor-store'
import '../styles/save-dialog.css'

const ENGINES = Object.keys(ENGINE_LABELS) as EngineId[]

function formatSize(bytes: number): string {
    return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Checklist({
    title,
    entries,
    chosen,
    onToggle,
}: {
    title: string
    entries: readonly {key: string; label: string}[]
    chosen: ReadonlySet<string>
    onToggle(key: string): void
}) {
    return (
        <fieldset className="batch-dialog__group">
            <legend>{title}</legend>
            {entries.map(({key, label}) => (
                <label key={key} className="export-dialog__check">
                    <input type="checkbox" checked={chosen.has(key)} onChange={() => onToggle(key)} />
                    {label}
                </label>
            ))}
        </fieldset>
    )
}

export function BatchExportDialog() {
    const open = useEditorStore((state) => state.batchOpen)
    const closeBatch = useEditorStore((state) => state.closeBatch)
    const startBatch = useEditorStore((state) => state.startBatch)
    const cancelBatch = useEditorStore((state) => state.cancelBatch)
    const clearBatch = useEditorStore((state) => state.clearBatch)
    const batch = useEditorStore((state) => state.batch)
    const gallery = useEditorStore((state) => state.gallery)
    const budgetTarget = useEditorStore((state) => state.budgetTarget)
    const refreshGallery = useEditorStore((state) => state.refreshGallery)

    const [preferences, setPreferences] = useState(loadExportPreferences)
    const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
    const [variations, setVariations] = useState(1)

    useEffect(() => {
        if (open) {
            void refreshGallery()
        }
    }, [open, refreshGallery])

    if (!open) {
        return null
    }

    const change = (next: Partial<typeof preferences>) => {
        const merged = {...preferences, ...next}

        setPreferences(merged)
        saveExportPreferences(merged)
    }

    const toggle = (key: string) => {
        const next = new Set(chosen)

        if (!next.delete(key)) {
            next.add(key)
        }

        setChosen(next)
    }

    const start = async () => {
        const folder = preferences.folder || (await chooseFolder(''))

        if (!folder) {
            return
        }

        change({folder})

        const choices = [...chosen].map((key): BatchChoice => {
            const id = key.slice(key.indexOf(':') + 1)

            return key.startsWith('saved:')
                ? {kind: 'saved', id, name: gallery.find((tree) => tree.id === id)?.name ?? id}
                : {kind: 'preset', id}
        })

        startBatch(choices, variations, {...preferences, folder})
    }

    const total = chosen.size * variations
    const summary = batch?.summary

    return (
        <div
            className="save-dialog"
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.preventDefault()
                    closeBatch()
                }
            }}
        >
            <div
                className="save-dialog__panel export-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="batch-dialog-title"
            >
                <h2 className="save-dialog__title" id="batch-dialog-title">
                    Export many
                </h2>

                {summary ? (
                    <>
                        <p role="status">
                            {summary.cancelled ? 'Cancelled. ' : ''}
                            Exported {summary.exported} of {summary.total}, {formatSize(summary.bytes)} in all.
                        </p>
                        {summary.overBudget.length > 0 ? (
                            <>
                                <p className="save-dialog__hint">
                                    Over the {findBudgetTarget(budgetTarget).label} budget:
                                </p>
                                <ul className="export-dialog__files">
                                    {summary.overBudget.map(({name, faces}) => (
                                        <li key={name}>
                                            <span>{name}</span>
                                            <span>{faces.toLocaleString()} faces</span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : null}
                        {summary.failures.length > 0 ? (
                            <>
                                <p className="save-dialog__hint">Could not be exported:</p>
                                <ul className="export-dialog__files" role="alert">
                                    {summary.failures.map(({name, message}) => (
                                        <li key={name}>
                                            <span>{name}</span>
                                            <span>{message}</span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : null}
                        <div className="save-dialog__actions">
                            <button type="button" className="btn btn--primary" onClick={clearBatch}>
                                Done
                            </button>
                        </div>
                    </>
                ) : batch ? (
                    <>
                        <progress max={batch.total} value={batch.done} aria-label="Props exported" />
                        <p className="save-dialog__hint" role="status">
                            {batch.done} of {batch.total}
                            {batch.current ? `, now ${batch.current}` : ''}. You can close this and keep working.
                        </p>
                        <div className="save-dialog__actions">
                            <button type="button" className="btn btn--ghost" onClick={cancelBatch}>
                                Cancel the batch
                            </button>
                            <button type="button" className="btn btn--primary" onClick={closeBatch}>
                                Keep working
                            </button>
                        </div>
                    </>
                ) : (
                    <form
                        className="batch-dialog__form"
                        onSubmit={(event) => {
                            event.preventDefault()
                            void start()
                        }}
                    >
                        <div className="batch-dialog__list">
                            {gallery.length > 0 ? (
                                <Checklist
                                    title="Your props"
                                    entries={gallery.map((tree) => ({key: `saved:${tree.id}`, label: tree.name}))}
                                    chosen={chosen}
                                    onToggle={toggle}
                                />
                            ) : null}
                            {presetGroups.map((group) => (
                                <Checklist
                                    key={group.title}
                                    title={group.title}
                                    entries={group.presets.map((preset) => ({
                                        key: `preset:${preset.id}`,
                                        label: preset.name,
                                    }))}
                                    chosen={chosen}
                                    onToggle={toggle}
                                />
                            ))}
                        </div>

                        <label className="save-dialog__label" htmlFor="batch-variations">
                            Variations of each
                        </label>
                        <input
                            className="save-dialog__input"
                            id="batch-variations"
                            type="number"
                            min={1}
                            max={MAX_VARIATIONS}
                            value={variations}
                            onChange={(event) =>
                                setVariations(Math.min(MAX_VARIATIONS, Math.max(1, Math.trunc(Number(event.target.value)) || 1)))
                            }
                        />

                        <label className="save-dialog__label" htmlFor="batch-engine">
                            Engine
                        </label>
                        <select
                            className="save-dialog__input"
                            id="batch-engine"
                            value={preferences.engine}
                            onChange={(event) => change({engine: event.target.value as EngineId})}
                        >
                            {ENGINES.map((id) => (
                                <option key={id} value={id}>
                                    {ENGINE_LABELS[id]}
                                </option>
                            ))}
                        </select>

                        {preferences.engine === 'godot' ? (
                            <p className="export-dialog__note">{GODOT_IMPORT_NOTE}</p>
                        ) : null}

                        <p className="save-dialog__hint">
                            {preferences.levels} detail levels{preferences.collision ? ' and collision' : ''} each, as in
                            Export. Files go in one folder, and replace any with the same names.
                        </p>

                        <div className="save-dialog__actions">
                            <button type="button" className="btn btn--ghost" onClick={closeBatch}>
                                Close
                            </button>
                            <button type="submit" className="btn btn--primary" disabled={total === 0}>
                                Export {total} {total === 1 ? 'prop' : 'props'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    )
}
