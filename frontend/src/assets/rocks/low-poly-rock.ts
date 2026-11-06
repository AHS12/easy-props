/**
 * The low-poly rock: the same chunks as the normal one, as one shell of flat faces.
 *
 * The normal rock lets its chunks overlap and leaves the depth buffer to draw
 * the seams, with inset rings, a bend and painted gradients so it reads as
 * carved stone. Here each face keeps one colour and one facing, and every face
 * is cut back to where it is outside all the other chunks. What is left is the
 * outside of the rock and nothing buried in it, so the seams are true edges and
 * no face is spent where nobody can see it.
 */

import * as THREE from 'three'
import {chunksAtDetail, fitToPlan, PLAIN_BELOW, PLAIN_CUTS, rockPainter, type RockSurface} from './rock-mesh'
import {dot, facesOfChunk, type RockChunk, type RockPlan, type RockPlane, type Vec3} from './rock-plan'

/**
 * How close to another chunk's plane a point counts as outside it. Where two
 * chunks share a face both are kept: a doubled face shows nothing, a hole would.
 */
const TOUCHING = 1e-5
/** Pieces smaller than this share of the rock's size, squared, are dropped. */
const SPECK = 1e-8
/** How near two corners of a face's pieces count as one, as a share of the rock's size. */
const JOIN_TOLERANCE = 1e-6

type Polygon = readonly Vec3[]

const sideOf = (chunk: RockChunk, plane: RockPlane, p: Vec3) =>
    dot(plane.n, [p[0] - chunk.centre[0], p[1] - chunk.centre[1], p[2] - chunk.centre[2]]) - plane.d

/** The part of a polygon on one side of a chunk's plane: outside it, or within it. */
function split(polygon: Polygon, chunk: RockChunk, plane: RockPlane, outside: boolean): Vec3[] {
    const kept: Vec3[] = []
    const side = (p: Vec3) => (sideOf(chunk, plane, p) + TOUCHING) * (outside ? 1 : -1)

    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]
        const b = polygon[(i + 1) % polygon.length]
        const sa = side(a)
        const sb = side(b)

        if (sa >= 0) {
            kept.push(a)
        }

        if (sa >= 0 !== sb >= 0) {
            const t = sa / (sa - sb)

            kept.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
        }
    }

    return kept
}

/** What is left of a polygon once a chunk is taken out of it, as convex pieces. */
function outsideOf(polygon: Polygon, chunk: RockChunk): Polygon[] {
    const pieces: Polygon[] = []
    let rest: Polygon = polygon

    for (const plane of chunk.planes) {
        const out = split(rest, chunk, plane, true)

        if (out.length >= 3) {
            pieces.push(out)
        }

        rest = split(rest, chunk, plane, false)

        if (rest.length < 3) {
            return pieces
        }
    }

    // What remains is inside the chunk.
    return pieces
}

const areaOf = (polygon: Polygon) => {
    let x = 0
    let y = 0
    let z = 0

    for (let i = 1; i < polygon.length - 1; i++) {
        const [a, b, c] = [polygon[0], polygon[i], polygon[i + 1]]
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]

        x += u[1] * v[2] - u[2] * v[1]
        y += u[2] * v[0] - u[0] * v[2]
        z += u[0] * v[1] - u[1] * v[0]
    }

    return Math.hypot(x, y, z) / 2
}

type Flat = readonly [number, number]

const signedArea = (loop: readonly Flat[]) =>
    loop.reduce((sum, [x, y], i) => {
        const [nx, ny] = loop[(i + 1) % loop.length]

        return sum + x * ny - nx * y
    }, 0) / 2

