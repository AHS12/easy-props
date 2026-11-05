/**
 * Choosing how a prop leaves the app.
 *
 * Beginners press Export twice and get good defaults. The files are built while
 * the panel is open, so the list and its face counts are what gets written.
 */

import {useEffect, useRef, useState} from 'react'
import {SHADING_MODE_LABELS} from '../assets/style/shading'
import {getStyleProfile} from '../assets/style/style-profiles'
import {findPropGenerator, offersFarAway} from '../assets/prop-generators'
import {
    APP_VERSION,
    GODOT_IMPORT_NOTE,
    loadExportPreferences,
    LOOK_HELP,
    MATERIALS_HELP,
    saveExportPreferences,
} from '../core/export/export-preferences'
import {buildExport} from '../core/export/pipeline/package'
import {ENGINE_LABELS, EXPORT_LOOKS, exportNameOf, type EngineId, type ExportFile} from '../core/export/pipeline/types'
import {sceneExportSource} from '../core/export/scene-source'
import {engineKitFiles, KIT_LABELS, kitFolder} from '../core/export/engine-kits'
import {
    chooseFolder, desktopJoin, existingExportFiles, exportFolderLabel, isDesktop, showFolder, writeExportFiles, writeFilesTo,
} from '../platform/desktop'
import {useEditorStore} from '../store/editor-store'
import {useUiStore} from '../store/ui-store'
import {Dialog, Select, Switch} from '../components/controls'
import {Row} from '../components/PropertyRow'

const ENGINES = Object.keys(ENGINE_LABELS) as EngineId[]
const LEVEL_CHOICES = [1, 2, 3]

/** Waits for a pause in typing, so a rename does not rebuild the files per key. */
const REBUILD_DELAY_MS = 250

function describeFailure(error: unknown): string {
    return error instanceof Error ? error.message : 'Something went wrong.'
}

