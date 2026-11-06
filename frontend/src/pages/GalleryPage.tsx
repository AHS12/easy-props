/**
 * Home, in the manner of a project browser: recent props first, then every kind of
 * prop as a card, then the presets for the chosen kind.
 *
 * This is the first thing the app shows, so it answers three questions in one
 * breath: what have I got, what can I make, and where do I start. Every kind is
 * on show, so nobody has to open a tab to learn there are cacti.
 */

import {ArchiveRestore, ChevronRight, Pencil, RotateCcw, Search, Trash2, X} from 'lucide-react'
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react'
import {familyOfPreset, presetGroups, PROP_FAMILIES, treePresets, type PropFamily, type TreePreset} from '../assets/trees/presets'
import {guardUnsaved} from '../core/commands/commands'
import {canUndo} from '../core/history/history'
import {PresetThumb} from '../panels/PresetThumb'
import type {SavedTree} from '../platform/library'
import {canBackUp} from '../platform/backup'
import {useUiStore} from '../store/ui-store'
import {useEditorStore} from '../store/editor-store'
import {displayName, FAMILY_ICONS, KIND_PICTURES, savedLabel} from './prop-labels'
import {PropPicture} from './prop-tile'

/** Home shows the latest saves in one row; Your props has the rest. */
const RECENT_MOST = 8

const ALL = 'All'

/** The kind chosen last, so coming back Home from a prop lands where it left. */
let lastFamily: PropFamily = 'tree'

const KINDS_IN_WORDS = (() => {
    const names = PROP_FAMILIES.map(({plural}) => plural.toLowerCase())

    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
})()

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** One preset to start from, as a picture and a name. */
function PresetCard({preset, onPick}: {preset: TreePreset; onPick(): void}) {
    return (
        <button type="button" className="preset-card" title={preset.sub} onClick={onPick}>
            <PresetThumb presetId={preset.id} />
            <span className="preset-card__name">{preset.name}</span>
        </button>
    )
}

interface CardProps {
    tree: SavedTree
    current: boolean
    onOpen(): void
    onRemove(): void
    onRename(name: string): void
}

/** One saved prop. The body opens it; the actions are siblings, not nested buttons. */
function TreeCard({
    tree,
    current,
    onOpen,
    onRemove,
    onRename,
}: CardProps) {
    const name = displayName(tree)
    const [renaming, setRenaming] = useState(false)
    const [draft, setDraft] = useState(name)

    const commitRename = () => {
        setRenaming(false)

        if (draft.trim() !== '' && draft.trim() !== name) {
            onRename(draft.trim())
        }
    }

    if (renaming) {
        return (
            <li className="prop-tile" data-current={current}>
                <div className="prop-tile__panel">
                    <label className="dialog__label" htmlFor={`rename-${tree.id}`}>
                        New name for {name}
                    </label>
                    <input
                        className="field"
                        id={`rename-${tree.id}`}
                        value={draft}
                        maxLength={60}
                        autoFocus
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault()
                                commitRename()
                            } else if (event.key === 'Escape') {
                                event.preventDefault()
                                setRenaming(false)
                            }
                        }}
                    />
                    <div className="prop-tile__choices">
                        <button type="button" className="button" onClick={() => setRenaming(false)}>
                            Cancel
                        </button>
                        <button type="button" className="button button--primary" onClick={commitRename}>
                            Rename
                        </button>
                    </div>
                </div>
            </li>
        )
    }

    return (
        <li className="prop-tile" data-current={current}>
            <button type="button" className="prop-tile__open" title={name} onClick={onOpen}>
                <span className="prop-tile__thumb">
                    <PropPicture tree={tree} />
                </span>
                <span className="prop-tile__name">{name}</span>
                <span className="prop-tile__meta">
                    {savedLabel(tree.savedAt)}
                    {current ? <span className="prop-tile__badge">Editing</span> : null}
                </span>
            </button>
            <div className="prop-tile__actions">
                <button
                    type="button"
                    className="icon-button icon-button--overlay"
                    aria-label={`Rename ${name}`}
                    title="Rename"
                    onClick={() => {
                        setDraft(name)
                        setRenaming(true)
                    }}
                >
                    <Pencil size={12} aria-hidden="true" />
                </button>
                <button
                    type="button"
                    className="icon-button icon-button--overlay"
                    aria-label={`Remove ${name}`}
                    title="Remove"
                    onClick={onRemove}
                >
                    <Trash2 size={12} aria-hidden="true" />
                </button>
            </div>
        </li>
    )
}

