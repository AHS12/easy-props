import {useState} from 'react'
import {Segmented} from '../components/Segmented'
import {presetGroups} from '../assets/trees/presets'
import {findTreeGenerator} from '../assets/trees/tree-generators'
import {useEditorStore} from '../store/editor-store'
import {PartsPanel} from './PartsPanel'
import {PresetThumb} from './PresetThumb'

type RailMode = 'presets' | 'parts'

function PresetsPanel() {
    const presetId = useEditorStore((state) => state.presetId)
    const applyPreset = useEditorStore((state) => state.applyPreset)
    const [query, setQuery] = useState('')
    const wanted = query.trim().toLowerCase()
    const groups = presetGroups
        .map((group) => ({
            ...group,
            presets: group.presets.filter((preset) =>
                `${preset.name} ${preset.sub} ${group.title}`.toLowerCase().includes(wanted),
            ),
        }))
        .filter((group) => group.presets.length > 0)

    return (
        <>
            <div className="rail__title">Start from a tree</div>
            <input
                className="search preset-search"
                type="search"
                placeholder="Search trees"
                aria-label="Search trees"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
            />
            <div data-coach="presets">
                {groups.map((group) => (
                    <section key={group.title}>
                        <h3 className="preset-heading">{group.title}</h3>
                        <div className="preset-grid">
                            {group.presets.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    className="preset-card"
                                    aria-pressed={preset.id === presetId}
                                    onClick={() => applyPreset(preset.id)}
                                >
                                    <PresetThumb presetId={preset.id} />
                                    <div className="preset-card__meta">
                                        <div className="preset-card__name">{preset.name}</div>
                                        <div className="preset-card__sub">{preset.sub}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>
                ))}
                {groups.length === 0 ? <p className="group__help">No tree matches that.</p> : null}
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
