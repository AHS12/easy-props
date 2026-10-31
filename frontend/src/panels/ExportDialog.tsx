/**
 * Choosing how a prop leaves the app.
 *
 * Beginners press Export twice and get good defaults. The files are built while
 * the panel is open, so the list and its face counts are what gets written.
 */

import {useEffect, useState} from 'react'
import {getStyleProfile} from '../assets/style/style-profiles'
import {findPropGenerator} from '../assets/prop-generators'
import {
    APP_VERSION,
    GODOT_IMPORT_NOTE,
    loadExportPreferences,
    saveExportPreferences,
} from '../core/export/export-preferences'
import {buildExport} from '../core/export/pipeline/package'
import {ENGINE_LABELS, exportNameOf, type EngineId, type ExportFile} from '../core/export/pipeline/types'
import {sceneExportSource} from '../core/export/scene-source'
import {engineKitFiles, KIT_LABELS, kitFolder} from '../core/export/engine-kits'
import {chooseFolder, desktopJoin, exportFolderLabel, writeExportFiles, writeFilesTo} from '../platform/desktop'
import {useEditorStore} from '../store/editor-store'
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

    const safeName = exportNameOf(name)
    const {engine, levels, collision, wind, folder} = preferences

    useEffect(() => {
        if (open) {
            setName(treeName)
            setError(null)
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
                {name: safeName, engine, levels, collision, wind},
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
    }, [open, name, safeName, scene, style, engine, levels, collision, wind])

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
            try {
                await writeFilesTo(desktopJoin(chosen, kitFolder(engine)), engineKitFiles(engine))
                setError(null)
            } catch (failure) {
                setError(describeFailure(failure))
            }
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

            await writeExportFiles(chosen, safeName, files)
            finishExport(`Exported ${files.length} files to ${exportFolderLabel(chosen, safeName)}`)
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
                    <Row label="Collision" help="Simple shapes for the trunk and heavy branches, for walking into.">
                        <Switch label="Collision" value={collision} onChange={(next) => change({collision: next})} />
                    </Row>
                    {findPropGenerator(scene.assets[0]?.generatorId ?? '')?.still ? null : (
                        <Row label="Wind data" help="Stores how each part may move, for the wind materials in your engine.">
                            <Switch label="Wind data" value={wind} onChange={(next) => change({wind: next})} />
                        </Row>
                    )}
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

                <div className="dialog__actions">
                    <button type="button" className="text-button dialog__more" onClick={openBatch}>
                        Export many…
                    </button>
                    <button type="button" className="button" onClick={closeExport}>
                        Cancel
                    </button>
                    <button type="submit" className="button button--primary" disabled={!files || building || writing}>
                        Export
                    </button>
                </div>
            </form>
        </Dialog>
    )
}
