/**
 * Where a new part goes.
 *
 * A part added from the library must land somewhere sensible. This decides
 * the parent, the position, and the direction, using the tree that is
 * already there.
 */

import * as THREE from 'three'
import type {LibraryPart} from '../../assets/library/library'
import type {SceneComponent, SpinePoint} from '../../assets/shared/component-types'
import {hashSeed} from '../../assets/shared/random'
import type {Scene, SceneAsset} from './scene-model'

export interface Attachment {
    readonly parentId: string | null
    readonly position: readonly [number, number, number]
    readonly rotation: readonly [number, number, number]
    readonly seed: number
}

/** A point along the trunk's spine. */
export function trunkPointAt(
    trunk: SceneComponent,
    t: number,
): THREE.Vector3 {
    const height = typeof trunk.parameters.height === 'number' ? trunk.parameters.height : 4
    const twist = typeof trunk.parameters.twist === 'number' ? trunk.parameters.twist : 0

    const spine = (trunk.parameters.spine ?? []) as SpinePoint[]
    const clamped = THREE.MathUtils.clamp(t, 0, 1)

    if (spine.length < 2) {
        return new THREE.Vector3(0, clamped * height, 0)
    }

    const scaled = clamped * (spine.length - 1)
    const index = Math.min(Math.floor(scaled), spine.length - 2)
    const fraction = scaled - index

    const point = new THREE.Vector3(
        THREE.MathUtils.lerp(spine[index].x, spine[index + 1].x, fraction),
        clamped * height,
        THREE.MathUtils.lerp(spine[index].z, spine[index + 1].z, fraction),
    )

    if (twist !== 0) {
        point.applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            THREE.MathUtils.degToRad(twist) * clamped,
        )
    }

    return point
}

/** The direction a branch grows in, in world space. */
export function branchDirection(branch: SceneComponent): THREE.Vector3 {
    const euler = new THREE.Euler(...branch.transform.rotation)

    return new THREE.Vector3(1, 0, 0).applyEuler(euler).normalize()
}

/** The tip of a branch, in world space. */
export function branchTip(branch: SceneComponent): THREE.Vector3 {
    const length = typeof branch.parameters.length === 'number' ? branch.parameters.length : 1.5
    const euler = new THREE.Euler(...branch.transform.rotation)
    const local = new THREE.Vector3(length, 0, 0).applyEuler(euler)

    return new THREE.Vector3(...branch.transform.position).add(local)
}

function rotationTowards(direction: THREE.Vector3): readonly [number, number, number] {
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(1, 0, 0),
        direction.clone().normalize(),
    )
    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ')

    return [euler.x, euler.y, euler.z]
}

function findByType(asset: SceneAsset, type: string): SceneComponent | undefined {
    return asset.components.find((component) => component.type === type)
}

function branchesOf(asset: SceneAsset): SceneComponent[] {
    return asset.components.filter((component) => component.type === 'branch')
}

/**
 * Chooses where a library part should go.
 *
 * The rule comes from the part itself, so a root always lands at the base
 * and a leaf clump always lands on a branch.
 */
export function findAttachment(
    scene: Scene,
    part: LibraryPart,
    attempt = 0,
): Attachment {
    const asset = scene.assets[0]
    const seed = hashSeed(asset?.seed ?? 1, attempt * 31 + 7)
    const random = (attempt * 0.6180339887) % 1

    const trunk = asset ? findByType(asset, 'trunk') : undefined
    const branches = asset ? branchesOf(asset) : []

    const azimuth = random * Math.PI * 2
    const outward = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth))

    if (!asset || !trunk) {
        // No tree yet. The part stands at the origin.
        return {
            parentId: null,
            position: [0, 0, 0],
            rotation: rotationTowards(outward.clone().setY(0.2).normalize()),
            seed,
        }
    }

    switch (part.attachment) {
        case 'at the base': {
            return {
                parentId: trunk.id,
                position: [0, 0.05, 0],
                rotation: rotationTowards(
                    outward.clone().setY(-0.15).normalize(),
                ),
                seed,
            }
        }

        case 'along the trunk': {
            // Somewhere in the upper half, where a branch has room.
            const t = 0.45 + random * 0.45
            const point = trunkPointAt(trunk, t)
            const direction = outward
                .clone()
                .setY(0.55)
                .normalize()

            return {
                parentId: trunk.id,
                position: [point.x, point.y, point.z],
                rotation: rotationTowards(direction),
                seed,
            }
        }

        case 'on a branch': {
            const host = branches[Math.floor(random * branches.length)] ?? trunk
            const point = branchTip(host)
            const direction = branchDirection(host)

            return {
                parentId: host.id,
                position: [point.x, point.y, point.z],
                rotation: rotationTowards(direction.clone().setY(direction.y + 0.4).normalize()),
                seed,
            }
        }

        case 'at a branch tip':
        default: {
            const host = branches[Math.floor(random * branches.length)]

            if (!host) {
                // No branches yet, so it goes on the trunk instead.
                const point = trunkPointAt(trunk, 0.8)

                return {
                    parentId: trunk.id,
                    position: [point.x, point.y, point.z],
                    rotation: rotationTowards(outward.clone().setY(0.3).normalize()),
                    seed,
                }
            }

            const point = branchTip(host)

            return {
                parentId: host.id,
                position: [point.x, point.y, point.z],
                rotation: rotationTowards(new THREE.Vector3(0, 1, 0)),
                seed,
            }
        }
    }
}
