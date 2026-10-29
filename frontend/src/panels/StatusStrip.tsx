import {useEditorStore} from '../store/editor-store'

function statusLabel(state: 'ready' | 'busy' | 'error', message?: string): string {
    if (message) {
        return message
    }

    if (state === 'busy') {
        return 'Working'
    }

    if (state === 'error') {
        return 'Something went wrong'
    }

    return 'Ready'
}

export function StatusStrip() {
    const status = useEditorStore((state) => state.status)

    return (
        <footer className="statusbar">
            <span>
                <span className="statusbar__dot" aria-hidden="true" />
                {statusLabel(status.state, status.message)}
            </span>
            <span className="statusbar__right">
                <span>Seed 1</span>
            </span>
        </footer>
    )
}
