import {useEffect, useState} from 'react'
import {Dialog} from '../components/controls'
import {useUiStore} from '../store/ui-store'

/** The one question the app asks before something that loses work. */
export function ConfirmDialog() {
    const request = useUiStore((state) => state.confirm)
    const askConfirm = useUiStore((state) => state.askConfirm)
    const [dontAsk, setDontAsk] = useState(false)
    const cancel = () => {
        askConfirm(null)
        request?.onCancel?.()
    }

    useEffect(() => setDontAsk(false), [request])

    return (
        <Dialog open={request !== null} onClose={cancel} title={request?.title ?? 'Are you sure?'}>
            <p className="dialog__hint">{request?.text}</p>
            {request?.offerDontAsk ? (
                <label className="checklist__item">
                    <input type="checkbox" checked={dontAsk} onChange={(event) => setDontAsk(event.target.checked)} />
                    Don't ask again
                </label>
            ) : null}
            <div className="dialog__actions">
                <button type="button" className="button" autoFocus onClick={cancel}>
                    {request?.cancel ?? 'Cancel'}
                </button>
                <button
                    type="button"
                    className={request?.danger ? 'button button--danger' : 'button button--primary'}
                    onClick={() => {
                        askConfirm(null)
                        request?.run(dontAsk)
                    }}
                >
                    {request?.action}
                </button>
            </div>
        </Dialog>
    )
}
