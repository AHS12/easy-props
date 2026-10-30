/**
 * Turning a skeleton into bark.
 *
 * Each joint gets one ring of vertices and the ring is shared by every limb
 * that passes through it, so a joint is a continuous surface rather than a
 * set of tubes pushed together: no seam, no overlap, and nothing to weld
 * afterwards. Caps are only added where the wood really ends, at the base of
 * the trunk and at the tips of the twigs.
 *
 * Frames are carried down the tree by the double-reflection method (Wang et
 * al., 2008). A frame built from a cross product flips where a limb turns
 * sharply; carrying the previous ring's frame round instead keeps the
 * texture and the shading running smoothly along a limb.
 */

import * as THREE from 'three'
import type {Skeleton} from './skeleton'

export interface BarkOptions {
    /** How many vertices each ring has. 8 keeps a twig round and a mesh small. */
    readonly radialSegments?: number
}

const DEFAULT_SEGMENTS = 8

/** Guards against a zero-length vector being normalised into NaN. */
const EPSILON = 1e-12

/** Picks a unit vector at right angles to a unit tangent. */
function perpendicular(tx: number, ty: number, tz: number): [number, number, number] {
    const axisX = Math.abs(tx) < 0.9 ? 1 : 0
    const axisY = axisX === 1 ? 0 : 1
    const x = axisY * tz
    const y = -axisX * tz
    const z = axisX * ty - axisY * tx
    const length = Math.sqrt(x * x + y * y + z * z)

    if (length < 1e-9) {
        return [1, 0, 0]
    }

    return [x / length, y / length, z / length]
}

/**
 * Builds the bark of a whole tree.
 *
 * Vertices come out ring after ring in joint order, so joint `i` owns the
 * vertices from `i * radialSegments` up to the next joint. Every vertex is
 * used: the rings are shared by the edge into a joint and the edges out of it,
 * and the only vertices of their own are the centres of the caps.
 */
