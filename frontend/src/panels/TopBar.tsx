import {Segmented} from '../components/Segmented'
import {STYLE_ORDER, STYLE_PROFILES, type StyleProfileId} from '../assets/style/style-profiles'
import {canRedo, canUndo, redoLabel, undoLabel} from '../core/history/history'
import {useEditorStore} from '../store/editor-store'
import {useThemeStore} from '../store/theme-store'

const COMING_SOON = 'Coming soon'

function SunIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
    )
}

function MoonIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
    )
}

export function TopBar() {
    const style = useEditorStore((state) => state.style)
    const setStyle = useEditorStore((state) => state.setStyle)
    const history = useEditorStore((state) => state.history)
    const undo = useEditorStore((state) => state.undo)
    const saveTree = useEditorStore((state) => state.saveTree)
    const showGallery = useEditorStore((state) => state.showGallery)
    const exportModel = useEditorStore((state) => state.exportModel)
    const redo = useEditorStore((state) => state.redo)
    const theme = useThemeStore((state) => state.theme)
    const toggleTheme = useThemeStore((state) => state.toggle)

    const themeLabel = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'

    const undoTitle = undoLabel(history) ? `Undo: ${undoLabel(history)}` : 'Nothing to undo'
    const redoTitle = redoLabel(history) ? `Redo: ${redoLabel(history)}` : 'Nothing to redo'

    return (
        <header className="topbar">
            <div className="brand">
                <span className="brand__mark" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22V11" />
                        <path d="M12 11c0-3 2.2-5 5-5 0 3-2 5-5 5z" />
                        <path d="M12 15c0-3-2.2-5-5-5 0 3 2 5 5 5z" />
                    </svg>
                </span>
                <span className="brand__name">easy-props</span>
            </div>

            <nav className="family-tabs" aria-label="Asset type">
                <button type="button" className="family-tab" aria-current="true">
                    Tree
                </button>
                <button type="button" className="family-tab" disabled title={COMING_SOON}>
                    Rock
                </button>
                <button type="button" className="family-tab" disabled title={COMING_SOON}>
                    Bush
                </button>
            </nav>

            <span className="topbar__divider" aria-hidden="true" />

            <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={toggleTheme}
                aria-label={themeLabel}
                title={themeLabel}
            >
                {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            </button>

            <div className="topbar__spacer" />

            <Segmented<StyleProfileId>
                label="Style"
                value={style}
                onChange={setStyle}
                options={STYLE_ORDER.map((id) => ({value: id, label: STYLE_PROFILES[id].label}))}
            />

            <div className="topbar__spacer" />

            <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={undo}
                disabled={!canUndo(history)}
                title={undoTitle}
                aria-label="Undo"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7v6h6" />
                    <path d="M3.5 13a9 9 0 1 0 2.3-9.3L3 7" />
                </svg>
            </button>
            <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={redo}
                disabled={!canRedo(history)}
                title={redoTitle}
                aria-label="Redo"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 7v6h-6" />
                    <path d="M20.5 13a9 9 0 1 1-2.3-9.3L21 7" />
                </svg>
            </button>

            <button
                type="button"
                className="btn btn--secondary"
                title="Your saved props"
                onClick={showGallery}
            >
                My props
            </button>
            <button
                type="button"
                className="btn btn--secondary"
                title="Save to your trees (Ctrl+S)"
                onClick={() => void saveTree()}
            >
                Save
            </button>
            <button
                type="button"
                className="btn btn--primary"
                title="Export for a game engine (Ctrl+E)"
                onClick={() => exportModel()}
            >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12" />
                    <path d="M7 10l5 5 5-5" />
                    <path d="M4 20h16" />
                </svg>
                Export
            </button>
        </header>
    )
}
