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
import '../styles/save-dialog.css'

const ENGINES = Object.keys(ENGINE_LABELS) as EngineId[]
const LEVEL_CHOICES = [1, 2, 3]

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
    const [progress, setProgress] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const [writing, setWriting] = useState(false)

    const safeName = exportNameOf(name)
    const {engine, levels, collision, wind, folder} = preferences

    useEffect(() => {
        if (open) {
            setName(treeName)
            setError(null)
        }
    }, [open, treeName])

    // Rebuilds whenever a choice changes the files. A newer build wins.
    useEffect(() => {
        if (!open || !name) {
            return
        }

        let current = true

        setFiles(null)
        setError(null)
        setProgress(0)

        buildExport(
            sceneExportSource(scene, getStyleProfile(style), APP_VERSION),
            {name: safeName, engine, levels, collision, wind},
            (done, total) => current && setProgress(done / total),
        ).then(
            (built) => current && setFiles(built),
            (failure) => current && setError(describeFailure(failure)),
        )

        return () => {
            current = false
        }
    }, [open, name, safeName, scene, style, engine, levels, collision, wind])

    if (!open) {
        return null
    }

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
        <div
            className="save-dialog"
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.preventDefault()
                    closeExport()
                }
            }}
        >
            <form
                className="save-dialog__panel export-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="export-dialog-title"
                onSubmit={(event) => {
                    event.preventDefault()
                    void write()
                }}
            >
                <h2 className="save-dialog__title" id="export-dialog-title">
                    Export
                </h2>

                <label className="save-dialog__label" htmlFor="export-engine">
                    Engine
                </label>
                <select
                    className="save-dialog__input"
                    id="export-engine"
                    value={engine}
                    onChange={(event) => change({engine: event.target.value as EngineId})}
                >
                    {ENGINES.map((id) => (
                        <option key={id} value={id}>
                            {ENGINE_LABELS[id]}
                        </option>
                    ))}
                </select>

                {engine === 'godot' ? <p className="export-dialog__note">{GODOT_IMPORT_NOTE}</p> : null}

                <label className="save-dialog__label" htmlFor="export-name">
                    Name
                </label>
                <input
                    className="save-dialog__input"
                    id="export-name"
                    value={name}
                    maxLength={60}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setName(event.target.value)}
                />

                <label className="save-dialog__label" htmlFor="export-levels">
                    Detail levels (LOD)
                </label>
                <select
                    className="save-dialog__input"
                    id="export-levels"
                    value={levels}
                    onChange={(event) => change({levels: Number(event.target.value)})}
                >
                    {LEVEL_CHOICES.map((count) => (
                        <option key={count} value={count}>
                            {count}
                        </option>
                    ))}
                </select>

                <label className="export-dialog__check">
                    <input
                        type="checkbox"
                        checked={collision}
                        onChange={(event) => change({collision: event.target.checked})}
                    />
                    Collision
                </label>

                {findPropGenerator(scene.assets[0]?.generatorId ?? '')?.still ? null : (
                    <label className="export-dialog__check">
                        <input
                            type="checkbox"
                            checked={wind}
                            onChange={(event) => change({wind: event.target.checked})}
                        />
                        Wind data
                    </label>
                )}

                <label className="save-dialog__label" htmlFor="export-folder">
                    Folder
                </label>
                <div className="export-dialog__folder">
                    <input
                        className="save-dialog__input"
                        id="export-folder"
                        readOnly
                        value={folder}
                        placeholder="You will be asked when you export"
                    />
                    <button type="button" className="btn btn--secondary" onClick={() => void pickFolder()}>
                        Choose
                    </button>
                </div>

                {engine !== 'plain' ? (
                    <div className="export-dialog__kit">
                        <span className="save-dialog__hint">{KIT_LABELS[engine]}</span>
                        <button type="button" className="btn btn--secondary" onClick={() => void saveKit()}>
                            Save kit…
                        </button>
                    </div>
                ) : null}

                {error ? (
                    <p className="save-dialog__hint" role="alert">
                        {error}
                    </p>
                ) : files ? (
                    <ul className="export-dialog__files" aria-label="Files to write">
                        {files.map((file) => (
                            <li key={file.name}>
                                <span>{file.name}</span>
                                {file.faces !== undefined ? <span>{file.faces.toLocaleString()} faces</span> : null}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="save-dialog__hint" role="status">
                        Building the files… {Math.round(progress * 100)}%
                    </p>
                )}

                <div className="save-dialog__actions">
                    <button type="button" className="btn btn--ghost export-dialog__more" onClick={openBatch}>
                        Export many…
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={closeExport}>
                        Cancel
                    </button>
                    <button type="submit" className="btn btn--primary" disabled={!files || writing}>
                        Export
                    </button>
                </div>
            </form>
        </div>
    )
}
