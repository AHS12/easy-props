import {useEffect, useState} from 'react'
import {COMMANDS, shortcutOf, type Command} from '../core/commands/commands'
import {applyTheme, watchSystemTheme} from '../core/settings/theme'
import {CoachMarks} from '../panels/CoachMarks'
import {CommandPalette} from '../panels/CommandPalette'
import {Inspector} from '../panels/Inspector'
import {LeftRail} from '../panels/LeftRail'
import {GalleryPage} from '../pages/GalleryPage'
import {ShortcutsPanel} from '../panels/ShortcutsPanel'
import {SaveDialog} from '../panels/SaveDialog'
import {StatusStrip} from '../panels/StatusStrip'
import {Toast} from '../panels/Toast'
import {TopBar} from '../panels/TopBar'
import {hasUnsavedChanges, useEditorStore} from '../store/editor-store'
import {setUnsaved} from '../platform/draft'
import {useThemeStore} from '../store/theme-store'
import {Viewport} from '../viewport/Viewport'

export function App() {
    const announcement = useEditorStore((state) => state.announcement)
    const page = useEditorStore((state) => state.page)
    const [paletteOpen, setPaletteOpen] = useState(false)
    const [shortcutsOpen, setShortcutsOpen] = useState(false)

    const run = (command: Command) => {
        // The two that open a panel are about the interface, not the document.
        if (command.id === 'palette') {
            setPaletteOpen((open) => !open)
            return
        }

        if (command.id === 'shortcuts') {
            setShortcutsOpen((open) => !open)
            return
        }

        command.run(useEditorStore.getState())
    }

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            // Never steal a key from a field the user is typing in.
            const target = event.target as HTMLElement | null
            if (
                target &&
                (target.tagName === 'INPUT' ||
                    target.tagName === 'SELECT' ||
                    target.tagName === 'TEXTAREA')
            ) {
                return
            }

            const pressed = shortcutOf(event)
            const command = COMMANDS.find((entry) => entry.shortcut === pressed)

            // The save prompt owns the keyboard while it is open.
            if (useEditorStore.getState().savePrompt) {
                return
            }

            if (!command) {
                return
            }

            // The start page has no tree on screen, so only the two commands
            // that open a panel still mean anything there.
            if (
                useEditorStore.getState().page === 'gallery' &&
                command.id !== 'palette' &&
                command.id !== 'shortcuts'
            ) {
                return
            }

            // Escape closes the panels first, so it never does two things.
            if (pressed === 'Esc' && (paletteOpen || shortcutsOpen)) {
                event.preventDefault()
                setPaletteOpen(false)
                setShortcutsOpen(false)
                return
            }

            event.preventDefault()
            run(command)
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    })

    useEffect(() => {
        applyTheme(useThemeStore.getState().theme)

        // The operating system theme only wins while the user has not made
        // an explicit choice.
        return watchSystemTheme((theme) => useThemeStore.getState().follow(theme))
    }, [])

    // Autosave: once a change settles, write the draft, so closing the window
    // cannot take unsaved work with it.
    useEffect(() => {
        let timer: number | undefined
        let reported: boolean | null = null

        const report = () => {
            const dirty = hasUnsavedChanges(useEditorStore.getState())

            if (dirty !== reported) {
                reported = dirty
                void setUnsaved(dirty)
            }
        }

        const flush = () => {
            report()
            void useEditorStore.getState().flushDraft()
        }

        const unsubscribe = useEditorStore.subscribe((state, previous) => {
            if (state.scene === previous.scene && state.style === previous.style) {
                return
            }

            window.clearTimeout(timer)
            timer = window.setTimeout(flush, 600)
        })

        // Leaving the window is the last moment before a close, so do not wait.
        const onBlur = () => {
            window.clearTimeout(timer)
            flush()
        }

        window.addEventListener('blur', onBlur)
        report()

        return () => {
            unsubscribe()
            window.removeEventListener('blur', onBlur)
            window.clearTimeout(timer)
        }
    }, [])

    return (
        <div className="app-shell">
            {page === 'gallery' ? (
                <GalleryPage />
            ) : (
                <>
                    <TopBar />
                    <div className="app-body">
                        <LeftRail />
                        <Viewport />
                        <Inspector />
                    </div>
                    <StatusStrip />
                </>
            )}
            <CoachMarks />
            <Toast />
            <SaveDialog />
            <CommandPalette
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                onRun={(command) => {
                    setPaletteOpen(false)
                    run(command)
                }}
            />
            <ShortcutsPanel open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
            <div className="visually-hidden" role="status" aria-live="polite">
                {announcement}
            </div>
        </div>
    )
}
