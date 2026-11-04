/**
 * Every saved prop, in the manner of a file browser with a preview: a grid to
 * find one, and a panel beside it saying what it is, with what can be done to
 * it without opening it.
 *
 * Removing moves a prop to the bin, so nothing here asks first: Undo is in the
 * message, and Recently removed at the end of the list puts anything back.
 */

import {ArrowLeft, Check, Copy, Download, FolderOpen, Pencil, Search, Trash2, X} from 'lucide-react'
import {useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent} from 'react'
import {PROP_FAMILIES, type PropFamily} from '../assets/trees/presets'
import {Select} from '../components/controls'
import {groupByTime, matchesSearch, sortProps, type PropSort} from '../core/library/prop-summary'
import type {SavedTree} from '../platform/library'
import {useEditorStore} from '../store/editor-store'
import {useSettingsStore} from '../store/settings-store'
import {displayName, FAMILY_ICONS, savedLabel} from './prop-labels'
import {PropPicture} from './prop-tile'
import {RemovedProps} from './RemovedProps'

const SORTS: readonly {value: PropSort; label: string}[] = [
    {value: 'changed', label: 'Last changed'},
    {value: 'name', label: 'Name'},
    {value: 'made', label: 'Date made'},
]

type KindFilter = PropFamily | 'all'

/** F2 asking the panel to rename. `at` makes each press new. */
interface RenameRequest {
    readonly at: number
}

const dateLabel = (iso: string | null): string | null => {
    const date = iso ? new Date(iso) : null

    return date && !Number.isNaN(date.getTime())
        ? new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'short', year: 'numeric'}).format(date)
        : null
}

const sizeLabel = (bytes: number): string =>
    bytes < 1024 ? `${bytes} bytes` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** The family's label, as on the kind tabs. */
const kindLabel = (kind: PropFamily | null): string | null => PROP_FAMILIES.find(({id}) => id === kind)?.label ?? null

/** How many tiles sit across the grid, so Up and Down move by a row. */
function columnsOf(grid: Element | null): number {
    if (!grid) {
        return 1
    }

    return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length)
}