/** Drops corners that lie on the line between their neighbours: they add faces and no shape. */
function withoutStraightCorners(loop: Flat[], tolerance: number): Flat[] {
    let changed = true

    while (changed && loop.length > 3) {
        changed = false

        for (let i = 0; i < loop.length && loop.length > 3; i++) {
            const [ax, ay] = loop[(i + loop.length - 1) % loop.length]
            const [bx, by] = loop[i]
            const [cx, cy] = loop[(i + 1) % loop.length]
            const span = Math.hypot(cx - ax, cy - ay)

            if (span > 0 && Math.abs((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / span < tolerance) {
                loop.splice(i, 1)
                changed = true
                i--
            }
        }
    }

    return loop
}

/**
 * The pieces a face was cut into, joined back into its outline, with holes where
 * another chunk comes through it, and filled with as few triangles as that takes.
 * Cutting leaves many small pieces; joined, a face costs about what an uncut one does.
 * Null when the pieces do not join into clean loops.
 */
function joinPieces(pieces: readonly Polygon[], plane: RockPlane, tolerance: number): Vec3[][] | null {
    const n = plane.n
    const helper: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const u = normalize3([n[1] * helper[2] - n[2] * helper[1], n[2] * helper[0] - n[0] * helper[2], n[0] * helper[1] - n[1] * helper[0]])
    const v: Vec3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]]
    const origin = pieces[0][0]
    const toFlat = (p: Vec3): Flat => {
        const d = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]]

        return [d[0] * u[0] + d[1] * u[1] + d[2] * u[2], d[0] * v[0] + d[1] * v[1] + d[2] * v[2]]
    }
    const points: Flat[] = []
    const ids = new Map<string, number>()
    const idOf = (p: Flat) => {
        const key = `${Math.round(p[0] / tolerance)},${Math.round(p[1] / tolerance)}`
        let id = ids.get(key)

        if (id === undefined) {
            id = points.length
            ids.set(key, id)
            points.push(p)
        }

        return id
    }
    const loops = pieces.map((piece) => piece.map((p) => idOf(toFlat(p))))
    const edges = new Map<string, number>()

    for (const loop of loops) {
        for (let i = 0; i < loop.length; i++) {
            const a = loop[i]
            const b = loop[(i + 1) % loop.length]

            if (a === b) {
                continue
            }

            // A neighbouring piece may have corners partway along this edge: the edge is split at them.
            const [ax, ay] = points[a]
            const [bx, by] = points[b]
            const length = Math.hypot(bx - ax, by - ay)
            const along = points
                .map((p, id) => ({id, t: ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / (length * length), off: Math.abs((bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax)) / length}))
                .filter(({id, t, off}) => id !== a && id !== b && t > 0 && t < 1 && off < tolerance)
                .sort((p, q) => p.t - q.t)
                .map(({id}) => id)
            const chain = [a, ...along, b]

            for (let k = 0; k < chain.length - 1; k++) {
                const key = `${chain[k]}>${chain[k + 1]}`
                const back = `${chain[k + 1]}>${chain[k]}`

                // An edge two pieces share runs both ways, and is inside the face.
                if (edges.has(back)) {
                    const left = edges.get(back)! - 1

                    if (left === 0) {
                        edges.delete(back)
                    } else {
                        edges.set(back, left)
                    }
                } else {
                    edges.set(key, (edges.get(key) ?? 0) + 1)
                }
            }
        }
    }

    const next = new Map<number, number[]>()

    for (const [key, count] of edges) {
        const [a, b] = key.split('>').map(Number)

        for (let k = 0; k < count; k++) {
            next.set(a, [...(next.get(a) ?? []), b])
        }
    }

    const outlines: Flat[][] = []

    while (next.size > 0) {
        const start = next.keys().next().value!
        const loop: number[] = [start]
        let at = start

        for (;;) {
            const choices = next.get(at)

            if (!choices || choices.length === 0) {
                return null
            }

            const to = choices.pop()!

            if (choices.length === 0) {
                next.delete(at)
            }

            if (to === start) {
                break
            }

            loop.push(to)
            at = to

            if (loop.length > points.length + 1) {
                return null
            }
        }

        if (loop.length >= 3) {
            outlines.push(withoutStraightCorners(loop.map((id) => points[id]), tolerance))
        }
    }

    const outers = outlines.filter((loop) => signedArea(loop) > 0)
    const holes = outlines.filter((loop) => signedArea(loop) < 0)
    const inside = (point: Flat, loop: readonly Flat[]) => {
        let odd = false

        for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
            const [xi, yi] = loop[i]
            const [xj, yj] = loop[j]

            if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
                odd = !odd
            }
        }

        return odd
    }
    const toSpace = ([x, y]: Flat): Vec3 => [origin[0] + u[0] * x + v[0] * y, origin[1] + u[1] * x + v[1] * y, origin[2] + u[2] * x + v[2] * y]
    const triangles: Vec3[][] = []

    for (const outer of outers) {
        const own = holes.filter((hole) => inside(hole[0], outer))
        const all = [outer, ...own].flat()

        for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(
            outer.map(([x, y]) => new THREE.Vector2(x, y)),
            own.map((hole) => hole.map(([x, y]) => new THREE.Vector2(x, y))),
        )) {
            const corners = [all[a], all[b], all[c]]

            // Kept turning the way the face does, so it faces out.
            triangles.push((signedArea(corners) > 0 ? corners : [corners[0], corners[2], corners[1]]).map(toSpace))
        }
    }

    return triangles
}

