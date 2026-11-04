import {useEffect, useRef, useState, type PointerEvent as ReactPointerEvent} from 'react'
import {ChevronLeft, ChevronRight} from 'lucide-react'
import {setBarkThreads} from '../assets/trees/painted/bark-pool'
import {commandForKeys, runCommand, shortcutOf} from '../core/commands/commands'
import {applyTheme, resolveTheme, watchSystemTheme, type ThemeChoice} from '../core/settings/theme'
import {CloseDialog} from '../panels/CloseDialog'
import {CommandPalette} from '../panels/CommandPalette'
import {ConfirmDialog} from '../panels/ConfirmDialog'
import {Details} from '../panels/Details'
import {BatchExportDialog} from '../panels/BatchExportDialog'
import {ClosingDialog} from '../panels/ClosingDialog'
import {RestoreDialog} from '../panels/RestoreDialog'
import {clearHolding} from '../platform/backup'
import {VariationGrid} from '../panels/VariationGrid'
import {ExportDialog} from '../panels/ExportDialog'
import {LeftPanel} from '../panels/LeftPanel'
import {MenuBar} from '../panels/MenuBar'
import {SaveDialog} from '../panels/SaveDialog'
import {SettingsDialog} from '../panels/SettingsDialog'
import {StatusBar} from '../panels/StatusBar'
import {Toast} from '../panels/Toast'
import {Tour} from '../panels/Tour'
import {WhatsNewDialog} from '../panels/WhatsNewDialog'
import {GalleryPage} from '../pages/GalleryPage'
import {YourPropsPage} from '../pages/YourPropsPage'
import {forgetOldRemovedTrees} from '../platform/library'
import {hasUnsavedChanges, isHomePage, useEditorStore} from '../store/editor-store'
import {setUnsaved} from '../platform/draft'
import {confirmClose, onCloseRequested} from '../platform/close-guard'
import {useBackupStore} from '../store/backup-store'
import {cancelUpdateInstall} from '../platform/update'
import {settingNumber, settingValue, uiScale, useSettingsStore} from '../store/settings-store'
import {useUiStore} from '../store/ui-store'
import {checkForUpdatesIfDue} from '../store/update-store'
import {Viewport} from '../viewport/Viewport'

const ROOT_FONT_PX = 16
/** How long after start the weekly update check waits. */
const UPDATE_CHECK_DELAY_MS = 5000

/** A few seconds after start, so the first screen settles before any backup reads the disk. */
const STARTUP_BACKUP_DELAY_MS = 3000

/** Applies what the document element carries: theme, scale and motion. */
function applyAppearance() {
    const root = document.documentElement

    applyTheme(resolveTheme(settingValue('theme') as ThemeChoice))
    root.dataset.reduceMotion = String(settingValue('reduceMotion') === true)
    // Every style is in rems by the time it gets here, so this scales the interface.
    root.style.fontSize = `${ROOT_FONT_PX * uiScale()}px`
    root.style.setProperty('--ui-scale', String(uiScale()))
}

const LIMITS = {left: [180, 480], right: [240, 520]} as const