function Details({tree, editing, request}: {tree: SavedTree; editing: boolean; request: RenameRequest | null}) {
    const openTree = useEditorStore((state) => state.openTree)
    const renameTree = useEditorStore((state) => state.renameTree)
    const removeTree = useEditorStore((state) => state.removeTree)
    const copyTree = useEditorStore((state) => state.copyTree)
    const showPropFile = useEditorStore((state) => state.showPropFile)
    const openBatchWithSaved = useEditorStore((state) => state.openBatchWithSaved)

    const name = displayName(tree)
    const [renaming, setRenaming] = useState(false)
    const [draft, setDraft] = useState(name)

    // Picking another prop puts the panel back as it was.
    useEffect(() => {
        setRenaming(false)
    }, [tree.id])

    useEffect(() => {
        if (request) {
            setDraft(name)
            setRenaming(true)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per request.
    }, [request])

    const commitRename = () => {
        setRenaming(false)

        if (draft.trim() !== '' && draft.trim() !== name) {
            void renameTree(tree.id, draft.trim())
        }
    }

    const kind = kindLabel(tree.kind)
    const made = dateLabel(tree.createdAt)
    const readable = tree.kind !== null

    return (
        <aside className="props-page__details" aria-label={`About ${name}`}>
            <div className="props-page__preview">
                <PropPicture tree={tree} iconSize={48} />
            </div>

            {renaming ? (
                <div className="props-page__rename">
                    <label className="dialog__label" htmlFor="props-rename">
                        New name
                    </label>
                    <input
                        className="field"
                        id="props-rename"
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
                                event.stopPropagation()
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
            ) : (
                <h2 className="props-page__name">
                    {name}
                    {editing ? <span className="prop-tile__badge">Editing</span> : null}
                </h2>
            )}

            <dl className="props-page__facts">
                {kind ? (
                    <>
                        <dt>Kind</dt>
                        <dd>{tree.presetName ? `${kind}, from ${tree.presetName}` : kind}</dd>
                    </>
                ) : null}
                {made ? (
                    <>
                        <dt>Made</dt>
                        <dd>{made}</dd>
                    </>
                ) : null}
                <dt>Changed</dt>
                <dd>{savedLabel(tree.savedAt)}</dd>
                {tree.seed !== null ? (
                    <>
                        <dt>Seed</dt>
                        <dd className="tabular">{tree.seed}</dd>
                    </>
                ) : null}
                <dt>Size</dt>
                <dd>{sizeLabel(tree.size)}</dd>
            </dl>

            {readable ? null : (
                <p className="dialog__hint">This file can't be read. It may be damaged, or from a newer easy-props.</p>
            )}

            <div className="props-page__actions">
                <div className="props-page__main-actions">
                    <button type="button" className="button button--primary" disabled={!readable} onClick={() => void openTree(tree.id)}>
                        Open
                    </button>
                    <button
                        type="button"
                        className="button"
                        disabled={!readable}
                        title="Export this prop without opening it"
                        onClick={() => openBatchWithSaved([tree.id])}
                    >
                        <Download size={13} aria-hidden="true" />
                        Export…
                    </button>
                </div>
                <div className="props-page__more-actions">
                    <button type="button" className="button" disabled={!readable} onClick={() => void copyTree(tree.id)}>
                        <Copy size={13} aria-hidden="true" />
                        Copy
                    </button>
                    <button
                        type="button"
                        className="button"
                        onClick={() => {
                            setDraft(name)
                            setRenaming(true)
                        }}
                    >
                        <Pencil size={13} aria-hidden="true" />
                        Rename
                    </button>
                    <button type="button" className="button" onClick={() => void showPropFile(tree.id)}>
                        <FolderOpen size={13} aria-hidden="true" />
                        Show in folder
                    </button>
                    <button type="button" className="button" onClick={() => void removeTree(tree.id)}>
                        <Trash2 size={13} aria-hidden="true" />
                        Remove
                    </button>
                </div>
            </div>
        </aside>
    )
}

/** The panel while several props are ticked: what can be done to all of them at once. */
function TickedDetails({ids, onClear}: {ids: readonly string[]; onClear(): void}) {
    const removeTrees = useEditorStore((state) => state.removeTrees)
    const openBatchWithSaved = useEditorStore((state) => state.openBatchWithSaved)

    return (
        <aside className="props-page__details" aria-label={`${ids.length} props ticked`}>
            <h2 className="props-page__name">{ids.length} props</h2>
            <p className="dialog__hint">Ctrl-click to tick or untick one more, Shift-click for a run. Esc clears the ticks.</p>
            <div className="props-page__actions">
                <div className="props-page__main-actions">
                    <button type="button" className="button button--primary" onClick={() => openBatchWithSaved(ids)}>
                        <Download size={13} aria-hidden="true" />
                        Export…
                    </button>
                    <button
                        type="button"
                        className="button"
                        onClick={() => {
                            onClear()
                            void removeTrees(ids)
                        }}
                    >
                        <Trash2 size={13} aria-hidden="true" />
                        Remove
                    </button>
                </div>
                <button type="button" className="button" onClick={onClear}>
                    Clear the ticks
                </button>
            </div>
        </aside>
    )
}

/** The bin, in place of the list, with a way back. */
function Bin({onBack}: {onBack(): void}) {
    return (
        <section className="props-page__bin" aria-label="Recently removed">
            <div className="home__section-head">
                <h2 className="home__section-title">Recently removed</h2>
                <button type="button" className="button" onClick={onBack}>
                    Back to your props
                </button>
            </div>
            <RemovedProps layout="tiles" />
        </section>
    )
}

export function YourPropsPage() {
    const gallery = useEditorStore((state) => state.gallery)
    const galleryLoading = useEditorStore((state) => state.galleryLoading)
    const refreshGallery = useEditorStore((state) => state.refreshGallery)
    const removedProps = useEditorStore((state) => state.removedProps)
    const refreshRemoved = useEditorStore((state) => state.refreshRemoved)
    const currentTreeId = useEditorStore((state) => state.currentTreeId)
    const pickedPropId = useEditorStore((state) => state.pickedPropId)
    const pickProp = useEditorStore((state) => state.pickProp)
    const openTree = useEditorStore((state) => state.openTree)
    const removeTrees = useEditorStore((state) => state.removeTrees)
    const showGallery = useEditorStore((state) => state.showGallery)
    const sort = useSettingsStore((state) => state.propsSort)
    const setSort = useSettingsStore((state) => state.setPropsSort)

    const [search, setSearch] = useState('')
    const [kind, setKind] = useState<KindFilter>('all')
    const [request, setRequest] = useState<RenameRequest | null>(null)
    const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
    const [inBin, setInBin] = useState(false)
    const searchField = useRef<HTMLInputElement>(null)
    const grid = useRef<HTMLDivElement>(null)

    useEffect(() => {
        void refreshGallery()
        void refreshRemoved()
    }, [refreshGallery, refreshRemoved])

    useEffect(() => {
        void useEditorStore.getState().drawMissingPictures()
    }, [gallery])

    // A tick on a prop that's gone, by Remove or Undo, means nothing.
    useEffect(() => {
        setTicked((current) => {
            const kept = [...current].filter((id) => gallery.some((tree) => tree.id === id))

            return kept.length === current.size ? current : new Set(kept)
        })
    }, [gallery])

    const counts = useMemo(() => {
        const found: Record<KindFilter, number> = {all: gallery.length, tree: 0, rock: 0, bush: 0}

        for (const tree of gallery) {
            if (tree.kind) {
                found[tree.kind] += 1
            }
        }

        return found
    }, [gallery])

    const visible = useMemo(
        () =>
            sortProps(
                gallery
                    .filter((tree) => kind === 'all' || tree.kind === kind)
                    .map((tree) => ({...tree, name: displayName(tree)}))
                    .filter((tree) => matchesSearch(tree, search)),
                sort,
            ),
        [gallery, kind, search, sort],
    )

    const groups = useMemo(
        () => (sort === 'changed' ? groupByTime(visible, new Date()) : [{group: null, props: visible}]),
        [visible, sort],
    )

    // The panel always says something: the picked prop while it's listed, or the first one.
    const picked = visible.find((tree) => tree.id === pickedPropId) ?? visible[0] ?? null
    const tickedIds = visible.filter((tree) => ticked.has(tree.id)).map((tree) => tree.id)

    const focusTile = (id: string) => {
        pickProp(id)
        grid.current?.querySelector<HTMLElement>(`[data-prop-id="${CSS.escape(id)}"]`)?.focus()
    }

    const toggleTick = (id: string) => {
        const next = new Set(ticked)

        // The first Ctrl-click ticks what was picked too, as in a file browser.
        if (next.size === 0 && picked && picked.id !== id) {
            next.add(picked.id)
        }

        if (!next.delete(id)) {
            next.add(id)
        }

        setTicked(next)
    }

    const onTileClick = (event: MouseEvent, id: string) => {
        if (event.ctrlKey || event.metaKey) {
            toggleTick(id)
        } else if (event.shiftKey && picked) {
            const from = visible.findIndex((tree) => tree.id === picked.id)
            const to = visible.findIndex((tree) => tree.id === id)
            const [start, end] = from < to ? [from, to] : [to, from]

            setTicked(new Set(visible.slice(start, end + 1).map((tree) => tree.id)))
            return
        } else {
            setTicked(new Set())
        }

        pickProp(id)
    }

    const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.target instanceof HTMLInputElement) {
            return
        }

        if (event.key === 'Escape' && ticked.size > 0) {
            event.preventDefault()
            event.stopPropagation()
            setTicked(new Set())
            return
        }

        if (!picked) {
            return
        }

        const index = visible.findIndex((tree) => tree.id === picked.id)
        const across = columnsOf(grid.current?.querySelector('.props-page__grid') ?? null)
        const moves: Record<string, number> = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -across, ArrowDown: across}

        if (event.key in moves) {
            event.preventDefault()
            const next = visible[Math.min(visible.length - 1, Math.max(0, index + moves[event.key]))]

            if (next) {
                focusTile(next.id)
            }
        } else if (event.key === ' ') {
            event.preventDefault()
            toggleTick(picked.id)
        } else if (event.key === 'Enter' && picked.kind !== null) {
            event.preventDefault()
            void openTree(picked.id)
        } else if (event.key === 'F2') {
            event.preventDefault()
            setRequest({at: event.timeStamp})
        } else if (event.key === 'Delete') {
            event.preventDefault()
            setTicked(new Set())
            void removeTrees(tickedIds.length > 0 ? tickedIds : [picked.id])
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            // Typing anywhere in the grid starts a search, as in a file browser.
            searchField.current?.focus()
        }
    }

    return (
        <main className="home props-page">
            <div className="props-page__inner">
                <header className="props-page__head">
                    <button type="button" className="icon-button" aria-label="Back to Home" title="Home" onClick={showGallery}>
                        <ArrowLeft size={15} aria-hidden="true" />
                    </button>
                    <h1 className="home__title">Your props</h1>
                </header>

                {inBin ? (
                    <Bin onBack={() => setInBin(false)} />
                ) : (
                    <>
                        <div className="props-page__toolbar">
                            <div className="filter props-page__search">
                                <Search size={13} aria-hidden="true" className="filter__icon" />
                                <input
                                    ref={searchField}
                                    className="filter__input"
                                    placeholder="Search your props"
                                    aria-label="Search your props"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Escape' && search) {
                                            event.stopPropagation()
                                            setSearch('')
                                        }
                                    }}
                                />
                                {search ? (
                                    <button type="button" className="filter__clear" aria-label="Clear search" onClick={() => setSearch('')}>
                                        <X size={12} aria-hidden="true" />
                                    </button>
                                ) : null}
                            </div>

                            <div className="kind-tabs" role="tablist" aria-label="Kind of prop">
                                {(['all', ...PROP_FAMILIES.map(({id}) => id)] as const).map((id) => {
                                    const Icon = id === 'all' ? null : FAMILY_ICONS[id]

                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            role="tab"
                                            className="kind-tab"
                                            aria-selected={kind === id}
                                            onClick={() => setKind(id)}
                                        >
                                            {Icon ? <Icon size={14} aria-hidden="true" /> : null}
                                            {id === 'all' ? 'All' : kindLabel(id)}
                                            <span className="kind-tab__count tabular">{counts[id]}</span>
                                        </button>
                                    )
                                })}
                            </div>

                            <div className="props-page__sort">
                                <Select label="Sort your props" value={sort} options={SORTS} onChange={setSort} />
                            </div>
                        </div>

                        <div className="props-page__body">
                            <div className="props-page__list" ref={grid} onKeyDown={onGridKey}>
                                {galleryLoading && gallery.length === 0 ? (
                                    <p className="dialog__hint" role="status">
                                        Looking for your props…
                                    </p>
                                ) : gallery.length === 0 ? (
                                    <p className="dialog__hint">Props you save show up here.</p>
                                ) : visible.length === 0 ? (
                                    <p className="dialog__hint">
                                        {search ? 'No prop by that name. Try a shorter word.' : 'None of your props are of this kind yet.'}
                                    </p>
                                ) : (
                                    groups.map(({group, props}) => (
                                        <section key={group ?? 'all'} aria-label={group ?? 'Your props'}>
                                            {group ? <h2 className="settings__group">{group}</h2> : null}
                                            <ul className="tile-grid props-page__grid">
                                                {props.map((tree) => (
                                                    <li
                                                        key={tree.id}
                                                        className="prop-tile"
                                                        data-current={tree.id === currentTreeId}
                                                        data-picked={tickedIds.length === 0 && tree.id === picked?.id}
                                                        data-ticked={ticked.has(tree.id)}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="prop-tile__open"
                                                            data-prop-id={tree.id}
                                                            title={tree.name}
                                                            aria-pressed={tree.id === picked?.id}
                                                            tabIndex={tree.id === picked?.id ? 0 : -1}
                                                            onClick={(event) => onTileClick(event, tree.id)}
                                                            onDoubleClick={() => (tree.kind !== null ? void openTree(tree.id) : undefined)}
                                                        >
                                                            <span className="prop-tile__thumb">
                                                                <PropPicture tree={tree} />
                                                            </span>
                                                            <span className="prop-tile__name">{tree.name}</span>
                                                            <span className="prop-tile__meta">
                                                                {savedLabel(tree.savedAt)}
                                                                {tree.id === currentTreeId ? <span className="prop-tile__badge">Editing</span> : null}
                                                            </span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="prop-tile__tick"
                                                            role="checkbox"
                                                            aria-checked={ticked.has(tree.id)}
                                                            aria-label={`Tick ${tree.name}`}
                                                            tabIndex={-1}
                                                            onClick={() => toggleTick(tree.id)}
                                                        >
                                                            {ticked.has(tree.id) ? <Check size={12} aria-hidden="true" /> : null}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    ))
                                )}

                                {removedProps.length > 0 ? (
                                    <button type="button" className="button props-page__bin-link" onClick={() => setInBin(true)}>
                                        <Trash2 size={13} aria-hidden="true" />
                                        Recently removed ({removedProps.length})
                                    </button>
                                ) : null}
                            </div>

                            {tickedIds.length > 0 ? (
                                <TickedDetails ids={tickedIds} onClear={() => setTicked(new Set())} />
                            ) : picked ? (
                                <Details tree={picked} editing={picked.id === currentTreeId} request={request} />
                            ) : null}
                        </div>
                    </>
                )}
            </div>
        </main>
    )
}
