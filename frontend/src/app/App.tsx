import {useEffect} from 'react'
import {applyTheme, watchSystemTheme} from '../core/settings/theme'
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

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                deselect()
            }
        }

        window.addEventListener('keydown', onKeyDown)

        return () => window.removeEventListener('keydown', onKeyDown)
    }, [deselect])

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
            <div className="visually-hidden" role="status" aria-live="polite">
                {announcement}
            </div>
        </div>
    )
}