/** The edge between a panel and the view: drag it, or use the arrow keys. */
function PanelEdge({side}: {side: 'left' | 'right'}) {
    const layout = useSettingsStore((state) => state.layout)
    const setLayout = useSettingsStore((state) => state.setLayout)
    const width = side === 'left' ? layout.leftWidth : layout.rightWidth
    const open = side === 'left' ? layout.leftOpen : layout.rightOpen
    const [min, max] = LIMITS[side]
    const drag = useRef<{x: number; width: number} | null>(null)

    const setWidth = (next: number) => {
        const clamped = Math.min(max, Math.max(min, Math.round(next)))

        setLayout(side === 'left' ? {leftWidth: clamped} : {rightWidth: clamped})
    }

    const toggle = () => setLayout(side === 'left' ? {leftOpen: !open} : {rightOpen: !open})

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        drag.current = {x: event.clientX, width}
        event.currentTarget.setPointerCapture(event.pointerId)
    }

    const Icon = (side === 'left') === open ? ChevronLeft : ChevronRight
    const name = side === 'left' ? 'presets and outliner' : 'details'

    return (
        <div className="panel-edge" data-side={side} data-open={open}>
            {open ? (
                <div
                    className="panel-edge__handle"
                    role="separator"
                    tabIndex={0}
                    aria-orientation="vertical"
                    aria-label={`Resize ${name}`}
                    aria-valuenow={width}
                    aria-valuemin={min}
                    aria-valuemax={max}
                    onPointerDown={onPointerDown}
                    onPointerMove={(event) => {
                        if (drag.current) {
                            const moved = (event.clientX - drag.current.x) / uiScale()

                            setWidth(drag.current.width + (side === 'left' ? moved : -moved))
                        }
                    }}
                    onPointerUp={() => {
                        drag.current = null
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                            event.preventDefault()
                            setWidth(width + ((event.key === 'ArrowRight') === (side === 'left') ? 16 : -16))
                        }
                    }}
                />
            ) : null}
            <button type="button" className="panel-edge__toggle" aria-label={`${open ? 'Hide' : 'Show'} ${name}`} title={`${open ? 'Hide' : 'Show'} ${name}`} onClick={toggle}>
                <Icon size={11} aria-hidden="true" />
            </button>
        </div>
    )
}

function Editor() {
    const layout = useSettingsStore((state) => state.layout)
    const panelsHidden = useUiStore((state) => state.panelsHidden)
    const maximized = useUiStore((state) => state.maximized)
    const hidden = panelsHidden || maximized
    const left = !hidden && layout.leftOpen
    const right = !hidden && layout.rightOpen

    return (
        <>
            <div className="editor-body" data-maximized={maximized}>
                {left ? (
                    <div className="panel-slot" style={{width: `${layout.leftWidth / ROOT_FONT_PX}rem`}}>
                        <LeftPanel />
                    </div>
                ) : null}
                {hidden ? null : <PanelEdge side="left" />}
                <main className="view-slot">
                    <Viewport />
                </main>
                {hidden ? null : <PanelEdge side="right" />}
                {right ? (
                    <div className="panel-slot" style={{width: `${layout.rightWidth / ROOT_FONT_PX}rem`}}>
                        <Details />
                    </div>
                ) : null}
            </div>
            {maximized ? null : <StatusBar />}
        </>
    )
}

