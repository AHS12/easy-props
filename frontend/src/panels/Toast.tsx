import {useEffect} from 'react'
import {useEditorStore} from '../store/editor-store'

/**
 * A short message with an action.
 *
 * Used for things the user should know about but should not be interrupted
 * by, such as a removal that can be undone.
 */
export function Toast() {
    const toast = useEditorStore((state) => state.toast)
    const dismissToast = useEditorStore((state) => state.dismissToast)
    const undo = useEditorStore((state) => state.undo)

    useEffect(() => {
        if (!toast) {
            return
        }

        const timer = window.setTimeout(dismissToast, 6000)

        return () => window.clearTimeout(timer)
    }, [toast, dismissToast])

    if (!toast) {
        return null
    }

    return (
        <div className="toast" role="status">
            <span className="toast__message">{toast.message}</span>

            {toast.undoable ? (
                <button
                    type="button"
                    className="toast__action"
                    onClick={() => {
                        undo()
                        dismissToast()
                    }}
                >
                    Undo
                </button>
            ) : null}

            <button
                type="button"
                className="toast__close"
                onClick={dismissToast}
                aria-label="Dismiss"
            >
                ×
            </button>
        </div>
    )
}
