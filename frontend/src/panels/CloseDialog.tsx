/**
 * The close guard's question, in the app's own clothes.
 */

import {Dialog} from '../components/controls'

interface CloseDialogProps {
    /** Dismisses the question and lets the user carry on. */
    onStay(): void
    /** Goes ahead with the close, backing up first if a backup is due. */
    onClose(): void
}

export function CloseDialog({onStay, onClose}: CloseDialogProps) {
    return (
        <Dialog open onClose={onStay} title="Close easy-props?">
            <p className="dialog__hint">
                You have unsaved changes. They are kept as a draft, so you can pick up where you
                left off next time.
            </p>

            <div className="dialog__actions">
                {/* Focus lands here, so a stray Enter keeps the window open. */}
                <button type="button" className="button" autoFocus onClick={onStay}>
                    Keep editing
                </button>
                <button type="button" className="button button--primary" onClick={onClose}>
                    Close
                </button>
            </div>
        </Dialog>
    )
}
