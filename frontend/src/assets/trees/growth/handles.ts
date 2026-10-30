/**
 * The joints a beginner may grab.
 *
 * A grown tree has thousands of joints, most of them twigs. Showing a handle on
 * every one would make the tree a cloud of dots that nobody can pick out or
 * click cleanly. Only the limbs thick enough to be worth dragging get one, and
 * they come back ordered from the trunk outward so the first dots are the ones
 * that shape the whole tree.
 */

import type {Skeleton} from './skeleton'

export interface LimbHandle {
    readonly id: number
    readonly position: [number, number, number]
    readonly radius: number
}

/**
 * The handles for a tree: one dot per joint at least `minRadius` thick.
 *
 * Tips are never handles. A twig end is the least useful thing to drag, and it
 * is the joint most likely to be hidden inside foliage.
 */
export function limbHandles(skeleton: Skeleton, minRadius: number): readonly LimbHandle[] {
    const nodes = skeleton.nodes
    const withChildren = new Uint8Array(nodes.length)

    for (const node of nodes) {
        if (node.parentId !== null && node.parentId >= 0 && node.parentId < nodes.length) {
            withChildren[node.parentId] = 1
        }
    }

    // Depth from the root, so the list runs from the trunk outward rather than
    // in whatever order growth happened to produce.
    const depths = new Int32Array(nodes.length)

    for (let index = 0; index < nodes.length; index++) {
        const parentId = nodes[index].parentId

        depths[index] = parentId !== null && parentId >= 0 && parentId < index ? depths[parentId] + 1 : 0
    }

    const handles: LimbHandle[] = []

    for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index]

        if (withChildren[index] === 0 || node.radius < minRadius) {
            continue
        }

        handles.push({
            id: node.id,
            position: [node.position[0], node.position[1], node.position[2]],
            radius: node.radius,
        })
    }

    handles.sort((a, b) => depths[a.id] - depths[b.id] || a.id - b.id)

    return handles
}
