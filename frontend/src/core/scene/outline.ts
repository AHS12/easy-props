/**
 * The Outliner's view of a prop: its real parts as a tree.
 *
 * Pure, so it can be tested without a screen. A painted tree keeps its parts in a
 * flat list under the bark, so they are grouped by kind here. A removed part stays
 * listed, because the edit list remembers it, and can be brought back.
 */

import {describeComponent, type SceneComponent} from '../../assets/shared/component-types'
import {parseEdits, type PaintedEdits} from '../../assets/trees/painted/edits'
import type {Scene} from './scene-model'

export interface OutlineNode {
    /** The component's id. A group or removed part has its own. */
    readonly id: string
    readonly label: string
    readonly children: readonly OutlineNode[]
    /** Set on a row that stands for a real part, which can be selected. */
    readonly componentId?: string
    /** Changed by hand, so the row can say so. */
    readonly edited?: boolean
    /** How to bring back a removed part. */
    readonly removed?: {readonly kind: 'limb' | 'clump'; readonly key: string}
    /** The trunk and the bark stand for the prop, so they cannot be removed. */
    readonly fixed?: boolean
}

const GROUPS: readonly {readonly label: string; readonly single: string; readonly test: (part: SceneComponent) => boolean}[] = [
    {label: 'Roots', single: 'Root', test: (part) => part.type === 'root'},
    {label: 'Branches', single: 'Branch', test: (part) => part.type === 'branch'},
    {label: 'Leaves', single: 'Clump', test: (part) => part.type === 'foliage-cluster' && part.parameters.kind !== 'frond'},
    {label: 'Fronds', single: 'Frond', test: (part) => part.type === 'foliage-cluster' && part.parameters.kind === 'frond'},
]

/** Removed parts come back with the same key, so they sit in the same group. */
function removedGroupOf(kind: 'limb' | 'clump', key: string): string {
    if (kind === 'clump') {
        return key.startsWith('f') ? 'Fronds' : 'Leaves'
    }

    return key.startsWith('r') ? 'Roots' : 'Branches'
}

const removedSingular = (group: string) => GROUPS.find(({label}) => label === group)?.single ?? 'Part'

function isHandEdited(part: SceneComponent, edits: PaintedEdits): boolean {
    const key = part.parameters.key
    // A limb and a clump can share a key, since they hang off the same point.
    const list = part.generatorId === 'painted-clump' ? edits.clumps : edits.limbs

    return typeof key === 'string' && key in list
}

/** The parts of a painted tree: its trunk, then a group per kind. */
function paintedOutline(components: readonly SceneComponent[], editsText: string): OutlineNode[] {
    const edits = parseEdits(editsText)
    const rows: OutlineNode[] = []

    for (const part of components) {
        if (part.type === 'trunk') {
            rows.push({
                id: part.id,
                label: 'Trunk',
                componentId: part.id,
                children: [],
                fixed: true,
                edited: isHandEdited(part, edits),
            })
        }
    }

    const removed = [
        ...Object.entries(edits.limbs)
            .filter(([, edit]) => edit.removed)
            .map(([key]) => ({kind: 'limb' as const, key})),
        ...Object.entries(edits.clumps)
            .filter(([, edit]) => edit.removed)
            .map(([key]) => ({kind: 'clump' as const, key})),
    ]

    for (const group of GROUPS) {
        const parts = components.filter(group.test)
        const gone = removed.filter(({kind, key}) => removedGroupOf(kind, key) === group.label)

        if (parts.length + gone.length === 0) {
            continue
        }

        rows.push({
            id: `group-${group.label}`,
            label: `${group.label} (${parts.length})`,
            children: [
                ...parts.map(
                    (part, index): OutlineNode => ({
                        id: part.id,
                        label: `${group.single} ${index + 1}`,
                        componentId: part.id,
                        children: [],
                        edited: isHandEdited(part, edits),
                    }),
                ),
                ...gone.map(
                    ({kind, key}, index): OutlineNode => ({
                        id: `removed-${kind}-${key}`,
                        label: `${removedSingular(group.label)} (removed ${index + 1})`,
                        children: [],
                        removed: {kind, key},
                    }),
                ),
            ],
        })
    }

    return rows
}

/** The parts of any other prop, nested as they hang off each other. */
function nestedOutline(components: readonly SceneComponent[]): OutlineNode[] {
    const counts = new Map<string, number>()

    const nodeFor = (part: SceneComponent): OutlineNode => {
        const name = describeComponent(part.type)
        const count = (counts.get(name) ?? 0) + 1

        counts.set(name, count)

        return {
            id: part.id,
            label: part.type === 'trunk' || part.type === 'rock' ? name : `${name} ${count}`,
            componentId: part.id,
            edited: part.slot === null || part.edited,
            fixed: part.type === 'trunk' || part.type === 'rock',
            children: components.filter((child) => child.parentId === part.id).map(nodeFor),
        }
    }

    return components.filter((part) => !part.parentId).map(nodeFor)
}

/** Every row of the Outliner. */
export function buildOutline(scene: Scene): readonly OutlineNode[] {
    const asset = scene.assets[0]

    if (!asset) {
        return []
    }

    const painted = asset.components.some((part) => part.generatorId === 'painted-bark')
    const edits = asset.parameters.edits

    return painted
        ? paintedOutline(asset.components, typeof edits === 'string' ? edits : '')
        : nestedOutline(asset.components)
}

/** The ids of the rows above a part, so selecting it can open them. */
export function ancestorsOf(nodes: readonly OutlineNode[], id: string): readonly string[] {
    for (const node of nodes) {
        if (node.id === id) {
            return []
        }

        const below = ancestorsOf(node.children, id)

        if (below.length > 0 || node.children.some((child) => child.id === id)) {
            return [node.id, ...below]
        }
    }

    return []
}
