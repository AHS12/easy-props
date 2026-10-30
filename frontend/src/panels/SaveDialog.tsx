/**
 * Asking for a name.
 *
 * A small panel rather than an operating-system prompt: it can offer the name
 * the app would use anyway, so a beginner can press Enter and carry on.
 */

import {useEffect, useRef, useState} from 'react'
import {useEditorStore} from '../store/editor-store'
import '../styles/save-dialog.css'

export function SaveDialog() {
    const prompt = useEditorStore((state) => state.savePrompt)
    const finishSave = useEditorStore((state) => state.finishSave)
    const cancelSave = useEditorStore((state) => state.cancelSave)

    const [name, setName] = useState('')
    const input = useRef<HTMLInputElement>(null)

    // The field starts empty and the suggestion sits in the placeholder: what
    // is typed is always the whole name, and a blank field takes the default.
    useEffect(() => {
        if (prompt) {
            setName('')
        }
    }, [prompt])

    if (!prompt) {
        return null
    }

    return (
        <div
            className="save-dialog"
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelSave()
                }
            }}
        >
            <form
                className="save-dialog__panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="save-dialog-title"
                onSubmit={(event) => {
                    event.preventDefault()
                    void finishSave(name)
                }}
            >
                <h2 className="save-dialog__title" id="save-dialog-title">
                    {prompt.title}
                </h2>

                <label className="save-dialog__label" htmlFor="save-dialog-name">
                    Name
                </label>
                <input
                    className="save-dialog__input"
                    id="save-dialog-name"
                    ref={input}
                    value={name}
                    maxLength={60}
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                    placeholder={prompt.name}
                    onChange={(event) => setName(event.target.value)}
                />

                <p className="save-dialog__hint">
                    Leave it blank to keep “{prompt.name}”. You can rename it later in My trees.
                </p>

                <div className="save-dialog__actions">
                    <button type="button" className="btn btn--ghost" onClick={cancelSave}>
                        Cancel
                    </button>
                    <button type="submit" className="btn btn--primary">
                        Save
                    </button>
                </div>
            </form>
        </div>
    )
}
