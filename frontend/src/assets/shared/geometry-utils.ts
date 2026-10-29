/**
 * Geometry helpers shared by every generator.
 *
 * These are ordinary TypeScript modules with no UI dependency, so they can
 * be tested on their own and reused in another runtime.
 */

import * as THREE from 'three'
import type {SpinePoint} from './component-types'

export type {SpinePoint}

/** The radius of a tapered form at a point along its length. */
export function taperedRadius(baseRadius: number, tipRadius: number, t: number): number {
    const k = Math.pow(Math.min(Math.max(t, 0), 1), 0.85)
    return baseRadius + (tipRadius - baseRadius) * k
}

/**
 * Builds the world-space points of a spine.
 *
 * The twist rotates the path around the vertical axis as it rises, which is
 * what makes a twisted trunk read as twisted.
 */
export function buildSpinePoints(
    spine: readonly SpinePoint[],
    height: number,
    twistDegrees: number,
): THREE.Vector3[] {
    const twist = THREE.MathUtils.degToRad(twistDegrees)

    return spine.map((point) => {
        const vector = new THREE.Vector3(point.x, point.t * height, point.z)

        if (twist !== 0) {
            vector.applyAxisAngle(new THREE.Vector3(0, 1, 0), twist * point.t)
        }

        return vector
    })
}

/** A smooth curve through the spine points. */
export function buildSpineCurve(points: readonly THREE.Vector3[]): THREE.CatmullRomCurve3 {
    return new THREE.CatmullRomCurve3(points.map((point) => point.clone()), false, 'centripetal', 0.5)
}

interface Frames {
    readonly tangents: THREE.Vector3[]
    readonly normals: THREE.Vector3[]
    readonly binormals: THREE.Vector3[]
}

/**
 * Parallel transport frames.
 *
 * A Frenet frame flips where the curve is nearly straight. Carrying the
 * normal along the curve and re-orthogonalising it keeps a trunk from
 * twisting on its own.
 */
function computeFrames(points: readonly THREE.Vector3[]): Frames {
    const tangents: THREE.Vector3[] = []

    for (let i = 0; i < points.length; i++) {
        const previous = points[Math.max(i - 1, 0)]
        const next = points[Math.min(i + 1, points.length - 1)]
        const tangent = next.clone().sub(previous)

        if (tangent.lengthSq() < 1e-12) {
            tangent.copy(tangents[i - 1] ?? new THREE.Vector3(0, 1, 0))
        }

        tangents.push(tangent.normalize())
    }

    const normals: THREE.Vector3[] = []
    const binormals: THREE.Vector3[] = []

    const seed = new THREE.Vector3(0, 0, 1)
    if (Math.abs(tangents[0].dot(seed)) > 0.9) {
        seed.set(1, 0, 0)
    }

    let normal = new THREE.Vector3().crossVectors(tangents[0], seed).normalize()

    for (let i = 0; i < points.length; i++) {
        if (i > 0) {
            const rotation = new THREE.Quaternion().setFromUnitVectors(tangents[i - 1], tangents[i])
            normal = normal.clone().applyQuaternion(rotation)
            normal.addScaledVector(tangents[i], -normal.dot(tangents[i])).normalize()
        }

        normals.push(normal.clone())
        binormals.push(new THREE.Vector3().crossVectors(tangents[i], normal).normalize())
    }

    return {tangents, normals, binormals}
}

export interface TaperedTubeOptions {
    readonly points: readonly THREE.Vector3[]
    readonly radii: readonly number[]
    readonly radialSegments: number
    readonly capBase: boolean
    readonly capTip: boolean
}

/**
 * Builds a tube with a varying radius along a path.
 *
 * The geometry carries explicit outward normals so the result lights
 * correctly without relying on face winding alone.
 */
