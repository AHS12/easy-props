import {describe, expect, it} from 'vitest'
import {growSkeleton} from './colonization'
import {limbHandles} from './handles'
import {growthDefaults} from './parameters'
import type {Skeleton} from './skeleton'

const SEED = 20240521

function jointsWithChildren(skeleton: Skeleton): Set<number> {
    const joints = new Set<number>()

    for (const node of skeleton.nodes) {
        if (node.parentId !== null) {
            joints.add(node.parentId)
        }
    }

    return joints
}

describe('limb handles', () => {
    it('offers a dot on the big limbs and none on the twigs', () => {
        const skeleton = growSkeleton(growthDefaults, SEED)
        const minRadius = growthDefaults.trunkRadius * 0.25
        const handles = limbHandles(skeleton, minRadius)
        const withChildren = jointsWithChildren(skeleton)

        expect(handles.length).toBeGreaterThan(0)
        expect(handles.length).toBeLessThan(skeleton.nodes.length)

        for (const handle of handles) {
            const node = skeleton.nodes[handle.id]

            expect(handle.radius).toBe(node.radius)
            expect(handle.radius).toBeGreaterThanOrEqual(minRadius)
            expect(handle.position).toEqual([node.position[0], node.position[1], node.position[2]])

            // A tip is a twig end and never a handle.
            expect(withChildren.has(handle.id)).toBe(true)
        }
    })

    it('lists the trunk before the limbs and the limbs before the twigs', () => {
        const skeleton = growSkeleton(growthDefaults, SEED)
        const handles = limbHandles(skeleton, growthDefaults.trunkRadius * 0.2)
        const depth = new Map<number, number>()

        for (const node of skeleton.nodes) {
            depth.set(node.id, node.parentId === null ? 0 : (depth.get(node.parentId) ?? 0) + 1)
        }

        expect(handles.length).toBeGreaterThan(3)
        expect(handles[0].id).toBe(0)
        expect(new Set(handles.map((handle) => handle.id)).size).toBe(handles.length)

        for (let index = 1; index < handles.length; index++) {
            expect(depth.get(handles[index].id)!).toBeGreaterThanOrEqual(
                depth.get(handles[index - 1].id)!,
            )
        }
    })

    it('takes the minimum thickness seriously', () => {
        const skeleton = growSkeleton(growthDefaults, SEED)
        const internal = jointsWithChildren(skeleton)

        // At zero the filter is off, so every joint that is not a tip shows up.
        expect(limbHandles(skeleton, 0)).toHaveLength(internal.size)

        // Nothing is that thick, so there is nothing to grab.
        expect(limbHandles(skeleton, growthDefaults.trunkRadius * 2)).toHaveLength(0)
        expect(limbHandles(skeleton, growthDefaults.trunkRadius)).toHaveLength(1)
    })
})
