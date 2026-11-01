/**
 * Collision shapes.
 *
 * Each one is a tapered prism, two parallel rings joined up. That is convex by
 * construction, so there is nothing to decompose and an engine can use it as is.
 */

import * as THREE from 'three'
import {roleOfPart, type CollisionShape} from '../../../assets/shared/generator-types'
import type {EngineId, PlacedPart, Vec3} from './types'

export const MAX_COLLISION_SHAPES = 8
const SIDES = 8
/** How much of a part's height counts as its ends, when making a shape for it. */
const END_BAND = 0.1

/** A closed prism, faces pointing out. */
export function prismGeometry(shape: CollisionShape, pivot: Vec3): THREE.BufferGeometry {
    const start = new THREE.Vector3(...shape.start).sub(new THREE.Vector3(...pivot))
    const end = new THREE.Vector3(...shape.end).sub(new THREE.Vector3(...pivot))
    const axis = end.clone().sub(start).normalize()
    const helper = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const u = new THREE.Vector3().crossVectors(axis, helper).normalize()
    const v = new THREE.Vector3().crossVectors(axis, u)
    const positions: number[] = []
    const indices: number[] = []

    for (const [centre, radius] of [
        [start, shape.startRadius],
        [end, shape.endRadius],
    ] as const) {
        for (let side = 0; side < SIDES; side++) {
            const angle = (side / SIDES) * Math.PI * 2
            const point = centre
                .clone()
                .addScaledVector(u, Math.cos(angle) * radius)
                .addScaledVector(v, Math.sin(angle) * radius)

            positions.push(point.x, point.y, point.z)
        }
    }

    for (let side = 0; side < SIDES; side++) {
        const next = (side + 1) % SIDES

        indices.push(side, next, SIDES + next, side, SIDES + next, SIDES + side)
    }

    for (let side = 1; side < SIDES - 1; side++) {
        indices.push(0, side + 1, side)
        indices.push(SIDES, SIDES + side, SIDES + side + 1)
    }

    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    return geometry
}

/** A shape for a solid part of a prop that offers none: its ends, joined. */
function shapeOfPart(placed: PlacedPart): CollisionShape | null {
    const source = placed.part.geometry.getAttribute('position')

    if (!source || source.count === 0) {
        return null
    }

    const matrix = new THREE.Matrix4().fromArray([...placed.matrix])
    const point = new THREE.Vector3()
    const points: THREE.Vector3[] = []
    const box = new THREE.Box3()

    for (let i = 0; i < source.count; i++) {
        point.fromBufferAttribute(source, i).applyMatrix4(matrix)
        points.push(point.clone())
        box.expandByPoint(point)
    }

    const size = box.getSize(new THREE.Vector3())
    const axis: 'x' | 'y' | 'z' = size.y >= size.x && size.y >= size.z ? 'y' : size.x >= size.z ? 'x' : 'z'
    const band = size[axis] * END_BAND
    const endOf = (near: number): {centre: THREE.Vector3; radius: number} => {
        const inBand = points.filter((p) => Math.abs(p[axis] - near) <= band)
        const centre = inBand.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(inBand.length)
        const radius = inBand.reduce((sum, p) => sum + p.distanceTo(centre), 0) / inBand.length

        return {centre, radius}
    }
    const low = endOf(box.min[axis])
    const high = endOf(box.max[axis])

    if (low.centre.distanceTo(high.centre) < 1e-3) {
        return null
    }

    return {
        start: low.centre.toArray(),
        end: high.centre.toArray(),
        startRadius: low.radius,
        endRadius: high.radius,
    }
}

const weightOf = ({start, end, startRadius, endRadius}: CollisionShape) =>
    Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]) * (startRadius + endRadius) ** 2

/** The shapes a prop collides with, heaviest first, never more than the limit. */
export function collisionShapes(
    offered: readonly CollisionShape[],
    parts: readonly PlacedPart[],
): readonly CollisionShape[] {
    const shapes = offered.length > 0
        ? offered
        : parts
              .filter(({part}) => !part.surface?.proxy && roleOfPart(part) !== 'foliage')
              .map(shapeOfPart)
              .filter((shape): shape is CollisionShape => shape !== null)

    return [...shapes].sort((a, b) => weightOf(b) - weightOf(a)).slice(0, MAX_COLLISION_SHAPES)
}

/**
 * The node name that tells an engine this mesh is for colliding. Unreal reads a
 * shape only beside the mesh it names, which is `owner` when they share a file.
 */
export function collisionNodeName(engine: EngineId, name: string, index: number, owner = `${name}_LOD0`): string {
    if (engine === 'unreal') {
        return `UCX_${owner}_${String(index).padStart(2, '0')}`
    }

    return engine === 'godot' ? `${name}_${index}-convcolonly` : `${name}_collision_${index}`
}
