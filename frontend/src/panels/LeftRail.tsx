import {useEffect, useState} from 'react'
import {Segmented} from '../components/Segmented'
import {treePresets} from '../assets/trees/presets'
import {useEditorStore} from '../store/editor-store'
import {buildPresetThumbnails, getPresetThumbnail} from '../viewport/thumbnailer'

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
    const style = useEditorStore((state) => state.style)
    const presetId = useEditorStore((state) => state.presetId)
    const applyPreset = useEditorStore((state) => state.applyPreset)

    const [thumbnails, setThumbnails] = useState<ReadonlyMap<string, string>>(
        () => new Map(treePresets.map((preset) => [preset.id, getPresetThumbnail(preset.id) ?? ''])),
    )

    useEffect(() => {
        let cancelled = false

        // The renders happen off the paint, so the panel appears immediately.
        requestAnimationFrame(() => {
            const built = buildPresetThumbnails(treePresets, style)
            if (!cancelled) {
                setThumbnails(new Map(built))
            }
        })

        return () => {
            cancelled = true
        }
    }, [style])

    return (
        <>
            <div className="rail__title">Start from a tree</div>
            <div className="preset-grid" data-coach="presets">
                {treePresets.map((preset) => (
                    <button
                        key={preset.id}
                        type="button"
                        className="preset-card"
                        aria-pressed={preset.id === presetId}
                        onClick={() => applyPreset(preset.id)}
                    >
                        <div className="preset-card__thumb">
                            {thumbnails.get(preset.id) ? (
                                <img
                                    className="preset-card__image"
                                    src={thumbnails.get(preset.id)}
                                    alt=""
                                />
                            ) : (
                                <TreeGlyph />
                            )}
                            <span className="preset-card__check" aria-hidden="true">
                                ✓
                            </span>
                        </div>
                        <div className="preset-card__meta">
                            <div className="preset-card__name">{preset.name}</div>
                            <div className="preset-card__sub">{preset.sub}</div>
                        </div>
                    </button>
                ))}
            </div>
        </>
    )
}

function PartsPanel() {
    return (
        <>
            <div className="rail__title">Add a part</div>
            <input
                className="search"
                type="search"
                placeholder="Search parts"
                aria-label="Search parts"
            />
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