export function ExportDialog() {
    const open = useEditorStore((state) => state.exportOpen)
    const closeExport = useEditorStore((state) => state.closeExport)
    const finishExport = useEditorStore((state) => state.finishExport)
    const scene = useEditorStore((state) => state.scene)
    const style = useEditorStore((state) => state.style)
    const treeName = useEditorStore((state) => state.treeName)
    const openBatch = useEditorStore((state) => state.openBatch)

    const [preferences, setPreferences] = useState(loadExportPreferences)
    const [name, setName] = useState('')
    const [files, setFiles] = useState<readonly ExportFile[] | null>(null)
    const [building, setBuilding] = useState(false)
    const [progress, setProgress] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const [writing, setWriting] = useState(false)
    const nameField = useRef<HTMLInputElement>(null)
    /** Where the engine kit was just saved, until the dialog closes. */
    const [kitSaved, setKitSaved] = useState<string | null>(null)

    const safeName = exportNameOf(name)
    const {engine, levels, collision, wind, join, far, look, materials, folder} = preferences
    const generator = findPropGenerator(scene.assets[0]?.generatorId ?? '')
    const offersFar = offersFarAway(scene.assets[0]?.generatorId, scene.assets[0]?.parameters)

    useEffect(() => {
        if (open) {
            setName(treeName)
            setError(null)
            setKitSaved(null)
            // Settings may have changed these since the last export.
            setPreferences(loadExportPreferences())
        }
    }, [open, treeName])

    // Rebuilds whenever a choice changes the files. A newer build wins.
    useEffect(() => {
        if (!open) {
            setFiles(null)
            return
        }

        if (!name) {
            return
        }

        let current = true

        // The last list stays up meanwhile, so the panel does not jump or flicker.
        setBuilding(true)
        setError(null)
        setProgress(0)

        const timer = window.setTimeout(() => {
            buildExport(
                sceneExportSource(scene, getStyleProfile(style), APP_VERSION),
                {name: safeName, engine, levels, collision, wind, join, far, look, materials},
                (done, total) => current && setProgress(done / total),
            )
                .then(
                    (built) => current && setFiles(built),
                    (failure) => current && setError(describeFailure(failure)),
                )
                .finally(() => current && setBuilding(false))
        }, REBUILD_DELAY_MS)

        return () => {
            current = false
            window.clearTimeout(timer)
        }
    }, [open, name, safeName, scene, style, engine, levels, collision, wind, join, far, look, materials])

    const change = (next: Partial<typeof preferences>) => {
        const merged = {...preferences, ...next}

        setPreferences(merged)
        saveExportPreferences(merged)
    }

    const pickFolder = async () => {
        const chosen = await chooseFolder(folder)

        if (chosen) {
            change({folder: chosen})
        }
    }

    const saveKit = async () => {
        if (engine === 'plain') {
            return
        }

        const chosen = await chooseFolder(folder)

        if (chosen) {
            const kit = desktopJoin(chosen, kitFolder(engine))

            try {
                await writeFilesTo(kit, engineKitFiles(engine))
                setError(null)
                // Said here, not in a message under the dialog, which can't be clicked while it's open.
                setKitSaved(kit)
            } catch (failure) {
                setError(describeFailure(failure))
            }
        }
    }

    const writeTo = async (chosen: string, written: readonly ExportFile[]) => {
        setWriting(true)

        try {
            await writeExportFiles(chosen, safeName, written)
            finishExport(`Exported ${written.length} files to ${exportFolderLabel(chosen, safeName)}`, desktopJoin(chosen, safeName))
        } catch (failure) {
            setError(describeFailure(failure))
        } finally {
            setWriting(false)
        }
    }

    const write = async () => {
        if (!files) {
            return
        }

        setWriting(true)

        try {
            const chosen = folder || (await chooseFolder(''))

            if (chosen === null) {
                return
            }

            if (chosen !== folder) {
                change({folder: chosen})
            }

            const existing = preferences.askBeforeReplacing
                ? await existingExportFiles(chosen, safeName, files.map((file) => file.name))
                : []

            if (existing.length === 0) {
                await writeTo(chosen, files)
                return
            }

            useUiStore.getState().askConfirm({
                title: `Replace the files for "${name.trim() || safeName}"?`,
                text: `This folder already has ${existing.length} of them. Your game may be using these.`,
                action: 'Replace files',
                cancel: 'Keep them',
                danger: true,
                offerDontAsk: true,
                run: (dontAskAgain) => {
                    if (dontAskAgain) {
                        saveExportPreferences({...loadExportPreferences(), askBeforeReplacing: false})
                        setPreferences((current) => ({...current, askBeforeReplacing: false}))
                    }

                    void writeTo(chosen, files)
                },
                // A new name is the other way to keep them, so it's one step away.
                onCancel: () => window.requestAnimationFrame(() => nameField.current?.select()),
            })
        } catch (failure) {
            setError(describeFailure(failure))
        } finally {
            setWriting(false)
        }
    }

    return (
        <Dialog open={open} onClose={closeExport} title="Export" width={500}>
            <form
                className="dialog__form"
                onSubmit={(event) => {
                    event.preventDefault()
                    void write()
                }}
            >
                <div className="form-rows">
                    <Row label="Engine" help="Prepares the files for this engine's axes and import rules.">
                        <Select
                            label="Engine"
                            value={engine}
                            onChange={(next) => change({engine: next})}
                            options={ENGINES.map((id) => ({value: id, label: ENGINE_LABELS[id]}))}
                        />
                    </Row>
                    {engine === 'godot' ? <p className="dialog__note">{GODOT_IMPORT_NOTE}</p> : null}
                    <Row label="Name">
                        <input
                            ref={nameField}
                            className="field"
                            aria-label="Name"
                            value={name}
                            maxLength={60}
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </Row>
                    <Row label="Detail levels (LOD)" help="Lighter versions, for showing the prop far away.">
                        <Select
                            label="Detail levels (LOD)"
                            value={String(levels)}
                            onChange={(next) => change({levels: Number(next)})}
                            options={LEVEL_CHOICES.map((count) => ({value: String(count), label: String(count)}))}
                        />
                    </Row>
                    {offersFar ? (
                        <Row label="Far-away card" help="A flat picture of the prop for far away. It costs almost nothing to draw, but looks flat from above.">
                            <Switch label="Far-away card" value={far} onChange={(next) => change({far: next})} />
                        </Row>
                    ) : null}
                    <Row label="Look" help={LOOK_HELP}>
                        <Select
                            label="Look"
                            value={look}
                            onChange={(next) => change({look: next})}
                            options={EXPORT_LOOKS.map((id) => ({value: id, label: SHADING_MODE_LABELS[id]}))}
                        />
                    </Row>
                    {engine === 'godot' ? (
                        <Row label="Materials" help={MATERIALS_HELP}>
                            <Switch label="Materials" value={materials} onChange={(next) => change({materials: next})} />
                        </Row>
                    ) : null}
                    <Row label="Collision" help="Simple shapes for the trunk and heavy branches, for walking into.">
                        <Switch label="Collision" value={collision} onChange={(next) => change({collision: next})} />
                    </Row>
                    {generator?.still ? null : (
                        <Row label="Wind data" help="Stores how each part may move, for the wind materials in your engine.">
                            <Switch label="Wind data" value={wind} onChange={(next) => change({wind: next})} />
                        </Row>
                    )}
                    <Row label="Join parts" help="Makes wood and leaves one object, for placing many at once.">
                        <Switch label="Join parts" value={join} onChange={(next) => change({join: next})} />
                    </Row>
                    <Row label="Folder">
                        <input
                            className="field field--path"
                            aria-label="Folder"
                            readOnly
                            value={folder}
                            placeholder="You will be asked when you export"
                            title={folder}
                        />
                        <button type="button" className="button" onClick={() => void pickFolder()}>
                            Choose…
                        </button>
                    </Row>
                    {engine !== 'plain' ? (
                        <Row label="Engine kit" help={KIT_LABELS[engine]}>
                            <span className="dialog__hint dialog__hint--grow">{KIT_LABELS[engine]}</span>
                            <button type="button" className="button" onClick={() => void saveKit()}>
                                Save kit…
                            </button>
                        </Row>
                    ) : null}
                </div>

                {error ? (
                    <p className="file-list file-list--fixed dialog__error" role="alert">
                        {error}
                    </p>
                ) : files ? (
                    <ul className="file-list file-list--fixed tabular" aria-label="Files to write" data-stale={building}>
                        {files.map((file) => (
                            <li key={file.name}>
                                <span>{file.name}</span>
                                {file.faces !== undefined ? <span>{file.faces.toLocaleString()} faces</span> : null}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="file-list file-list--fixed file-list--busy" role="status">
                        <progress max={1} value={progress} aria-label="Building the files" />
                        <span>Building the files… {Math.round(progress * 100)}%</span>
                    </div>
                )}

                <div className="export-status" role="status">
                    {writing ? (
                        <span>Saving the files…</span>
                    ) : files && building && !error ? (
                        <>
                            <progress max={1} value={progress} aria-label="Updating the files" />
                            <span className="tabular">Updating… {Math.round(progress * 100)}%</span>
                        </>
                    ) : kitSaved ? (
                        <>
                            <span className="export-status__text" title={kitSaved}>
                                Saved the {ENGINE_LABELS[engine]} kit to {kitSaved}
                            </span>
                            {isDesktop() ? (
                                <button
                                    type="button"
                                    className="text-button"
                                    onClick={() =>
                                        showFolder(kitSaved).catch(() =>
                                            setError("Couldn't open the folder. It may have been moved or removed."),
                                        )
                                    }
                                >
                                    Show the files
                                </button>
                            ) : null}
                        </>
                    ) : null}
                </div>

                <div className="dialog__actions">
                    <button type="button" className="text-button dialog__more" onClick={openBatch}>
                        Export many…
                    </button>
                    <button type="button" className="button" onClick={closeExport}>
                        Cancel
                    </button>
                    <button type="submit" className="button button--primary" disabled={!files || building || writing}>
                        {writing ? 'Saving…' : 'Export'}
                    </button>
                </div>
            </form>
        </Dialog>
    )
}
