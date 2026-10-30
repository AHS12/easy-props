/**
 * The start page: the trees you have made, and ways to make another.
 *
 * This is the first thing the app shows, so it answers two questions in one
 * breath — what have I got, and where do I start — without a menu.
 */

import {useEffect, useMemo, useState} from 'react'
import {treePresets} from '../assets/trees/presets'
import {DEFAULT_PRESET_ID} from '../core/scene/initial-scene'
import {PresetIcon} from '../panels/PresetIcon'
import type {SavedTree} from '../platform/library'
import {useEditorStore} from '../store/editor-store'
import '../styles/gallery-page.css'

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

function TreeGlyph({size = 34}: {size?: number}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M12 3.5 17 11H7z" />
            <path d="M12 8.5 18.5 16H5.5z" />
            <path d="M12 16v4.5" />
        </svg>
    )
}

interface CardProps {
    tree: SavedTree
    current: boolean
    confirming: boolean
    onOpen(): void
    onAskDelete(): void
    onDelete(): void
    onCancel(): void
}

/** One saved tree. The body opens it; delete is a sibling, not a nested button. */
function TreeCard({tree, current, confirming, onOpen, onAskDelete, onDelete, onCancel}: CardProps) {
    const name = displayName(tree)

    if (confirming) {
        return (
            <li className="gallery-card home-card home-card--confirming" data-current="false">
                <div
                    className="gallery-card__confirm"
                    role="group"
                    aria-label={`Delete ${name}?`}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            event.preventDefault()
                            onCancel()
                        }
                    }}
                >
                    <p className="gallery-card__question">Delete “{name}”?</p>
                    <p className="home-card__note">This cannot be undone.</p>
                    <div className="gallery-card__choices">
                        <button type="button" className="btn btn--danger btn--sm" onClick={onDelete}>
                            Delete
                        </button>
                        <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            autoFocus
                            onClick={onCancel}
                        >
                            Keep it
                        </button>
                    </div>
                </div>
            </li>
        )
    }

    return (
        <li className="gallery-card home-card" data-current={current ? 'true' : 'false'}>
            <button type="button" className="gallery-card__open" title={name} onClick={onOpen}>
                <span className="gallery-card__thumb">
                    {tree.thumbnail ? (
                        <img className="gallery-card__image" src={tree.thumbnail} alt="" />
                    ) : (
                        <span className="home-card__placeholder">
                            <TreeGlyph />
                        </span>
                    )}
                </span>
                <span className="gallery-card__meta">
                    <span className="gallery-card__name">{name}</span>
                    <span className="gallery-card__foot">
                        <span className="gallery-card__time">{savedLabel(tree.savedAt)}</span>
                        {current ? <span className="gallery-card__badge">Editing</span> : null}
                    </span>
                </span>
            </button>
            <button
                type="button"
                className="gallery-card__delete"
                aria-label={`Delete ${name}`}
                title={`Delete ${name}`}
                onClick={onAskDelete}
            >
                <span aria-hidden="true">×</span>
            </button>
        </li>
    )
}

export function GalleryPage() {
    const gallery = useEditorStore((state) => state.gallery)
    const galleryLoading = useEditorStore((state) => state.galleryLoading)
    const refreshGallery = useEditorStore((state) => state.refreshGallery)
    const currentTreeId = useEditorStore((state) => state.currentTreeId)
    const treeName = useEditorStore((state) => state.treeName)
    const setTreeName = useEditorStore((state) => state.setTreeName)
    const applyPreset = useEditorStore((state) => state.applyPreset)
    const openTree = useEditorStore((state) => state.openTree)
    const removeTree = useEditorStore((state) => state.removeTree)
    const showEditor = useEditorStore((state) => state.showEditor)

    const [search, setSearch] = useState('')
    const [confirmingId, setConfirmingId] = useState<string | null>(null)

    useEffect(() => {
        void refreshGallery()
    }, [refreshGallery])

    const start = (presetId: string, name: string) => {
        setTreeName(name)
        applyPreset(presetId)
    }

    const needle = search.trim().toLowerCase()

    const visible = useMemo(
        () =>
            needle === ''
                ? gallery
                : gallery.filter((tree) => displayName(tree).toLowerCase().includes(needle)),
        [gallery, needle],
    )

    return (
        <main className="home">
            <header className="home__bar">
                <div className="home__brand">
                    <span className="home__mark" aria-hidden="true">
                        <TreeGlyph size={22} />
                    </span>
                    <span className="home__wordmark">easy-props</span>
                </div>

                <div className="home__actions">
                    <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={showEditor}
                        title="Back to the tree you were editing"
                    >
                        Keep editing
                    </button>
                    <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => start(DEFAULT_PRESET_ID, treePresets[0].name)}
                    >
                        New tree
                    </button>
                </div>
            </header>

            <div className="home__body">
                <section className="home__section">
                    <div className="home__heading">
                        <div>
                            <h1 className="home__title">Your trees</h1>
                            <p className="home__sub">
                                {currentTreeId === null
                                    ? 'Save a tree and it lives here, ready to open again.'
                                    : `You are editing “${treeName}”.`}
                            </p>
                        </div>

                        {gallery.length > 3 ? (
                            <div className="gallery-search home__search">
                                <input
                                    className="search"
                                    type="search"
                                    placeholder="Search your trees"
                                    aria-label="Search your trees"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                />
                                {search !== '' ? (
                                    <button
                                        type="button"
                                        className="gallery-search__clear"
                                        aria-label="Clear search"
                                        title="Clear search"
                                        onClick={() => setSearch('')}
                                    >
                                        <span aria-hidden="true">×</span>
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
                    </div>

                    {galleryLoading && gallery.length === 0 ? (
                        <p className="gallery-note" role="status">
                            Looking for your trees…
                        </p>
                    ) : gallery.length === 0 ? (
                        <div className="home__blank">
                            <span className="home__blank-icon">
                                <TreeGlyph size={40} />
                            </span>
                            <h2>Nothing saved yet</h2>
                            <p>
                                Pick a tree below, make it yours, then press{' '}
                                <kbd>Ctrl</kbd> <span aria-hidden="true">+</span> <kbd>S</kbd> to
                                keep it here.
                            </p>
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="home__blank">
                            <h2>No tree by that name</h2>
                            <p>Try a shorter word.</p>
                            <button
                                type="button"
                                className="btn btn--secondary btn--sm"
                                onClick={() => setSearch('')}
                            >
                                Clear search
                            </button>
                        </div>
                    ) : (
                        <ul className="gallery-grid home__grid">
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
                                />
                            ))}
                        </ul>
                    )}
                </section>

                <section className="home__section home__section--start">
                    <div className="home__heading">
                        <div>
                            <h2 className="home__title home__title--small">Start a new tree</h2>
                            <p className="home__sub">
                                Every tree begins somewhere. You can change everything after.
                            </p>
                        </div>
                    </div>

                    <div className="preset-grid home__presets">
                        {treePresets.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                className="preset-card"
                                title={preset.sub}
                                onClick={() => start(preset.id, preset.name)}
                            >
                                <div className="preset-card__thumb">
                                    <PresetIcon presetId={preset.id} />
                                </div>
                                <div className="preset-card__meta">
                                    <div className="preset-card__name">{preset.name}</div>
                                    <div className="preset-card__sub">{preset.sub}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            </div>
        </main>
    )
}
