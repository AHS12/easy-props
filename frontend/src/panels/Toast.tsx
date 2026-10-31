import {X} from 'lucide-react'
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
        <div className="notice" role="status">
            <span className="notice__message">{toast.message}</span>

            {toast.undoable ? (
                <button
                    type="button"
                    className="notice__action"
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
                className="notice__close"
                onClick={dismissToast}
                aria-label="Dismiss"
            >
                <X size={13} aria-hidden="true" />
            </button>
        </div>
    )
}
