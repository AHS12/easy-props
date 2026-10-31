/**
 * Asking for a name.
 *
 * A small panel rather than an operating-system prompt: it can offer the name
 * the app would use anyway, so a beginner can press Enter and carry on.
 */

import {useEffect, useState} from 'react'
import {Dialog} from '../components/controls'
import {useEditorStore} from '../store/editor-store'

export function SaveDialog() {
    const prompt = useEditorStore((state) => state.savePrompt)
    const finishSave = useEditorStore((state) => state.finishSave)
    const cancelSave = useEditorStore((state) => state.cancelSave)

    const [name, setName] = useState('')

    // The field starts empty and the suggestion sits in the placeholder: what
    // is typed is always the whole name, and a blank field takes the default.
    useEffect(() => {
        if (prompt) {
            setName('')
        }
    }, [prompt])

    return (
        <Dialog open={prompt !== null} onClose={cancelSave} title={prompt?.title ?? 'Save'}>
            <form
                className="dialog__form"
                onSubmit={(event) => {
                    event.preventDefault()
                    void finishSave(name)
                }}
            >
                <label className="dialog__label" htmlFor="save-dialog-name">
                    Name
                </label>
                <input
                    className="field"
                    id="save-dialog-name"
                    value={name}
                    maxLength={60}
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                    placeholder={prompt?.name}
                    onChange={(event) => setName(event.target.value)}
                />

                <p className="dialog__hint">
                    Leave it blank to keep “{prompt?.name}”. You can rename it any time.
                </p>

                <div className="dialog__actions">
                    <button type="button" className="button" onClick={cancelSave}>
                        Cancel
                    </button>
                    <button type="submit" className="button button--primary">
                        Save
                    </button>
                </div>
            </form>
        </Dialog>
    )
}