export function buildTaperedTube(options: TaperedTubeOptions): THREE.BufferGeometry {
    const {points, radii, radialSegments, capBase, capTip} = options
    const ringCount = points.length

    if (ringCount < 2) {
        return new THREE.BufferGeometry()
    }

    const frames = computeFrames(points)

    const vertices: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const indices: number[] = []

    for (let i = 0; i < ringCount; i++) {
        const point = points[i]
        const radius = radii[i]
        const normal = frames.normals[i]
        const binormal = frames.binormals[i]

        for (let j = 0; j <= radialSegments; j++) {
            const angle = (j / radialSegments) * Math.PI * 2
            const sin = Math.sin(angle)
            const cos = -Math.cos(angle)

            const nx = cos * normal.x + sin * binormal.x
            const ny = cos * normal.y + sin * binormal.y
            const nz = cos * normal.z + sin * binormal.z

            vertices.push(point.x + radius * nx, point.y + radius * ny, point.z + radius * nz)
            normals.push(nx, ny, nz)
            uvs.push(j / radialSegments, i / (ringCount - 1))
        }
    }

    for (let i = 0; i < ringCount - 1; i++) {
        for (let j = 0; j < radialSegments; j++) {
            const a = (radialSegments + 1) * i + j
            const b = (radialSegments + 1) * (i + 1) + j
            const c = (radialSegments + 1) * (i + 1) + j + 1
            const d = (radialSegments + 1) * i + j + 1

            indices.push(a, b, d)
            indices.push(b, c, d)
        }
    }

    const addCap = (ringIndex: number, tip: boolean) => {
        const point = points[ringIndex]
        const centerIndex = vertices.length / 3

        vertices.push(point.x, point.y, point.z)

        const tangent = frames.tangents[ringIndex]
        const direction = tip ? 1 : -1
        normals.push(tangent.x * direction, tangent.y * direction, tangent.z * direction)
        uvs.push(0.5, tip ? 1 : 0)

        for (let j = 0; j < radialSegments; j++) {
            const current = (radialSegments + 1) * ringIndex + j
            const next = current + 1

            if (tip) {
                indices.push(centerIndex, current, next)
            } else {
                indices.push(centerIndex, next, current)
            }
        }
    }

    if (capBase) {
        addCap(0, false)
    }

    if (capTip) {
        addCap(ringCount - 1, true)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeBoundingSphere()

    return geometry
}

/**
 * Deterministic value noise in the range [-1, 1].
 *
 * Used to break up foliage clumps. The same coordinates always give the same
 * value, so a clump regenerates identically.
 */
export function valueNoise3(x: number, y: number, z: number, seed: number): number {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const zi = Math.floor(z)

    const xf = x - xi
    const yf = y - yi
    const zf = z - zi

    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const w = zf * zf * (3 - 2 * zf)

    const corner = (dx: number, dy: number, dz: number) => {
        let h = seed >>> 0
        h = Math.imul(h ^ Math.imul(xi + dx, 374761393), 668265263)
        h = Math.imul(h ^ Math.imul(yi + dy, 1274126177), 2246822519)
        h = Math.imul(h ^ Math.imul(zi + dz, 3266489917), 3266489917)
        h ^= h >>> 15

        return ((h >>> 0) / 4294967295) * 2 - 1
    }

    const x00 = lerp(corner(0, 0, 0), corner(1, 0, 0), u)
    const x10 = lerp(corner(0, 1, 0), corner(1, 1, 0), u)
    const x01 = lerp(corner(0, 0, 1), corner(1, 0, 1), u)
    const x11 = lerp(corner(0, 1, 1), corner(1, 1, 1), u)

    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w)
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
}

/**
 * Pushes every vertex along its normal by a deterministic amount.
 *
 * Turns a smooth sphere into a lumpy clump without changing its silhouette
 * much.
 */
export function displaceGeometry(
    geometry: THREE.BufferGeometry,
    amplitude: number,
    frequency: number,
    seed: number,
): THREE.BufferGeometry {
    const position = geometry.getAttribute('position')

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i)
        const y = position.getY(i)
        const z = position.getZ(i)

        const noise = valueNoise3(x * frequency, y * frequency, z * frequency, seed)
        const length = Math.sqrt(x * x + y * y + z * z) || 1

        position.setXYZ(
            i,
            x + (x / length) * noise * amplitude,
            y + (y / length) * noise * amplitude,
            z + (z / length) * noise * amplitude,
        )
    }

    position.needsUpdate = true
    geometry.computeVertexNormals()

    return geometry
}

/** The number of triangles a geometry contains. */
export function countTriangles(geometry: THREE.BufferGeometry): number {
    const index = geometry.getIndex()
    const count = index ? index.count : geometry.getAttribute('position').count

    return Math.floor(count / 3)
}