export function App() {
    const announcement = useEditorStore((state) => state.announcement)
    const page = useEditorStore((state) => state.page)
    const [closeRequested, setCloseRequested] = useState(false)

    // The shell cancels the close when work is unsaved, or a backup may be due,
    // and tells us. The question is ours to ask, in our own voice; with nothing
    // unsaved there's no question, only the backup.
    const [closing, setClosing] = useState(false)

    const closeAfterBackup = () => {
        setCloseRequested(false)
        setClosing(true)
        void useBackupStore
            .getState()
            .backUpBeforeClosing()
            .finally(() => void confirmClose())
    }

    useEffect(
        () =>
            onCloseRequested(() => {
                if (hasUnsavedChanges(useEditorStore.getState())) {
                    setCloseRequested(true)
                } else {
                    closeAfterBackup()
                }
            }),
        [],
    )

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null
            const pressed = shortcutOf(event)
            const ui = useUiStore.getState()
            const editor = useEditorStore.getState()
            const typing =
                target !== null &&
                (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
            const command = commandForKeys(pressed)

            if (!command) {
                return
            }

            // The palette stays one key away, even from inside a field or itself.
            const isPalette = command.id === 'palette' || command.id === 'palette-alt'

            // Never steal a key from a field the user is typing in.
            if (typing && !isPalette) {
                return
            }

            // A question on screen owns the keyboard, and so do the windows.
            if (editor.savePrompt || closeRequested || ui.confirm || ui.tourOpen || ui.whatsNewOpen || ui.settingsPage || editor.exportOpen || editor.batchOpen) {
                return
            }

            if (ui.paletteOpen && !isPalette) {
                return
            }

            // Sliders and menus use the arrows and Space themselves, but no
            // shortcut uses those, so anything that reaches here is ours.

            // The home page has no prop on screen, so only some commands mean anything there.
            if (isHomePage(editor.page) && !command.global) {
                return
            }

            event.preventDefault()
            runCommand(command)
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [closeRequested])

    useEffect(() => {
        applyAppearance()

        const unsubscribe = useSettingsStore.subscribe((state, previous) => {
            if (state.values !== previous.values) {
                applyAppearance()
            }
        })
        const unwatch = watchSystemTheme(applyAppearance)
        let updateTimer: number | undefined
        let backupTimer: number | undefined

        // Settings from the file win over the copy the first paint used.
        void useSettingsStore
            .getState()
            .load()
            .then(() => {
                applyAppearance()

                const threads = String(settingValue('barkThreads'))

                setBarkThreads(threads === 'auto' ? null : Number(threads))

                const {values, lastTreeId} = useSettingsStore.getState()

                // Only now does Go know which folder the props are in.
                void forgetOldRemovedTrees().catch(() => undefined)
                // Whatever a restore left unpacked when the app last closed.
                void clearHolding().catch(() => undefined)

                if (values.startOn === 'last' && lastTreeId) {
                    void useEditorStore.getState().openTree(lastTreeId)
                }

                // After the first screen has settled, so it never slows the start.
                updateTimer = window.setTimeout(() => checkForUpdatesIfDue(), UPDATE_CHECK_DELAY_MS)

                // Catches changes from a session that closed before its backup ran.
                useBackupStore.getState().refreshBackupDue()
                backupTimer = window.setTimeout(() => void useBackupStore.getState().runFolderBackup(), STARTUP_BACKUP_DELAY_MS)
            })

        return () => {
            unsubscribe()
            unwatch()
            window.clearTimeout(updateTimer)
            window.clearTimeout(backupTimer)
        }
    }, [])

    // A save, rename, removal or palette change: back up a minute after the last one.
    useEffect(() => {
        const unwatchProps = useEditorStore.subscribe((state, previous) => {
            if (state.gallery !== previous.gallery) {
                useBackupStore.getState().scheduleFolderBackup()
            }
        })
        const unwatchPalettes = useSettingsStore.subscribe((state, previous) => {
            if (state.palettes !== previous.palettes) {
                useBackupStore.getState().scheduleFolderBackup()
            }
        })

        return () => {
            unwatchProps()
            unwatchPalettes()
        }
    }, [])

    // Remembers the prop in hand, for "Start on: last prop".
    useEffect(
        () =>
            useEditorStore.subscribe((state, previous) => {
                if (state.currentTreeId !== previous.currentTreeId) {
                    useSettingsStore.getState().setLastTreeId(state.currentTreeId)
                }
            }),
        [],
    )

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

            // The close guard has to know at once, whatever the draft's delay is.
            report()
            window.clearTimeout(timer)
            timer = window.setTimeout(flush, settingNumber('autosaveDelay'))
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
            <MenuBar home={isHomePage(page)} />
            {page === 'gallery' ? <GalleryPage /> : page === 'props' ? <YourPropsPage /> : <Editor />}
            <Tour />
            <Toast />
            <SaveDialog />
            <ExportDialog />
            <BatchExportDialog />
            <RestoreDialog />
            <VariationGrid />
            <SettingsDialog />
            <ConfirmDialog />
            <WhatsNewDialog />
            {closeRequested ? (
                <CloseDialog
                    onStay={() => {
                        setCloseRequested(false)
                        void cancelUpdateInstall()
                    }}
                    onClose={closeAfterBackup}
                />
            ) : null}
            {closing ? <ClosingDialog /> : null}
            <CommandPalette />
            <div className="visually-hidden" role="status" aria-live="polite">
                {announcement}
            </div>
        </div>
    )
}
