/**
 * Recently removed: props in the bin, until they're put back or 30 days go by.
 *
 * Shown on Your props as tiles, and in Settings as rows, with the same actions:
 * put one back, remove one for good, or empty the whole bin. Only removing for
 * good asks first, since it's the one thing here that can't be undone.
 */

import {RotateCcw, Trash2} from 'lucide-react'
import {useEffect, useState} from 'react'
import type {RemovedTree} from '../platform/library'
import {useEditorStore} from '../store/editor-store'
import {displayName, savedLabel} from './prop-labels'
import {PropPicture} from './prop-tile'

/** What's waiting to be confirmed: one prop by id, or the whole bin. */
type Forgetting = string | 'all' | null

function ForgetQuestion({label, onKeep, onForget}: {label: string; onKeep(): void; onForget(): void}) {
    return (
        <div className="removed-props__question" role="group" aria-label={label}>
            <p className="dialog__hint">{label} This can't be undone.</p>
            <div className="prop-tile__choices">
                <button type="button" className="button" autoFocus onClick={onKeep}>
                    Keep it
                </button>
                <button type="button" className="button button--danger" onClick={onForget}>
                    Remove for good
                </button>
            </div>
        </div>
    )
}

function Actions({tree, forgetting, setForgetting}: {tree: RemovedTree; forgetting: Forgetting; setForgetting(next: Forgetting): void}) {
    const putBackTrees = useEditorStore((state) => state.putBackTrees)
    const forgetTree = useEditorStore((state) => state.forgetTree)
    const name = displayName(tree)

    return forgetting === tree.id ? (
        <ForgetQuestion
            label={`Remove “${name}” for good?`}
            onKeep={() => setForgetting(null)}
            onForget={() => {
                setForgetting(null)
                void forgetTree(tree.id)
            }}
        />
    ) : (
        <div className="prop-tile__choices removed-props__actions">
            <button type="button" className="button" aria-label={`Put back ${name}`} onClick={() => void putBackTrees([tree.id])}>
                <RotateCcw size={13} aria-hidden="true" />
                Put back
            </button>
            <button type="button" className="button" aria-label={`Remove ${name} for good`} onClick={() => setForgetting(tree.id)}>
                Remove for good
            </button>
        </div>
    )
}

export function RemovedProps({layout}: {layout: 'tiles' | 'rows'}) {
    const removed = useEditorStore((state) => state.removedProps)
    const refreshRemoved = useEditorStore((state) => state.refreshRemoved)
    const putBackTrees = useEditorStore((state) => state.putBackTrees)
    const forgetAllRemoved = useEditorStore((state) => state.forgetAllRemoved)
    const [forgetting, setForgetting] = useState<Forgetting>(null)

    useEffect(() => {
        void refreshRemoved()
    }, [refreshRemoved])

    return (
        <div className="removed-props" data-layout={layout}>
            <p className="dialog__hint">Removed props wait here for 30 days, then they're gone for good.</p>

            {removed.length === 0 ? (
                <p className="dialog__hint">Nothing here.</p>
            ) : (
                <>
                    {removed.length > 1 ? (
                        forgetting === 'all' ? (
                            <ForgetQuestion
                                label={`Remove all ${removed.length} props for good?`}
                                onKeep={() => setForgetting(null)}
                                onForget={() => {
                                    setForgetting(null)
                                    void forgetAllRemoved()
                                }}
                            />
                        ) : (
                            <div className="removed-props__all">
                                <button type="button" className="button" onClick={() => void putBackTrees(removed.map((tree) => tree.id))}>
                                    <RotateCcw size={13} aria-hidden="true" />
                                    Put all back
                                </button>
                                <button type="button" className="button" onClick={() => setForgetting('all')}>
                                    <Trash2 size={13} aria-hidden="true" />
                                    Empty the bin
                                </button>
                            </div>
                        )
                    ) : null}

                    {layout === 'tiles' ? (
                        <ul className="tile-grid props-page__grid">
                            {removed.map((tree) => (
                                <li key={tree.id} className="prop-tile">
                                    <div className="prop-tile__thumb">
                                        <PropPicture tree={tree} />
                                    </div>
                                    <span className="prop-tile__name">{displayName(tree)}</span>
                                    <span className="prop-tile__meta">Removed {savedLabel(tree.removedAt)}</span>
                                    <Actions tree={tree} forgetting={forgetting} setForgetting={setForgetting} />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <ul className="removed-props__rows">
                            {removed.map((tree) => (
                                <li key={tree.id} className="removed-props__row">
                                    <span className="removed-props__thumb">
                                        <PropPicture tree={tree} iconSize={18} />
                                    </span>
                                    <span className="removed-props__text">
                                        <span className="setting__label">{displayName(tree)}</span>
                                        <span className="setting__help">Removed {savedLabel(tree.removedAt)}</span>
                                    </span>
                                    <Actions tree={tree} forgetting={forgetting} setForgetting={setForgetting} />
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </div>
    )
}