export function GalleryPage() {
    const gallery = useEditorStore((state) => state.gallery)
    const galleryLoading = useEditorStore((state) => state.galleryLoading)
    const refreshGallery = useEditorStore((state) => state.refreshGallery)
    const draftAvailable = useEditorStore((state) => state.draftAvailable)
    const refreshDraft = useEditorStore((state) => state.refreshDraft)
    const restoreDraft = useEditorStore((state) => state.restoreDraft)
    const discardDraft = useEditorStore((state) => state.discardDraft)
    const currentTreeId = useEditorStore((state) => state.currentTreeId)
    const startNewProp = useEditorStore((state) => state.startNewProp)
    const openTree = useEditorStore((state) => state.openTree)
    const renameTree = useEditorStore((state) => state.renameTree)
    const removeTree = useEditorStore((state) => state.removeTree)
    const showEditor = useEditorStore((state) => state.showEditor)
    const showProps = useEditorStore((state) => state.showProps)
    const treeName = useEditorStore((state) => state.treeName)
    const history = useEditorStore((state) => state.history)
    const propInHand = useEditorStore((state) => state.propInHand)

    const [family, setFamilyState] = useState<PropFamily>(lastFamily)
    const [category, setCategory] = useState(ALL)
    const [query, setQuery] = useState('')
    const [perRow, setPerRow] = useState(RECENT_MOST)
    const recentList = useRef<HTMLDivElement>(null)

    useEffect(() => {
        void refreshGallery()
        void refreshDraft()
    }, [refreshGallery, refreshDraft])

    const hasProps = gallery.length > 0

    // One row of the latest saves, as many as fit across, so Home stays a start page.
    useLayoutEffect(() => {
        const list = recentList.current

        if (!list) {
            return
        }

        // The grid fills the row with as many columns as fit, whether or not there
        // are tiles for them, so its column count is the answer at any interface scale.
        const measure = () => {
            const grid = list.querySelector('.tile-grid')
            const across = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : RECENT_MOST

            setPerRow(Math.max(1, Math.min(RECENT_MOST, across)))
        }

        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(list)

        return () => observer.disconnect()
    }, [hasProps])

    const recent = gallery.slice(0, perRow)

    // Drawn now, so pictures are ready by the time someone opens Your props.
    useEffect(() => {
        void useEditorStore.getState().drawMissingPictures()
    }, [gallery])

    // Only something opened or changed in this session is worth going back to.
    const inHand = propInHand || canUndo(history)

    const setFamily = (next: PropFamily) => {
        lastFamily = next
        setFamilyState(next)
        setCategory(ALL)
    }

    const pick = (id: string) => guardUnsaved(useEditorStore.getState(), 'Start a new prop', () => startNewProp(id))
    const groups = presetGroups.filter((group) => group.family === family && group.presets.length > 0)
    const shownGroups = category === ALL ? groups : groups.filter((group) => group.title === category)
    const wanted = query.trim().toLowerCase()

    // A search looks through every kind, as someone typing "cactus" should not have to find its card first.
    const found = useMemo(
        () =>
            wanted === ''
                ? []
                : PROP_FAMILIES.map(({id, plural}) => ({
                      title: plural,
                      presets: treePresets.filter(
                          (preset) =>
                              familyOfPreset(preset.id) === id &&
                              `${preset.name} ${preset.sub} ${preset.category ?? ''} ${plural}`.toLowerCase().includes(wanted),
                      ),
                  })).filter((group) => group.presets.length > 0),
        [wanted],
    )

    const recentSection = (
        <section className="home__section" aria-label="Recent props" data-coach="gallery-recent">
            <div className="home__section-head">
                <h2 className="home__section-title">Recent props</h2>
                {gallery.length > 0 ? (
                    <button type="button" className="button" onClick={showProps}>
                        All your props ({gallery.length})
                        <ChevronRight size={13} aria-hidden="true" />
                    </button>
                ) : null}
            </div>

            {galleryLoading && gallery.length === 0 ? (
                <p className="dialog__hint" role="status">
                    Looking for your props…
                </p>
            ) : gallery.length === 0 ? (
                <div className="home__empty">
                    <p className="dialog__hint">Props you save show up here.</p>
                    {canBackUp() ? (
                        <button type="button" className="button" onClick={() => useUiStore.getState().openSettings('Backup')}>
                            <ArchiveRestore size={13} aria-hidden="true" />
                            Bring back props from a backup
                        </button>
                    ) : null}
                </div>
            ) : (
                <div ref={recentList}>
                    <ul className="tile-grid">
                        {recent.map((tree) => (
                            <TreeCard
                                key={tree.id}
                                tree={tree}
                                current={tree.id === currentTreeId}
                                onOpen={() => void openTree(tree.id)}
                                onRemove={() => void removeTree(tree.id)}
                                onRename={(name) => void renameTree(tree.id, name)}
                            />
                        ))}
                    </ul>
                </div>
            )}
        </section>
    )

    return (
        <main className="home">
            <div className="home__inner">
                <header className="home__head">
                    <div>
                        <h1 className="home__title">Make a prop for your game</h1>
                        <p className="home__sub">
                            {sentenceCase(KINDS_IN_WORDS)}, from {treePresets.length} presets. Shape one, then export it with its
                            detail levels, painted or low-poly. No 3D experience needed.
                        </p>
                    </div>
                    {inHand ? (
                        <button type="button" className="button" onClick={showEditor}>
                            <RotateCcw size={13} aria-hidden="true" />
                            Back to “{treeName}”
                        </button>
                    ) : null}
                </header>

                {draftAvailable ? (
                    <section className="home__draft" data-coach="gallery-draft">
                        <div>
                            <h2 className="home__draft-title">You left some work unsaved</h2>
                            <p className="dialog__hint">The app closed before you saved. Pick it up, or let it go.</p>
                        </div>
                        <div className="home__draft-actions">
                            <button type="button" className="button" onClick={() => void discardDraft()}>
                                Discard it
                            </button>
                            <button type="button" className="button button--primary" onClick={() => void restoreDraft()}>
                                Pick up where I left off
                            </button>
                        </div>
                    </section>
                ) : null}

                {/* Someone with no props yet meets the presets first, not an empty shelf. */}
                {hasProps || galleryLoading ? recentSection : null}

                <section className="home__section" aria-label="Start a new prop">
                    <div className="home__section-head">
                        <h2 className="home__section-title">Start a new prop</h2>
                        <div className="filter home__filter" data-coach="gallery-search">
                            <Search size={13} aria-hidden="true" className="filter__icon" />
                            <input
                                className="filter__input"
                                placeholder="Search every preset"
                                aria-label="Search every preset"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape' && query) {
                                        event.stopPropagation()
                                        setQuery('')
                                    }
                                }}
                            />
                            {query ? (
                                <button type="button" className="filter__clear" aria-label="Clear search" onClick={() => setQuery('')}>
                                    <X size={12} aria-hidden="true" />
                                </button>
                            ) : null}
                        </div>
                    </div>

                    {wanted !== '' ? (
                        found.length === 0 ? (
                            <p className="dialog__hint">No preset by that name. Try a shorter word.</p>
                        ) : (
                            found.map((group) => (
                                <div key={group.title}>
                                    <h3 className="settings__group">{group.title}</h3>
                                    <div className="preset-grid preset-grid--wide">
                                        {group.presets.map((preset) => (
                                            <PresetCard key={preset.id} preset={preset} onPick={() => pick(preset.id)} />
                                        ))}
                                    </div>
                                </div>
                            ))
                        )
                    ) : (
                        <>
                            <div className="kind-cards" role="tablist" aria-label="Kind of prop" data-coach="gallery-kinds">
                                {PROP_FAMILIES.map(({id, plural}) => {
                                    const Icon = FAMILY_ICONS[id]
                                    const count = presetGroups
                                        .filter((group) => group.family === id && group.title !== 'Favourites')
                                        .reduce((sum, group) => sum + group.presets.length, 0)

                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            role="tab"
                                            className="kind-card"
                                            aria-selected={family === id}
                                            onClick={() => setFamily(id)}
                                        >
                                            <PresetThumb presetId={KIND_PICTURES[id]} />
                                            <span className="kind-card__label">
                                                <Icon size={14} aria-hidden="true" />
                                                {plural}
                                                <span className="kind-card__count tabular">{count}</span>
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>

                            {groups.length > 1 ? (
                                <div className="chips" role="group" aria-label="Narrow the presets">
                                    {[ALL, ...groups.map((group) => group.title)].map((title) => (
                                        <button
                                            key={title}
                                            type="button"
                                            className="chip"
                                            aria-pressed={category === title}
                                            onClick={() => setCategory(title)}
                                        >
                                            {title}
                                        </button>
                                    ))}
                                </div>
                            ) : null}

                            {shownGroups.map((group, index) => (
                                <div key={group.title} data-coach={index === 0 ? 'gallery-presets' : undefined}>
                                    {shownGroups.length > 1 ? <h3 className="settings__group">{group.title}</h3> : null}
                                    <div className="preset-grid preset-grid--wide">
                                        {group.presets.map((preset) => (
                                            <PresetCard key={preset.id} preset={preset} onPick={() => pick(preset.id)} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </section>

                {hasProps || galleryLoading ? null : recentSection}
            </div>
        </main>
    )
}
