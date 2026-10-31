import {useState} from 'react'
import {LEVEL_SHARES} from '../core/export/pipeline/types'
import {Slider} from '../components/Slider'
import {
    SHADING_MODES,
    SHADING_MODE_HELP,
    SHADING_MODE_LABELS,
    type ShadingMode,
} from '../assets/style/shading'
import {TIME_OF_DAY, TIME_OF_DAY_LABELS, type TimeOfDay} from '../assets/style/lighting'
import {useEditorStore} from '../store/editor-store'
import {SunDial} from './SunDial'

function SunIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </svg>
    )
}

function ModeIcon({mode}: {mode: ShadingMode}) {
    if (mode === 'wind') {
        return (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h6" />
            </svg>
        )
    }

    if (mode === 'wireframe') {
        return (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                <path d="M12 2.5 21 7v10l-9 4.5L3 17V7z" />
                <path d="M3 7l9 4.5L21 7M12 11.5V21M12 2.5V11" />
            </svg>
        )
    }

    if (mode === 'flat') {
        return (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <circle cx="12" cy="12" r="8.5" fill="currentColor" stroke="none" opacity="0.25" />
                <circle cx="12" cy="12" r="8.5" />
            </svg>
        )
    }

    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="10" r="4.2" />
            <path d="M12 14.5V21M9 21h6" />
        </svg>
    )
}

/** The time of day the lighting exactly matches, if any. */
function matchingTime(azimuth: number, elevation: number): TimeOfDay | null {
    for (const [time, preset] of Object.entries(TIME_OF_DAY)) {
        if (
            Math.abs(preset.azimuth - azimuth) < 0.5 &&
            Math.abs(preset.elevation - elevation) < 0.5
        ) {
            return time as TimeOfDay
        }
    }

    return null
}

/** The four-way arrow everyone reads as "move". */
function MoveIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v18M3 12h18" />
            <path d="M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5" />
            <path d="M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
        </svg>
    )
}

export function ViewportOverlay() {
    const shadingMode = useEditorStore((state) => state.shadingMode)
    const setShadingMode = useEditorStore((state) => state.setShadingMode)
    const previewLevel = useEditorStore((state) => state.previewLevel)
    const setPreviewLevel = useEditorStore((state) => state.setPreviewLevel)
    const lighting = useEditorStore((state) => state.lighting)
    const setLighting = useEditorStore((state) => state.setLighting)
    const setTimeOfDay = useEditorStore((state) => state.setTimeOfDay)
    const moveTool = useEditorStore((state) => state.moveTool)
    const setMoveTool = useEditorStore((state) => state.setMoveTool)

    const [sunOpen, setSunOpen] = useState(false)

    const activeTime = matchingTime(lighting.azimuth, lighting.elevation)

    return (
        <div className="viewport-tools">
            <div className="viewport-tools__row">
                <button
                    type="button"
                    className="tool"
                    aria-expanded={sunOpen}
                    aria-label="Sun and shadow"
                    title="Sun and shadow"
                    onClick={() => setSunOpen((open) => !open)}
                >
                    <SunIcon />
                </button>

                <div className="tool-group" role="group" aria-label="Move tool">
                    <button
                        type="button"
                        className="tool"
                        aria-pressed={moveTool}
                        aria-label="Move part"
                        title="Move — drag an arrow to move the selected part along that axis"
                        onClick={() => setMoveTool(!moveTool)}
                    >
                        <MoveIcon />
                    </button>
                </div>

                <div className="tool-group" role="group" aria-label="Detail level">
                    {LEVEL_SHARES.map((_, level) => (
                        <button
                            key={level}
                            type="button"
                            className="tool"
                            aria-pressed={level === previewLevel}
                            title={`Detail level ${level} (LOD${level})`}
                            onClick={() => setPreviewLevel(level)}
                        >
                            {level}
                        </button>
                    ))}
                </div>

                <div className="tool-group" role="group" aria-label="How the tree is drawn">
                    {SHADING_MODES.map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            className="tool"
                            aria-pressed={mode === shadingMode}
                            aria-label={SHADING_MODE_LABELS[mode]}
                            title={`${SHADING_MODE_LABELS[mode]} — ${SHADING_MODE_HELP[mode]}`}
                            onClick={() => setShadingMode(mode)}
                        >
                            <ModeIcon mode={mode} />
                        </button>
                    ))}
                </div>
            </div>

            {sunOpen ? (
                <div className="sun-panel">
                    <div className="sun-panel__dial">
                        <SunDial lighting={lighting} onChange={setLighting} />
                        <p className="sun-panel__caption">Drag to move the sun</p>
                    </div>

                    <div className="field">
                        <div className="field__label">
                            <span>Time of day</span>
                        </div>
                        <div className="time-grid">
                            {(Object.keys(TIME_OF_DAY) as TimeOfDay[]).map((time) => (
                                <button
                                    key={time}
                                    type="button"
                                    className="time-btn"
                                    aria-pressed={activeTime === time}
                                    onClick={() => setTimeOfDay(time)}
                                >
                                    {TIME_OF_DAY_LABELS[time]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <Slider
                        label="Shadow"
                        value={lighting.shadowStrength}
                        min={0}
                        max={1}
                        step={0.05}
                        minLabel="None"
                        maxLabel="Full"
                        onChange={(value) => setLighting({...lighting, shadowStrength: value})}
                    />
                </div>
            ) : null}
        </div>
    )
}
