import {Dialog} from '../components/controls'
import {useUiStore} from '../store/ui-store'

/** The one question the app asks before something that loses work. */
export function ConfirmDialog() {
    const request = useUiStore((state) => state.confirm)
    const askConfirm = useUiStore((state) => state.askConfirm)
    const close = () => askConfirm(null)

    return (
        <Dialog open={request !== null} onClose={close} title={request?.title ?? 'Are you sure?'}>
            <p className="dialog__hint">{request?.text}</p>
            <div className="dialog__actions">
                <button type="button" className="button" autoFocus onClick={close}>
                    Cancel
                </button>
                <button
                    type="button"
                    className={request?.danger ? 'button button--danger' : 'button button--primary'}
                    onClick={() => {
                        close()
                        request?.run()
                    }}
                >
                    {request?.action}
                </button>
            </div>
        </Dialog>
    )
}