export function skeletonToBark(skeleton: Skeleton, options: BarkOptions = {}): THREE.BufferGeometry {
    const nodes = skeleton.nodes
    const count = nodes.length
    const radialSegments = Math.max(3, Math.round(options.radialSegments ?? DEFAULT_SEGMENTS))

    if (count === 0) {
        return new THREE.BufferGeometry()
    }

    // --- Frames ---------------------------------------------------------
    const tangents = new Float64Array(count * 3)
    const normals = new Float64Array(count * 3)

    for (let index = 0; index < count; index++) {
        const node = nodes[index]
        const [dx, dy, dz] = node.direction
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const at = index * 3

        if (length > 1e-9) {
            tangents[at] = dx / length
            tangents[at + 1] = dy / length
            tangents[at + 2] = dz / length
        } else {
            tangents[at] = 0
            tangents[at + 1] = 1
            tangents[at + 2] = 0
        }
    }

    const first = perpendicular(tangents[0], tangents[1], tangents[2])

    normals[0] = first[0]
    normals[1] = first[1]
    normals[2] = first[2]

    for (let index = 1; index < count; index++) {
        const at = index * 3
        const parentId = nodes[index].parentId

        if (parentId === null || parentId < 0 || parentId >= index) {
            const fresh = perpendicular(tangents[at], tangents[at + 1], tangents[at + 2])

            normals[at] = fresh[0]
            normals[at + 1] = fresh[1]
            normals[at + 2] = fresh[2]

            continue
        }

        const from = parentId * 3
        const child = nodes[index].position
        const parent = nodes[parentId].position

        let edgeX = child[0] - parent[0]
        let edgeY = child[1] - parent[1]
        let edgeZ = child[2] - parent[2]
        const edgeLength = Math.sqrt(edgeX * edgeX + edgeY * edgeY + edgeZ * edgeZ)

        if (edgeLength > 1e-9) {
            edgeX /= edgeLength
            edgeY /= edgeLength
            edgeZ /= edgeLength
        } else {
            edgeX = tangents[at]
            edgeY = tangents[at + 1]
            edgeZ = tangents[at + 2]
        }

        // First reflection: mirror the parent's frame across the plane at
        // right angles to the edge.
        const tangentAlong = tangents[from] * edgeX + tangents[from + 1] * edgeY + tangents[from + 2] * edgeZ
        const normalAlong = normals[from] * edgeX + normals[from + 1] * edgeY + normals[from + 2] * edgeZ

        const reflectedTangentX = tangents[from] - 2 * tangentAlong * edgeX
        const reflectedTangentY = tangents[from + 1] - 2 * tangentAlong * edgeY
        const reflectedTangentZ = tangents[from + 2] - 2 * tangentAlong * edgeZ

        let normalX = normals[from] - 2 * normalAlong * edgeX
        let normalY = normals[from + 1] - 2 * normalAlong * edgeY
        let normalZ = normals[from + 2] - 2 * normalAlong * edgeZ

        // Second reflection: mirror across the plane that turns the reflected
        // tangent of the parent into the tangent of the child.
        const toX = tangents[at] - reflectedTangentX
        const toY = tangents[at + 1] - reflectedTangentY
        const toZ = tangents[at + 2] - reflectedTangentZ
        const toLengthSquared = toX * toX + toY * toY + toZ * toZ

        if (toLengthSquared > EPSILON) {
            const factor =
                (2 * (normalX * toX + normalY * toY + normalZ * toZ)) / toLengthSquared

            normalX -= factor * toX
            normalY -= factor * toY
            normalZ -= factor * toZ
        }

        // Both reflections are rigid, so this only mops up rounding, but a
        // frame that has drifted off the ring's plane would show as a twist.
        const along = normalX * tangents[at] + normalY * tangents[at + 1] + normalZ * tangents[at + 2]

        normalX -= along * tangents[at]
        normalY -= along * tangents[at + 1]
        normalZ -= along * tangents[at + 2]

        const normalLength = Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ)

        if (normalLength > 1e-9) {
            normals[at] = normalX / normalLength
            normals[at + 1] = normalY / normalLength
            normals[at + 2] = normalZ / normalLength
        } else {
            const fresh = perpendicular(tangents[at], tangents[at + 1], tangents[at + 2])

            normals[at] = fresh[0]
            normals[at + 1] = fresh[1]
            normals[at + 2] = fresh[2]
        }
    }

    // --- Rings ----------------------------------------------------------
    const withChildren = new Uint8Array(count)
    let tips = 0

    for (let index = 0; index < count; index++) {
        const parentId = nodes[index].parentId

        if (parentId !== null && parentId >= 0 && parentId < count) {
            withChildren[parentId] = 1
        }
    }

    for (let index = 0; index < count; index++) {
        if (withChildren[index] === 0) {
            tips++
        }
    }

    const angles = new Float64Array(radialSegments * 2)

    for (let step = 0; step < radialSegments; step++) {
        const angle = (step / radialSegments) * Math.PI * 2

        angles[step * 2] = Math.cos(angle)
        angles[step * 2 + 1] = Math.sin(angle)
    }

    const capCount = 1 + (withChildren[0] === 0 ? tips - 1 : tips)
    const vertexCount = count * radialSegments + capCount
    const positions = new Float32Array(vertexCount * 3)

    for (let index = 0; index < count; index++) {
        const at = index * 3
        const node = nodes[index]
        const [x, y, z] = node.position
        const tangentX = tangents[at]
        const tangentY = tangents[at + 1]
        const tangentZ = tangents[at + 2]
        const normalX = normals[at]
        const normalY = normals[at + 1]
        const normalZ = normals[at + 2]
        const binormalX = tangentY * normalZ - tangentZ * normalY
        const binormalY = tangentZ * normalX - tangentX * normalZ
        const binormalZ = tangentX * normalY - tangentY * normalX
        const radius = node.radius
        const base = index * radialSegments

        for (let step = 0; step < radialSegments; step++) {
            const cos = angles[step * 2]
            const sin = angles[step * 2 + 1]
            const vertex = (base + step) * 3

            positions[vertex] = x + radius * (cos * normalX + sin * binormalX)
            positions[vertex + 1] = y + radius * (cos * normalY + sin * binormalY)
            positions[vertex + 2] = z + radius * (cos * normalZ + sin * binormalZ)
        }
    }

    // --- Faces ----------------------------------------------------------
    const indices: number[] = []

    for (let index = 1; index < count; index++) {
        const parentId = nodes[index].parentId

        if (parentId === null || parentId < 0 || parentId >= index) {
            continue
        }

        const from = parentId * radialSegments
        const to = index * radialSegments

        for (let step = 0; step < radialSegments; step++) {
            const next = (step + 1) % radialSegments
            const a = from + step
            const b = from + next
            const c = to + next
            const d = to + step

            indices.push(a, b, c)
            indices.push(a, c, d)
        }
    }

    // A cap goes on the base of the trunk and on every tip, and nowhere else:
    // an internal joint is a place where wood continues, not where it stops.
    let centre = count * radialSegments

    const addCap = (index: number, outward: boolean): void => {
        const ring = index * radialSegments

        positions[centre * 3] = nodes[index].position[0]
        positions[centre * 3 + 1] = nodes[index].position[1]
        positions[centre * 3 + 2] = nodes[index].position[2]

        for (let step = 0; step < radialSegments; step++) {
            const next = (step + 1) % radialSegments

            if (outward) {
                indices.push(centre, ring + step, ring + next)
            } else {
                indices.push(centre, ring + next, ring + step)
            }
        }

        centre++
    }

    addCap(0, false)

    for (let index = 1; index < count; index++) {
        if (withChildren[index] === 0) {
            addCap(index, true)
        }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()

    return geometry
}
