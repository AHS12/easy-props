import {useEffect} from 'react'
import {Inspector} from '../panels/Inspector'
import {LeftRail} from '../panels/LeftRail'
import {StatusStrip} from '../panels/StatusStrip'
import {TopBar} from '../panels/TopBar'
import {useEditorStore} from '../store/editor-store'
import {Viewport} from '../viewport/Viewport'

export function App() {
    const announcement = useEditorStore((state) => state.announcement)
    const deselect = useEditorStore((state) => state.deselect)

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                deselect()
            }
        }

        window.addEventListener('keydown', onKeyDown)

        return () => window.removeEventListener('keydown', onKeyDown)
    }, [deselect])

    return (
        <div className="app-shell">
            <TopBar />
            <div className="app-body">
                <LeftRail />
                <Viewport />
                <Inspector />
            </div>
            <StatusStrip />
            <div className="visually-hidden" role="status" aria-live="polite">
                {announcement}
            </div>
        </div>
    )
}
