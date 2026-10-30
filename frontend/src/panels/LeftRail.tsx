import {useState} from 'react'
import {Segmented} from '../components/Segmented'
import {shownPresets} from '../assets/trees/presets'
import {findTreeGenerator} from '../assets/trees/tree-generators'
import {useEditorStore} from '../store/editor-store'
import {PartsPanel} from './PartsPanel'
import {PresetIcon} from './PresetIcon'

type RailMode = 'presets' | 'parts'

function PresetsPanel() {
    const presetId = useEditorStore((state) => state.presetId)
    const applyPreset = useEditorStore((state) => state.applyPreset)

    return (
        <>
            <div className="rail__title">Start from a tree</div>
            <div className="preset-grid" data-coach="presets">
                {shownPresets.map((preset) => (
                    <button
                        key={preset.id}
                        type="button"
                        className="preset-card"
                        aria-pressed={preset.id === presetId}
                        onClick={() => applyPreset(preset.id)}
                    >
                        <div className="preset-card__thumb">
                            <PresetIcon presetId={preset.id} />
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

export function LeftRail() {
    const [mode, setMode] = useState<RailMode>('presets')
    const generatorId = useEditorStore((state) => state.scene.assets[0]?.generatorId)

    // The parts library builds old-style limbs and blobs, which do not blend
    // into a painted tree. Its parts are edited on the tree itself.
    if (generatorId && findTreeGenerator(generatorId)?.paintsOwnColours) {
        return (
            <aside className="rail">
                <div className="rail__body">
                    <PresetsPanel />
                </div>
            </aside>
        )
    }

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
            <div className="rail__body">
                {mode === 'presets' ? <PresetsPanel /> : <PartsPanel />}
            </div>
        </aside>
    )
}
