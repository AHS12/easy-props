/**
 * The close guard's question, in the app's own clothes.
 */

import {Dialog} from '../components/controls'
import {confirmClose} from '../platform/close-guard'

interface CloseDialogProps {
    /** Dismisses the question and lets the user carry on. */
    onStay(): void
}

export function CloseDialog({onStay}: CloseDialogProps) {
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
                <button type="button" className="button button--primary" onClick={() => void confirmClose()}>
                    Close
                </button>
            </div>
        </Dialog>
    )
}
