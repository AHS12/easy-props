/**
 * The Outliner: every real part of the prop, as a tree.
 *
 * Selecting here selects in the view, and the other way round. It reaches the parts
 * the view makes hard to hit, shows what was changed by hand, and is the only way to
 * bring back one removed part without undoing everything after it.
 */

import {Eraser, RotateCcw, Trash2, Undo2} from 'lucide-react'
import {useEffect, useMemo, useRef, useState} from 'react'
import {Button, Collection, Tree, TreeItem, TreeItemContent, type Key, type Selection} from 'react-aria-components'
import {ChevronRight} from 'lucide-react'
import {PROP_FAMILIES, familyOfPreset} from '../assets/trees/presets'
import {requestRemovePart} from '../core/commands/commands'
import {ancestorsOf, buildOutline, type OutlineNode} from '../core/scene/outline'
import {useEditorStore} from '../store/editor-store'
import {viewportHandle} from '../viewport/viewport-bridge'

function RowActions({node}: {node: OutlineNode}) {
    const restoreComponent = useEditorStore((state) => state.restoreComponent)
    const restoreRemovedPart = useEditorStore((state) => state.restoreRemovedPart)

    if (node.removed) {
        const {kind, key} = node.removed

        return (
            <Button className="row-action row-action--always" aria-label={`Bring back ${node.label}`} onPress={() => restoreRemovedPart(kind, key)}>
                <Undo2 size={12} aria-hidden="true" />
                Restore
            </Button>
        )
    }

    if (!node.componentId) {
        return null
    }

    const id = node.componentId

    return (
        <span className="row-actions">
            {node.edited ? (
                <Button className="row-action" aria-label={`Undo edits to ${node.label}`} onPress={() => restoreComponent(id)}>
                    <RotateCcw size={12} aria-hidden="true" />
                </Button>
            ) : null}
            {node.fixed ? null : (
                <Button
                    className="row-action"
                    aria-label={`Remove ${node.label}`}
                    onPress={() => requestRemovePart(useEditorStore.getState(), id)}
                >
                    <Trash2 size={12} aria-hidden="true" />
                </Button>
            )}
        </span>
    )
}

function Row({node, depth}: {node: OutlineNode; depth: number}) {
    const setHover = useEditorStore((state) => state.setHover)
    const select = useEditorStore((state) => state.select)

    return (
        <TreeItem
            id={node.id}
            textValue={node.label}
            className="tree-row"
            data-removed={node.removed ? true : undefined}
            data-group-row={node.componentId || node.removed ? undefined : true}
        >
            <TreeItemContent>
                {({hasChildItems}) => (
                    <div
                        className="tree-row__content"
                        style={{paddingLeft: `${(6 + depth * 14) / 16}rem`}}
                        onPointerEnter={() => setHover(node.componentId ?? null)}
                        onPointerLeave={() => setHover(null)}
                        onDoubleClick={() => {
                            if (node.componentId) {
                                select(node.componentId)
                                viewportHandle()?.frame()
                            }
                        }}
                    >
                        {hasChildItems ? (
                            <Button slot="chevron" className="tree-row__chevron" aria-label={`Open ${node.label}`}>
                                <ChevronRight size={13} aria-hidden="true" />
                            </Button>
                        ) : (
                            <span className="tree-row__spacer" />
                        )}
                        <span className="tree-row__label">{node.label}</span>
                        {node.edited ? <span className="tree-row__edited" title="Changed by hand" aria-label="changed by hand" /> : null}
                        <RowActions node={node} />
                    </div>
                )}
            </TreeItemContent>
            <Collection items={node.children}>{(child) => <Row node={child} depth={depth + 1} />}</Collection>
        </TreeItem>
    )
}

export function Outliner() {
    const scene = useEditorStore((state) => state.scene)
    const presetId = useEditorStore((state) => state.presetId)
    const selectedId = useEditorStore((state) => state.selection.selectedId)
    const select = useEditorStore((state) => state.select)
    const deselect = useEditorStore((state) => state.deselect)
    const restoreTree = useEditorStore((state) => state.restoreTree)

    const nodes = useMemo(() => buildOutline(scene), [scene])
    const hasEdits = useMemo(() => {
        const walk = (list: readonly OutlineNode[]): boolean =>
            list.some((node) => node.edited || node.removed || walk(node.children))

        return walk(nodes)
    }, [nodes])
    const [expanded, setExpanded] = useState<ReadonlySet<Key>>(() => new Set(nodes.slice(0, 3).map(({id}) => id)))
    const box = useRef<HTMLDivElement>(null)
    const family = PROP_FAMILIES.find(({id}) => id === familyOfPreset(presetId))!.label

    // A part chosen in the view opens its way down here and comes into sight.
    useEffect(() => {
        if (!selectedId) {
            return
        }

        const above = ancestorsOf(nodes, selectedId)

        if (above.some((id) => !expanded.has(id))) {
            setExpanded(new Set([...expanded, ...above]))
        }

        const frame = requestAnimationFrame(() => {
            box.current?.querySelector(`[data-key="${CSS.escape(selectedId)}"]`)?.scrollIntoView({block: 'nearest'})
        })

        return () => cancelAnimationFrame(frame)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new selection should open rows.
    }, [selectedId])

    const choose = (keys: Selection) => {
        const key = keys === 'all' ? null : [...keys][0]

        if (key === undefined || key === null) {
            deselect()
            return
        }

        select(String(key))
    }

    if (nodes.length === 0) {
        return <p className="panel-empty">This prop has no parts yet. Pick a preset to start from.</p>
    }

    return (
        <div className="outliner" ref={box}>
            <Tree
                aria-label={`Parts of this ${family.toLowerCase()}`}
                items={nodes}
                selectionMode="single"
                selectionBehavior="replace"
                selectedKeys={selectedId ? [selectedId] : []}
                onSelectionChange={choose}
                expandedKeys={expanded as Set<Key>}
                onExpandedChange={(keys) => setExpanded(keys)}
                className="tree"
                disabledBehavior="selection"
                disabledKeys={[...collectUnselectable(nodes)]}
            >
                {(node) => <Row node={node} depth={0} />}
            </Tree>
            {hasEdits ? (
                <button type="button" className="outliner__restore text-button" onClick={restoreTree}>
                    <Eraser size={13} aria-hidden="true" />
                    Restore to preset
                </button>
            ) : (
                <p className="outliner__hint">Click a part to change just that part. Double-click to frame it.</p>
            )}
        </div>
    )
}

function* collectUnselectable(nodes: readonly OutlineNode[]): Generator<string> {
    for (const node of nodes) {
        if (!node.componentId) {
            yield node.id
        }

        yield* collectUnselectable(node.children)
    }
}
