import {useState} from 'react'
import {Segmented} from '../components/Segmented'

type RailMode = 'presets' | 'parts'

function TreeGlyph() {
    return (
        <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M32 56V28" />
            <path d="M32 34c0-7 5-11 11-11 0 7-5 11-11 11z" />
            <path d="M32 42c0-7-5-11-11-11 0 7 5 11 11 11z" />
        </svg>
    )
}

function PresetsPanel() {
    return (
        <>
            <div className="rail__title">Start from a tree</div>
            <div className="empty">
                <TreeGlyph />
                <h4>A gallery of trees is on the way</h4>
                <p>
                    Ready-made trees will appear here. For now, shape the tree in the
                    viewport.
                </p>
            </div>
        </>
    )
}

function PartsPanel() {
    return (
        <>
            <div className="rail__title">Add a part</div>
            <input className="search" type="search" placeholder="Search parts" aria-label="Search parts" />
            <div className="empty">
                <TreeGlyph />
                <h4>A library of parts is on the way</h4>
                <p>Trunks, branches, roots, and leaf clumps will appear here.</p>
            </div>
        </>
    )
}

export function LeftRail() {
    const [mode, setMode] = useState<RailMode>('presets')

    return (
        <aside className="rail">
            <div className="rail__switch">
                <Segmented<RailMode>
                    label="What to browse"
                    value={mode}
                    onChange={setMode}
                    wide
                    options={[
                        {value: 'presets', label: 'Presets'},
                        {value: 'parts', label: 'Parts'},
                    ]}
                />
            </div>
            <div className="rail__body">{mode === 'presets' ? <PresetsPanel /> : <PartsPanel />}</div>
        </aside>
    )
}
