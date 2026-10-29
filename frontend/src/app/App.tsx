import {useEffect} from 'react'
import {applyTheme, watchSystemTheme} from '../core/settings/theme'
import {CoachMarks} from '../panels/CoachMarks'
import {Inspector} from '../panels/Inspector'
import {LeftRail} from '../panels/LeftRail'
import {StatusStrip} from '../panels/StatusStrip'
import {TopBar} from '../panels/TopBar'
import {useEditorStore} from '../store/editor-store'
import {useThemeStore} from '../store/theme-store'
import {Viewport} from '../viewport/Viewport'

export function App() {
    const announcement = useEditorStore((state) => state.announcement)
    const deselect = useEditorStore((state) => state.deselect)
    const undo = useEditorStore((state) => state.undo)
    const redo = useEditorStore((state) => state.redo)
    const setStyle = useEditorStore((state) => state.setStyle)

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            // Never steal a key from a field the user is typing in.
            const target = event.target as HTMLElement | null
            if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
                return
            }

            const modifier = event.ctrlKey || event.metaKey

            if (modifier && event.key.toLowerCase() === 'z') {
                event.preventDefault()
                if (event.shiftKey) {
                    redo()
                } else {
                    undo()
                }
                return
            }

            if (event.key === 'Escape') {
                deselect()
                return
            }

            if (!modifier && !event.altKey) {
                if (event.key === '1') {
                    setStyle('low-poly')
                } else if (event.key === '2') {
                    setStyle('detailed')
                }
            }
        }

        window.addEventListener('keydown', onKeyDown)

        return () => window.removeEventListener('keydown', onKeyDown)
    }, [deselect, undo, redo, setStyle])

    useEffect(() => {
        applyTheme(useThemeStore.getState().theme)

        // The operating system theme only wins while the user has not made
        // an explicit choice.
        return watchSystemTheme((theme) => useThemeStore.getState().follow(theme))
    }, [])

    return (
        <div className="app-shell">
            <TopBar />
            <div className="app-body">
                <LeftRail />
                <Viewport />
                <Inspector />
            </div>
            <StatusStrip />
            <CoachMarks />
            <div className="visually-hidden" role="status" aria-live="polite">
                {announcement}
            </div>
        </div>
    )
}
