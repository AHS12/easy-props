/**
 * Resizing a branch, root or leaf clump of a painted tree.
 *
 * A branch or root grows and shrinks around its base, as it turns, so it stays
 * joined to what it grows from, and what grows on it follows. A clump grows
 * and shrinks around its middle.
 */

import {findComponentGenerator} from '../../assets/component-generators'
import type {Vec3} from '../../assets/trees/painted/plan'
import {findComponent, type Scene} from './scene-model'
import {canTurn, turnPivotOf} from './turning'

/** Whether a part can be resized: a painted branch, root or leaf clump, never the trunk. */
export function canResize(scene: Scene, componentId: string | null): boolean {
    const part = componentId ? findComponent(scene, componentId) : undefined

    return part?.generatorId === 'painted-clump' || canTurn(scene, componentId)
}

/** Where a part grows and shrinks around, or null for a part that doesn't resize. */
export function resizePivotOf(scene: Scene, componentId: string | null): Vec3 | null {
    if (!componentId || !canResize(scene, componentId)) {
        return null
    }

    const part = findComponent(scene, componentId)!

    return part.generatorId === 'painted-clump' ? part.transform.position : turnPivotOf(scene, componentId)
}

/** A part's size, 1 as the tree grew it. */
export function sizeOf(scene: Scene, componentId: string): number {
    const size = findComponent(scene, componentId)?.parameters.sizeScale

    return typeof size === 'number' && Number.isFinite(size) ? size : 1
}

/** The smallest and largest a part can be, from its Size control. */
export function sizeLimits(scene: Scene, componentId: string): {min: number; max: number} {
    const part = findComponent(scene, componentId)
    const spec = part ? findComponentGenerator(part.generatorId)?.parameters.find((candidate) => candidate.key === 'sizeScale') : undefined

    return spec?.kind === 'number' ? {min: spec.min, max: spec.max} : {min: 1, max: 1}
}

/**
 * The size a drag asks for: the starting size times how far the pointer has
 * moved out from the part's middle, within the part's limits.
 *
 * Snapped to a tenth with Shift, and to a hundredth otherwise, so Details stays readable.
 */
export function resizedBy(
    start: number,
    ratio: number,
    limits: {readonly min: number; readonly max: number},
    snap: boolean,
): number {
    const step = snap ? 0.1 : 0.01
    const size = Math.round((start * Math.max(ratio, 0)) / step) * step

    return Math.round(Math.min(Math.max(size, limits.min), limits.max) * 100) / 100
}
