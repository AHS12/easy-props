/**
 * Home, in the manner of a project browser: recent props first, then a new one by
 * kind, then the presets for that kind.
 *
 * This is the first thing the app shows, so it answers two questions in one
 * breath: what have I got, and where do I start.
 */

import {Box, Brush, Pencil, RotateCcw, Search, Trash2, TreePine, X, type LucideIcon} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import {presetGroups, PROP_FAMILIES, type PropFamily} from '../assets/trees/presets'
import {canUndo} from '../core/history/history'
import {PresetThumb} from '../panels/PresetThumb'
import type {SavedTree} from '../platform/library'
import {useEditorStore} from '../store/editor-store'

const FAMILY_ICONS: Readonly<Record<PropFamily, LucideIcon>> = {tree: TreePine, rock: Box, bush: Brush}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Whole calendar days between two moments, so a DST change is still one day. */
function calendarDaysBetween(from: Date, to: Date): number {
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate())

    return Math.round((end.getTime() - start.getTime()) / DAY)
}

/** How long ago a tree was saved, in the fewest words that are still true. */
function savedLabel(savedAt: string, now: Date = new Date()): string {
    const saved = new Date(savedAt)
    const elapsed = now.getTime() - saved.getTime()

    if (Number.isNaN(elapsed) || elapsed < MINUTE) {
        return 'just now'
    }

    const minutes = Math.floor(elapsed / MINUTE)

    if (minutes < 60) {
        return `${minutes} min ago`
    }

    const hours = Math.floor(elapsed / HOUR)

    if (hours < 24) {
        return hours === 1 ? '1 hour ago' : `${hours} hours ago`
    }

    if (calendarDaysBetween(saved, now) === 1) {
        return 'yesterday'
    }

    return new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'short'}).format(saved)
}

function displayName(tree: SavedTree): string {
    const name = typeof tree.name === 'string' ? tree.name.trim() : ''

    return name === '' ? 'Untitled tree' : name
}

interface CardProps {
    tree: SavedTree
    current: boolean
    confirming: boolean
    onOpen(): void
    onAskDelete(): void
    onDelete(): void
    onCancel(): void
    onRename(name: string): void
}

/** One saved tree. The body opens it; delete is a sibling, not a nested button. */
function TreeCard({
    tree,
    current,
    confirming,
    onOpen,
    onAskDelete,
    onDelete,
    onCancel,
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

    if (confirming) {
        return (
            <li className="prop-tile prop-tile--confirm">
                <div
                    className="prop-tile__panel"
                    role="group"
                    aria-label={`Delete ${name}?`}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            event.preventDefault()
                            onCancel()
                        }
                    }}
                >
                    <p className="prop-tile__question">Delete “{name}”?</p>
                    <p className="dialog__hint">This cannot be undone.</p>
                    <div className="prop-tile__choices">
                        <button type="button" className="button" autoFocus onClick={onCancel}>
                            Keep it
                        </button>
                        <button type="button" className="button button--danger" onClick={onDelete}>
                            Delete
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
                    {tree.thumbnail ? (
                        <img src={tree.thumbnail} alt="" draggable={false} />
                    ) : (
                        <TreePine size={30} aria-hidden="true" />
                    )}
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
                    aria-label={`Delete ${name}`}
                    title="Delete"
                    onClick={onAskDelete}
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
    const treeName = useEditorStore((state) => state.treeName)
    const history = useEditorStore((state) => state.history)

    const [family, setFamily] = useState<PropFamily>('tree')
    const [search, setSearch] = useState('')
    const [confirmingId, setConfirmingId] = useState<string | null>(null)

    useEffect(() => {
        void refreshGallery()
        void refreshDraft()
    }, [refreshGallery, refreshDraft])

    const needle = search.trim().toLowerCase()

    const visible = useMemo(
        () => (needle === '' ? gallery : gallery.filter((tree) => displayName(tree).toLowerCase().includes(needle))),
        [gallery, needle],
    )

    // Only something opened or changed in this session is worth going back to.
    const inHand = currentTreeId !== null || canUndo(history)

    return (
        <main className="home">
            <div className="home__inner">
                <header className="home__head">
                    <div>
                        <h1 className="home__title">Make a prop for your game</h1>
                        <p className="home__sub">Start from a preset, shape it, and export it. No 3D experience needed.</p>
                    </div>
                    {inHand ? (
                        <button type="button" className="button" onClick={showEditor}>
                            <RotateCcw size={13} aria-hidden="true" />
                            Back to “{treeName}”
                        </button>
                    ) : null}
                </header>

                {draftAvailable ? (
                    <section className="home__draft">
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

                {gallery.length > 0 || galleryLoading ? (
                    <section className="home__section" aria-label="Recent props">
                        <div className="home__section-head">
                            <h2 className="home__section-title">Recent props</h2>
                            {gallery.length > 6 ? (
                                <div className="filter home__filter">
                                    <Search size={13} aria-hidden="true" className="filter__icon" />
                                    <input
                                        className="filter__input"
                                        placeholder="Search your props"
                                        aria-label="Search your props"
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                    />
                                    {search ? (
                                        <button type="button" className="filter__clear" aria-label="Clear search" onClick={() => setSearch('')}>
                                            <X size={12} aria-hidden="true" />
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>

                        {galleryLoading && gallery.length === 0 ? (
                            <p className="dialog__hint" role="status">
                                Looking for your props…
                            </p>
                        ) : visible.length === 0 ? (
                            <p className="dialog__hint">No prop by that name. Try a shorter word.</p>
                        ) : (
                            <ul className="tile-grid">
                                {visible.map((tree) => (
                                    <TreeCard
                                        key={tree.id}
                                        tree={tree}
                                        current={tree.id === currentTreeId}
                                        confirming={tree.id === confirmingId}
                                        onOpen={() => void openTree(tree.id)}
                                        onAskDelete={() => setConfirmingId(tree.id)}
                                        onDelete={() => {
                                            setConfirmingId(null)
                                            void removeTree(tree.id)
                                        }}
                                        onCancel={() => setConfirmingId(null)}
                                        onRename={(name) => void renameTree(tree.id, name)}
                                    />
                                ))}
                            </ul>
                        )}
                    </section>
                ) : null}

                <section className="home__section" aria-label="Start a new prop">
                    <div className="home__section-head">
                        <h2 className="home__section-title">Start a new prop</h2>
                        <div className="kind-tabs" role="tablist" aria-label="Kind of prop">
                            {PROP_FAMILIES.map(({id, label}) => {
                                const Icon = FAMILY_ICONS[id]

                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        role="tab"
                                        className="kind-tab"
                                        aria-selected={family === id}
                                        onClick={() => setFamily(id)}
                                    >
                                        <Icon size={14} aria-hidden="true" />
                                        {label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {presetGroups
                        .filter((group) => group.family === family)
                        .map((group) => (
                            <div key={group.title}>
                                {presetGroups.filter((other) => other.family === family).length > 1 ? (
                                    <h3 className="settings__group">{group.title}</h3>
                                ) : null}
                                <div className="preset-grid preset-grid--wide">
                                    {group.presets.map((preset) => (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            className="preset-card"
                                            title={preset.sub}
                                            onClick={() => startNewProp(preset.id)}
                                        >
                                            <PresetThumb presetId={preset.id} />
                                            <span className="preset-card__name">{preset.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                </section>
            </div>
        </main>
    )
}
