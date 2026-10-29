import {Segmented} from '../components/Segmented'
import {STYLE_ORDER, STYLE_PROFILES, type StyleProfileId} from '../assets/style/style-profiles'
import {useEditorStore} from '../store/editor-store'

const COMING_SOON = 'Coming soon'

export function TopBar() {
    const style = useEditorStore((state) => state.style)
    const setStyle = useEditorStore((state) => state.setStyle)

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
                disabled
                title={COMING_SOON}
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
                disabled
                title={COMING_SOON}
                aria-label="Redo"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 7v6h-6" />
                    <path d="M20.5 13a9 9 0 1 1-2.3-9.3L21 7" />
                </svg>
            </button>

            <button type="button" className="btn btn--secondary" disabled title={COMING_SOON}>
                Save project
            </button>
            <button type="button" className="btn btn--primary" disabled title={COMING_SOON}>
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
