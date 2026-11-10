/**
 * Exporting many props at once.
 *
 * The batch itself belongs to the store, so closing this panel leaves it running
 * and the rest of the app in your hands. The status bar keeps count meanwhile.
 */

import {useEffect, useState} from 'react'
import {SHADING_MODE_LABELS} from '../assets/style/shading'
import {presetGroups} from '../assets/trees/presets'
import {MAX_VARIATIONS, propsOf, type BatchChoice} from '../core/export/batch-items'
import {GODOT_IMPORT_NOTE, loadExportPreferences, LOOK_HELP, MATERIALS_HELP, saveExportPreferences} from '../core/export/export-preferences'
import {findBudgetTarget} from '../core/export/pipeline/budget'
import {ENGINE_LABELS, EXPORT_LOOKS, folderNameOf, type EngineId} from '../core/export/pipeline/types'
import {engineKitFiles, KIT_LABELS, kitFolder} from '../core/export/engine-kits'
import {chooseFolder, desktopJoin, isDesktop, showFolder, writeFilesTo} from '../platform/desktop'
import {useEditorStore} from '../store/editor-store'
import {Dialog, Select, Switch} from '../components/controls'
import {Row} from '../components/PropertyRow'

const ENGINES = Object.keys(ENGINE_LABELS) as EngineId[]
const LEVEL_CHOICES = [1, 2, 3]
/** The checklist key of the versions picked in Show me more. */
const PICKED = 'picked'

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
    const notify = useEditorStore((state) => state.notify)
    const batch = useEditorStore((state) => state.batch)
    const gallery = useEditorStore((state) => state.gallery)
    const budgetTarget = useEditorStore((state) => state.budgetTarget)
    const refreshGallery = useEditorStore((state) => state.refreshGallery)

    const [preferences, setPreferences] = useState(loadExportPreferences)
    const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
    const [variations, setVariations] = useState(1)
    const [subfolder, setSubfolder] = useState('')
    const [kitSaved, setKitSaved] = useState<string | null>(null)
    const [kitError, setKitError] = useState<string | null>(null)
    const picked = useEditorStore((state) => state.batchPicked)
    const savedIds = useEditorStore((state) => state.batchSavedIds)

    useEffect(() => {
        if (open) {
            void refreshGallery()
            setPreferences(loadExportPreferences())
            setKitSaved(null)
            setKitError(null)
        }
    }, [open, refreshGallery])

    // Props ticked on Your props are exactly what's wanted, so nothing else stays ticked.
    useEffect(() => {
        if (savedIds.length > 0) {
            setChosen(new Set(savedIds.map((id) => `saved:${id}`)))
        }
    }, [savedIds])

    // Versions just picked are what the person came here for.
    useEffect(() => {
        if (picked) {
            setChosen((current) => new Set(current).add(PICKED))
        }
    }, [picked])

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

    const pickFolder = async () => {
        const next = await chooseFolder(preferences.folder)

        if (next) {
            change({folder: next})
        }
    }

    const saveKit = async () => {
        const {engine} = preferences

        if (engine === 'plain') {
            return
        }

        const chosen = await chooseFolder(preferences.folder)

        if (!chosen) {
            return
        }

        const kit = desktopJoin(chosen, kitFolder(engine))

        try {
            await writeFilesTo(kit, engineKitFiles(engine))
            setKitError(null)
            setKitSaved(kit)
        } catch (failure) {
            setKitError(failure instanceof Error ? failure.message : 'Something went wrong.')
        }
    }

    const start = async () => {
        const folder = preferences.folder || (await chooseFolder(''))

        if (!folder) {
            return
        }

        change({folder})

        startBatch(choices, variations, {...preferences, folder}, subfolder)
    }

    const choices = [...chosen].flatMap((key): BatchChoice[] => {
        if (key === PICKED) {
            return picked ? [picked] : []
        }

        const id = key.slice(key.indexOf(':') + 1)

        return key.startsWith('saved:')
            ? [{kind: 'saved', id, name: gallery.find((tree) => tree.id === id)?.name ?? id}]
            : [{kind: 'preset', id}]
    })
    const total = choices.reduce((sum, choice) => sum + propsOf(choice, variations), 0)
    const inside = folderNameOf(subfolder)
    const base = inside ? desktopJoin(preferences.folder, inside) : preferences.folder
    const destination = preferences.folderPerProp && isDesktop()
        ? `Each prop gets a folder of its own in ${base}.`
        : `Files go in ${base}.`
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
                        {summary.exported > 0 && isDesktop() ? (
                            <button
                                type="button"
                                className="button"
                                onClick={() =>
                                    showFolder(batch.folder).catch(() =>
                                        notify("Couldn't open the folder. It may have been moved or removed."),
                                    )
                                }
                            >
                                Show the files
                            </button>
                        ) : null}
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
                        {picked?.kind === 'versions' ? (
                            <Checklist
                                title="Picked in Show me more"
                                entries={[{key: PICKED, label: `${picked.name}, ${picked.versions.length} ${picked.versions.length === 1 ? 'version' : 'versions'}`}]}
                                chosen={chosen}
                                onToggle={toggle}
                            />
                        ) : null}
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
                        <Row label="Variations of each" help="New seeds of each prop ticked above. Versions picked in Show me more are one each.">
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
                        <Row label="Engine" help="Prepares the files for this engine's axes and import rules.">
                            <Select
                                label="Engine"
                                value={preferences.engine}
                                onChange={(next) => change({engine: next})}
                                options={ENGINES.map((id) => ({value: id, label: ENGINE_LABELS[id]}))}
                            />
                        </Row>
                        {preferences.engine === 'godot' ? <p className="dialog__note">{GODOT_IMPORT_NOTE}</p> : null}
                        <Row label="Detail levels (LOD)" help="Lighter versions, for showing each prop far away.">
                            <Select
                                label="Detail levels (LOD)"
                                value={String(preferences.levels)}
                                onChange={(next) => change({levels: Number(next)})}
                                options={LEVEL_CHOICES.map((count) => ({value: String(count), label: String(count)}))}
                            />
                        </Row>
                        <Row label="Far-away card" help="A flat picture of each tree, bush and tall cactus, for far away. It looks flat from above.">
                            <Switch label="Far-away card" value={preferences.far} onChange={(next) => change({far: next})} />
                        </Row>
                        <Row label="Look" help={LOOK_HELP}>
                            <Select
                                label="Look"
                                value={preferences.look}
                                onChange={(next) => change({look: next})}
                                options={EXPORT_LOOKS.map((id) => ({value: id, label: SHADING_MODE_LABELS[id]}))}
                            />
                        </Row>
                        {preferences.engine === 'godot' ? (
                            <Row label="Materials" help={MATERIALS_HELP}>
                                <Switch label="Materials" value={preferences.materials} onChange={(next) => change({materials: next})} />
                            </Row>
                        ) : null}
                        <Row label="Collision" help="Simple shapes for the trunk and heavy branches, for walking into.">
                            <Switch label="Collision" value={preferences.collision} onChange={(next) => change({collision: next})} />
                        </Row>
                        <Row label="Wind data" help="Stores how each part may move, for the wind materials in your engine. Rocks never get any.">
                            <Switch label="Wind data" value={preferences.wind} onChange={(next) => change({wind: next})} />
                        </Row>
                        <Row label="Join parts" help="Makes wood and leaves one object, for placing many at once.">
                            <Switch label="Join parts" value={preferences.join} onChange={(next) => change({join: next})} />
                        </Row>
                        <Row label="Folder">
                            <input
                                className="field field--path"
                                aria-label="Folder"
                                readOnly
                                value={preferences.folder}
                                placeholder="You will be asked when you export"
                                title={preferences.folder}
                            />
                            <button type="button" className="button" onClick={() => void pickFolder()}>
                                Choose…
                            </button>
                        </Row>
                        {isDesktop() ? (
                            <>
                                <Row label="Subfolder" help="Puts the whole batch in a new folder inside the one above. Leave it empty to write straight into it.">
                                    <input
                                        className="field"
                                        aria-label="Subfolder"
                                        value={subfolder}
                                        maxLength={60}
                                        autoComplete="off"
                                        spellCheck={false}
                                        placeholder="None"
                                        onChange={(event) => setSubfolder(event.target.value)}
                                    />
                                </Row>
                                <Row label="A folder for each prop" help="Puts each prop's files in a folder named after it, as Export does.">
                                    <Switch
                                        label="A folder for each prop"
                                        value={preferences.folderPerProp}
                                        onChange={(next) => change({folderPerProp: next})}
                                    />
                                </Row>
                            </>
                        ) : null}
                        {preferences.engine !== 'plain' ? (
                            <Row label="Engine kit" help={KIT_LABELS[preferences.engine]}>
                                <span className="dialog__hint dialog__hint--grow">
                                    {kitSaved ? `Saved to ${kitSaved}` : KIT_LABELS[preferences.engine]}
                                </span>
                                <button type="button" className="button" onClick={() => void saveKit()}>
                                    Save kit…
                                </button>
                            </Row>
                        ) : null}
                    </div>

                    {kitError ? (
                        <p className="dialog__error" role="alert">
                            {kitError}
                        </p>
                    ) : null}

                    <p className="dialog__hint">
                        {preferences.folder
                            ? `${destination} They replace any files with the same names.`
                            : 'Files replace any with the same names.'}
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
