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
import {Dialog, Select} from '../components/controls'
import {Row} from '../components/PropertyRow'

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
        <fieldset className="checklist">
            <legend>{title}</legend>
            {entries.map(({key, label}) => (
                <label key={key} className="checklist__item">
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
            setPreferences(loadExportPreferences())
        }
    }, [open, refreshGallery])

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
        <Dialog open={open} onClose={closeBatch} title="Export many" width={560}>
            {summary ? (
                <>
                    <p className="dialog__hint" role="status">
                        {summary.cancelled ? 'Cancelled. ' : ''}
                        Exported {summary.exported} of {summary.total}, {formatSize(summary.bytes)} in all.
                    </p>
                    {summary.overBudget.length > 0 ? (
                        <>
                            <p className="dialog__hint">Over the {findBudgetTarget(budgetTarget).label} budget:</p>
                            <ul className="file-list tabular">
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
                            <p className="dialog__hint">Could not be exported:</p>
                            <ul className="file-list" role="alert">
                                {summary.failures.map(({name, message}) => (
                                    <li key={name}>
                                        <span>{name}</span>
                                        <span>{message}</span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : null}
                    <div className="dialog__actions">
                        <button type="button" className="button button--primary" onClick={clearBatch}>
                            Done
                        </button>
                    </div>
                </>
            ) : batch ? (
                <>
                    <progress className="dialog__progress" max={batch.total} value={batch.done} aria-label="Props exported" />
                    <p className="dialog__hint" role="status">
                        {batch.done} of {batch.total}
                        {batch.current ? `, now ${batch.current}` : ''}. You can close this and keep working.
                    </p>
                    <div className="dialog__actions">
                        <button type="button" className="button" onClick={cancelBatch}>
                            Cancel the batch
                        </button>
                        <button type="button" className="button button--primary" onClick={closeBatch}>
                            Keep working
                        </button>
                    </div>
                </>
            ) : (
                <form
                    className="dialog__form"
                    onSubmit={(event) => {
                        event.preventDefault()
                        void start()
                    }}
                >
                    <div className="checklists">
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

                    <div className="form-rows">
                        <Row label="Variations of each">
                            <input
                                className="field field--short"
                                aria-label="Variations of each"
                                type="number"
                                min={1}
                                max={MAX_VARIATIONS}
                                value={variations}
                                onChange={(event) =>
                                    setVariations(Math.min(MAX_VARIATIONS, Math.max(1, Math.trunc(Number(event.target.value)) || 1)))
                                }
                            />
                        </Row>
                        <Row label="Engine">
                            <Select
                                label="Engine"
                                value={preferences.engine}
                                onChange={(next) => change({engine: next})}
                                options={ENGINES.map((id) => ({value: id, label: ENGINE_LABELS[id]}))}
                            />
                        </Row>
                    </div>

                    {preferences.engine === 'godot' ? <p className="dialog__note">{GODOT_IMPORT_NOTE}</p> : null}

                    <p className="dialog__hint">
                        {preferences.levels} detail levels{preferences.collision ? ' and collision' : ''} each, as in
                        Export. Files go in one folder, and replace any with the same names.
                    </p>

                    <div className="dialog__actions">
                        <button type="button" className="button" onClick={closeBatch}>
                            Close
                        </button>
                        <button type="submit" className="button button--primary" disabled={total === 0}>
                            Export {total} {total === 1 ? 'prop' : 'props'}
                        </button>
                    </div>
                </form>
            )}
        </Dialog>
    )
}
