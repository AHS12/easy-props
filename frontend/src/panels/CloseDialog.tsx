/**
 * The close guard's question, in the app's own clothes.
 *
 * Reuses the save prompt's panel styles on purpose: it is the same kind of
 * question, and the two should not look like they come from different apps.
 */

import {confirmClose} from '../platform/close-guard'
import '../styles/save-dialog.css'

interface CloseDialogProps {
    /** Dismisses the question and lets the user carry on. */
    onStay(): void
}

export function CloseDialog({onStay}: CloseDialogProps) {
    return (
        <div
            className="save-dialog"
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.preventDefault()
                    onStay()
                }
            }}
        >
            <div
                className="save-dialog__panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="close-dialog-title"
                aria-describedby="close-dialog-text"
            >
                <h2 className="save-dialog__title" id="close-dialog-title">
                    Close easy-props?
                </h2>

                <p className="save-dialog__hint" id="close-dialog-text">
                    You have unsaved changes. They are kept as a draft, so you can pick up where you
                    left off next time.
                </p>

                <div className="save-dialog__actions">
                    {/* Focus lands here, so a stray Enter keeps the window open. */}
                    <button type="button" className="btn btn--ghost" autoFocus onClick={onStay}>
                        Keep editing
                    </button>
                    <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => void confirmClose()}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}
