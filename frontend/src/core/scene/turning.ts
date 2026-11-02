/**
 * Turning a branch or root of a painted tree.
 *
 * A turn goes around the part's base, where it leaves its parent, so it stays
 * joined while it swings. That point comes from the tree's plan.
 */

import * as THREE from 'three'
import {findPropGenerator} from '../../assets/prop-generators'
import type {PaintedTreeParameters} from '../../assets/trees/painted/parameters'
import {planPaintedTree, type Vec3} from '../../assets/trees/painted/plan'
import {findAssetOf, findComponent, type Scene} from './scene-model'

/** Whether a part can be turned: a painted branch or root, never the trunk. */
export function canTurn(scene: Scene, componentId: string | null): boolean {
    const part = componentId ? findComponent(scene, componentId) : undefined

    return part?.generatorId === 'painted-limb' && part.parameters.key !== 't'
}

/** Where a part turns around, or null for a part that doesn't turn. */
export function turnPivotOf(scene: Scene, componentId: string | null): Vec3 | null {
    if (!componentId || !canTurn(scene, componentId)) {
        return null
    }

    const part = findComponent(scene, componentId)!
    const asset = findAssetOf(scene, componentId)!
    const tree = findPropGenerator(asset.generatorId)?.validate(asset.parameters).parameters as PaintedTreeParameters | undefined
    const limb = tree ? planPaintedTree(tree, asset.seed).limbs.find((candidate) => candidate.key === part.parameters.key) : undefined

    return limb ? limb.points[0] : null
}

/**
 * A turn, turned further about an axis in the world.
 *
 * The plan applies X, then Y, then Z, each about the world's axes, which is
 * three.js's ZYX order. Composing as quaternions turns about the axis as seen,
 * whatever the part was turned by before, as Blender's and Godot's gizmos do.
 */
export function turnedAbout(turn: Vec3, axis: readonly [number, number, number], radians: number): Vec3 {
    const [x, y, z] = turn.map((degrees) => THREE.MathUtils.degToRad(degrees))
    const start = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'ZYX'))
    const by = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis).normalize(), radians)
    const euler = new THREE.Euler().setFromQuaternion(by.multiply(start), 'ZYX')
    // A tenth of a degree is finer than anyone can drag, and keeps Details readable.
    const degrees = (angle: number) => Math.round(THREE.MathUtils.radToDeg(angle) * 10) / 10 + 0

    return [degrees(euler.x), degrees(euler.y), degrees(euler.z)]
}

/** A part's turn, in degrees about X, Y and Z. */
export function turnOf(scene: Scene, componentId: string): Vec3 {
    const turn = findComponent(scene, componentId)?.parameters.turn

    return Array.isArray(turn) && turn.length === 3 ? (turn as unknown as Vec3) : [0, 0, 0]
}
