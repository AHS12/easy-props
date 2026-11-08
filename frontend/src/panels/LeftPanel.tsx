import {ListTree, Puzzle, Search, Shapes, X} from 'lucide-react'
import {useEffect, useState} from 'react'
import {familyOfPreset, presetGroups, PROP_FAMILIES} from '../assets/trees/presets'
import {findPropGenerator} from '../assets/prop-generators'
import {useEditorStore} from '../store/editor-store'
import {useUiStore} from '../store/ui-store'
import {Outliner} from './Outliner'
import {PartsPanel} from './PartsPanel'
import {PresetThumb} from './PresetThumb'
import {displayName} from '../pages/prop-labels'
import {PropPicture} from '../pages/prop-tile'

function PresetsPanel() {
    const presetId = useEditorStore((state) => state.presetId)
    const applyPreset = useEditorStore((state) => state.applyPreset)
    const applyStartingPoint = useEditorStore((state) => state.applyStartingPoint)
    const gallery = useEditorStore((state) => state.gallery)

    // My presets are saved props, which the app may not have listed yet if it opened straight here.
    useEffect(() => {
        void useEditorStore.getState().refreshGallery()
    }, [])
    const [query, setQuery] = useState('')
    const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
    const wanted = query.trim().toLowerCase()
    const family = familyOfPreset(presetId)
    const plural = PROP_FAMILIES.find(({id}) => id === family)!.plural.toLowerCase()
    const groups = presetGroups
        .filter((group) => group.family === family)
        .map((group) => ({
            ...group,
            presets: group.presets.filter((preset) =>
                `${preset.name} ${preset.sub} ${group.title}`.toLowerCase().includes(wanted),
            ),
        }))
        .filter((group) => group.presets.length > 0)
    const startingPoints = gallery.filter(
        (tree) => tree.startingPoint && tree.kind === family && displayName(tree).toLowerCase().includes(wanted),
    )
    const MINE = 'My presets'

    const toggle = (title: string) => {
        const next = new Set(closed)

        if (!next.delete(title)) {
            next.add(title)
        }

        setClosed(next)
    }

    return (
        <>
            <div className="filter filter--panel">
                <Search size={13} aria-hidden="true" className="filter__icon" />
                <input
                    className="filter__input"
                    placeholder={`Search ${plural}`}
                    aria-label={`Search ${plural}`}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />
                {query ? (
                    <button type="button" className="filter__clear" aria-label="Clear search" onClick={() => setQuery('')}>
                        <X size={12} aria-hidden="true" />
                    </button>
                ) : null}
            </div>
            <div className="panel__scroll" data-coach="presets">
                {startingPoints.length > 0 ? (
                    <section className="preset-group">
                        <h3 className="group__heading">
                            <button
                                type="button"
                                className="group__head"
                                aria-expanded={wanted !== '' || !closed.has(MINE)}
                                data-open={wanted !== '' || !closed.has(MINE)}
                                onClick={() => toggle(MINE)}
                            >
                                <span className="group__chevron-text" aria-hidden="true">
                                    ›
                                </span>
                                <span>{MINE}</span>
                                <span className="group__count tabular">{startingPoints.length}</span>
                            </button>
                        </h3>
                        {wanted !== '' || !closed.has(MINE) ? (
                            <div className="preset-grid">
                                {startingPoints.map((tree) => (
                                    <button
                                        key={tree.id}
                                        type="button"
                                        className="preset-card"
                                        title="One of your own presets"
                                        onClick={() => void applyStartingPoint(tree.id)}
                                    >
                                        <span className="preset-card__thumb" data-pictured={tree.thumbnail ? true : undefined}>
                                            <PropPicture tree={tree} />
                                        </span>
                                        <span className="preset-card__name">{displayName(tree)}</span>
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </section>
                ) : null}
                {groups.map((group) => {
                    const open = wanted !== '' || !closed.has(group.title)

                    return (
                        <section className="preset-group" key={group.title}>
                            <h3 className="group__heading">
                                <button
                                    type="button"
                                    className="group__head"
                                    aria-expanded={open}
                                    data-open={open}
                                    onClick={() => toggle(group.title)}
                                >
                                    <span className="group__chevron-text" aria-hidden="true">
                                        ›
                                    </span>
                                    <span>{group.title}</span>
                                    <span className="group__count tabular">{group.presets.length}</span>
                                </button>
                            </h3>
                            {open ? (
                                <div className="preset-grid">
                                    {group.presets.map((preset) => (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            className="preset-card"
                                            title={preset.sub}
                                            aria-pressed={preset.id === presetId}
                                            onClick={() => applyPreset(preset.id)}
                                        >
                                            <PresetThumb presetId={preset.id} />
                                            <span className="preset-card__name">{preset.name}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </section>
                    )
                })}
                {groups.length === 0 && startingPoints.length === 0 ? <p className="panel-empty">Nothing matches that. Try a shorter word.</p> : null}
            </div>
        </>
    )
}

export function LeftPanel() {
    const stored = useUiStore((state) => state.leftTab)
    const setTab = useUiStore((state) => state.setLeftTab)
    const generatorId = useEditorStore((state) => state.scene.assets[0]?.generatorId)

    // The parts library builds old-style limbs and blobs, which do not blend
    // into a painted tree. Its parts are edited on the tree itself.
    const hasLibrary = !(generatorId && findPropGenerator(generatorId)?.paintsOwnColours)
    const tab = stored === 'parts' && !hasLibrary ? 'presets' : stored

    const tabs = [
        {id: 'presets' as const, label: 'Presets', icon: Shapes},
        {id: 'outliner' as const, label: 'Outliner', icon: ListTree},
        ...(hasLibrary ? [{id: 'parts' as const, label: 'Parts', icon: Puzzle}] : []),
    ]

    return (
        <aside className="panel left-panel" aria-label="Presets and outliner">
            <div className="tabs" role="tablist" aria-label="What to browse">
                {tabs.map(({id, label, icon: Icon}) => (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        className="tab"
                        aria-selected={tab === id}
                        data-coach={id === 'outliner' ? 'outliner' : undefined}
                        onClick={() => setTab(id)}
                    >
                        <Icon size={13} aria-hidden="true" />
                        {label}
                    </button>
                ))}
            </div>
            <div className="panel__content" role="tabpanel" aria-label={tab}>
                {tab === 'presets' ? <PresetsPanel /> : null}
                {tab === 'outliner' ? <Outliner /> : null}
                {tab === 'parts' ? (
                    <div className="panel__scroll panel__scroll--padded">
                        <PartsPanel />
                    </div>
                ) : null}
            </div>
        </aside>
    )
}