const normalize3 = (a: readonly number[]): Vec3 => {
    const length = Math.hypot(a[0], a[1], a[2]) || 1

    return [a[0] / length, a[1] / length, a[2] / length]
}

function shellAt(plan: RockPlan, surface: RockSurface, detail: number, cutShare: number): THREE.BufferGeometry {
    const chunks = chunksAtDetail(plan, detail, cutShare)
    const paint = rockPainter(plan, chunks, surface)
    const size = (plan.width + plan.height + plan.depth) / 3
    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []

    chunks.forEach((chunk, chunkIndex) => {
        for (const {plane, corners} of facesOfChunk(chunk)) {
            let pieces: Polygon[] = [corners]

            chunks.forEach((other, index) => {
                if (index !== chunkIndex && pieces.length > 0) {
                    pieces = pieces.flatMap((piece) => outsideOf(piece, other))
                }
            })

            const count = corners.length
            const middle: Vec3 = [0, 1, 2].map((axis) => corners.reduce((sum, p) => sum + p[axis], 0) / count) as unknown as Vec3
            // One colour for the whole face, however many pieces it is cut into.
            const colour = paint(middle, plane, chunkIndex, false)

            const kept = pieces.filter((piece) => areaOf(piece) >= SPECK * size * size)

            if (kept.length === 0) {
                continue
            }

            const triangles =
                (kept.length > 1 ? joinPieces(kept, plane, size * JOIN_TOLERANCE) : null) ??
                kept.flatMap((piece) => piece.slice(1, -1).map((_, i) => [piece[0], piece[i + 1], piece[i + 2]]))

            for (const triangle of triangles) {
                for (const p of triangle) {
                    positions.push(p[0], p[1], p[2])
                    normals.push(plane.n[0], plane.n[1], plane.n[2])
                    colors.push(colour.r, colour.g, colour.b)
                }
            }
        }
    })

    if (detail < PLAIN_BELOW) {
        fitToPlan(positions, plan)
    }

    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.computeBoundingSphere()

    return geometry
}

const faceCount = (geometry: THREE.BufferGeometry) => geometry.getAttribute('position').count / 3

/**
 * A low-poly rock. Every face is a side of a chunk, so it has nothing to give up
 * until the plainest level, which keeps its largest chunks and its first cuts.
 * Dropping cuts any sooner grows the chunks back over the corners they cut off.
 */
export function buildLowPolyRockMesh(plan: RockPlan, surface: RockSurface, detail: number): THREE.BufferGeometry {
    if (detail >= PLAIN_BELOW) {
        return shellAt(plan, surface, 1, 1)
    }

    const full = shellAt(plan, surface, 1, 1)
    // It starts with a fraction of a normal rock's faces, so it aims for a share of
    // its own faces as large as the plain normal rock keeps of its own.
    const target = faceCount(full) * (detail / PLAIN_BELOW)
    let best = full

    for (const cutShare of PLAIN_CUTS) {
        const geometry = shellAt(plan, surface, detail, cutShare)

        if (Math.abs(faceCount(geometry) - target) < Math.abs(faceCount(best) - target)) {
            best.dispose()
            best = geometry
        } else {
            geometry.dispose()
        }
    }

    return best
}
