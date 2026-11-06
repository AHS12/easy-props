/**
 * Mesh simplification by edge collapse with quadric error, after Garland and
 * Heckbert, "Surface Simplification Using Quadric Error Metrics" (1997).
 *
 * Every vertex carries the sum of the planes of the faces around it, as a 4x4
 * quadric. Collapsing an edge merges its two ends into one point, placed where
 * the summed quadric is least, and the cheapest collapse always goes first. So
 * flat stretches lose their vertices early and creases, joints and tips keep
 * theirs: a dense surface becomes the few large faces of a low-poly model.
 *
 * A collapse is refused if it would fold a face over, leave a sliver, or join
 * two parts of the surface that only touch: the result stays one clean shell.
 */

export interface SimplifyOptions {
    /** Stop once this few faces are left. */
    readonly targetFaces: number
    /** Stop once the cheapest collapse would move the surface by more than this, squared. */
    readonly maxError: number
}

export interface SimplifiedMesh {
    readonly positions: number[]
    readonly indices: number[]
}

/** The least a face may turn in one collapse, as the cosine between its old and new facing. */
const MAX_TURN = 0.2
/**
 * The most a face may turn away from the facing it started with, over all its
 * collapses. Many small turns can otherwise add up to a face folded inside out.
 */
const MAX_DRIFT = 0.1
/** The thinnest a face may become, as its area against the square of its longest side. */
const MIN_SHAPE = 0.02

interface Candidate {
    cost: number
    a: number
    b: number
    stampA: number
    stampB: number
    x: number
    y: number
    z: number
}

/** A binary heap of candidates, cheapest first. */
class Heap {
    private readonly items: Candidate[] = []

    get size() {
        return this.items.length
    }

    push(item: Candidate) {
        const items = this.items
        let at = items.push(item) - 1

        while (at > 0) {
            const parent = (at - 1) >> 1

            if (items[parent].cost <= item.cost) {
                break
            }

            items[at] = items[parent]
            at = parent
        }

        items[at] = item
    }

    pop(): Candidate | undefined {
        const items = this.items
        const top = items[0]
        const last = items.pop()

        if (items.length > 0 && last) {
            let at = 0

            for (;;) {
                const left = at * 2 + 1
                const right = left + 1
                let smallest = at
                let smallestCost = last.cost

                if (left < items.length && items[left].cost < smallestCost) {
                    smallest = left
                    smallestCost = items[left].cost
                }

                if (right < items.length && items[right].cost < smallestCost) {
                    smallest = right
                }

                if (smallest === at) {
                    break
                }

                items[at] = items[smallest]
                at = smallest
            }

            items[at] = last
        }

        return top
    }
}

export function simplifyMesh(sourcePositions: ArrayLike<number>, sourceIndices: ArrayLike<number>, options: SimplifyOptions): SimplifiedMesh {
    const vertexCount = sourcePositions.length / 3
    const faceCount = sourceIndices.length / 3
    const positions = Float64Array.from(sourcePositions)
    const faces = Int32Array.from(sourceIndices)
    const faceAlive = new Uint8Array(faceCount).fill(1)
    const vertexAlive = new Uint8Array(vertexCount).fill(1)
    const stamps = new Uint32Array(vertexCount)
    // Symmetric 4x4 per vertex: aa ab ac ad bb bc bd cc cd dd.
    const quadrics = new Float64Array(vertexCount * 10)
    const vertexFaces: number[][] = Array.from({length: vertexCount}, () => [])
    // Each face's facing on the surface as it came in, unit length, or zero for a face with no area.
    const firstFacing = new Float64Array(faceCount * 3)
    let liveFaces = faceCount

    const point = (v: number): [number, number, number] => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]

    const facePlane = (a: number[], b: number[], c: number[]) => {
        const ux = b[0] - a[0]
        const uy = b[1] - a[1]
        const uz = b[2] - a[2]
        const vx = c[0] - a[0]
        const vy = c[1] - a[1]
        const vz = c[2] - a[2]

        return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
    }

    for (let f = 0; f < faceCount; f++) {
        const [a, b, c] = [faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2]]

        if (a === b || b === c || a === c) {
            faceAlive[f] = 0
            liveFaces--
            continue
        }

        const n = facePlane(point(a), point(b), point(c))
        const length = Math.hypot(n[0], n[1], n[2])

        if (length < 1e-14) {
            // A face with no area still holds the surface together, but adds no plane.
            vertexFaces[a].push(f)
            vertexFaces[b].push(f)
            vertexFaces[c].push(f)
            continue
        }

        // Weighted by area, so a large face's plane counts for more than a small one's.
        const weight = length / 2
        const [nx, ny, nz] = [n[0] / length, n[1] / length, n[2] / length]

        firstFacing.set([nx, ny, nz], f * 3)
        const d = -(nx * positions[a * 3] + ny * positions[a * 3 + 1] + nz * positions[a * 3 + 2])
        const plane = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d]

        for (const v of [a, b, c]) {
            for (let k = 0; k < 10; k++) {
                quadrics[v * 10 + k] += plane[k] * weight
            }

            vertexFaces[v].push(f)
        }
    }

    const neighbours = (v: number): Set<number> => {
        const around = new Set<number>()

        for (const f of vertexFaces[v]) {
            if (faceAlive[f]) {
                for (let k = 0; k < 3; k++) {
                    const other = faces[f * 3 + k]

                    if (other !== v) {
                        around.add(other)
                    }
                }
            }
        }

        return around
    }

    const errorAt = (q: Float64Array, x: number, y: number, z: number) =>
        q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x +
        q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y +
        q[7] * z * z + 2 * q[8] * z + q[9]

    const merged = new Float64Array(10)

    const candidate = (a: number, b: number): Candidate => {
        for (let k = 0; k < 10; k++) {
            merged[k] = quadrics[a * 10 + k] + quadrics[b * 10 + k]
        }

        const q = merged
        // The point of least error solves a 3x3 system. Where it is near
        // singular, as on a flat or straight stretch, the ends and the middle are tried.
        const det =
            q[0] * (q[4] * q[7] - q[5] * q[5]) - q[1] * (q[1] * q[7] - q[5] * q[2]) + q[2] * (q[1] * q[5] - q[4] * q[2])
        const [ax, ay, az] = point(a)
        const [bx, by, bz] = point(b)
        const span = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2
        let best = {x: (ax + bx) / 2, y: (ay + by) / 2, z: (az + bz) / 2, cost: Infinity}

        if (Math.abs(det) > 1e-12 * Math.max(span * span * span, 1e-30)) {
            const x =
                (-q[3] * (q[4] * q[7] - q[5] * q[5]) + q[1] * (q[6] * q[7] - q[5] * q[8]) - q[2] * (q[6] * q[5] - q[4] * q[8])) / det
            const y =
                (-q[0] * (q[6] * q[7] - q[8] * q[5]) + q[3] * (q[1] * q[7] - q[5] * q[2]) - q[2] * (q[1] * q[8] - q[6] * q[2])) / det
            const z =
                (-q[0] * (q[4] * q[8] - q[5] * q[6]) + q[1] * (q[1] * q[8] - q[6] * q[2]) - q[3] * (q[1] * q[5] - q[4] * q[2])) / det
            const mx = (ax + bx) / 2
            const my = (ay + by) / 2
            const mz = (az + bz) / 2

            // Kept near the edge: far off, the solve is chasing noise.
            if ((x - mx) ** 2 + (y - my) ** 2 + (z - mz) ** 2 <= span * 4) {
                best = {x, y, z, cost: errorAt(q, x, y, z)}
            }
        }

        for (const [x, y, z] of [
            [ax, ay, az],
            [bx, by, bz],
            [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2],
        ]) {
            const cost = errorAt(q, x, y, z)

            if (cost < best.cost) {
                best = {x, y, z, cost}
            }
        }

        return {cost: Math.max(best.cost, 0), a, b, stampA: stamps[a], stampB: stamps[b], x: best.x, y: best.y, z: best.z}
    }

    const heap = new Heap()
    const seen = new Set<number>()

    for (let f = 0; f < faceCount; f++) {
        if (!faceAlive[f]) {
            continue
        }

        for (let k = 0; k < 3; k++) {
            const a = faces[f * 3 + k]
            const b = faces[f * 3 + ((k + 1) % 3)]
            const key = a < b ? a * vertexCount + b : b * vertexCount + a

            if (!seen.has(key)) {
                seen.add(key)
                heap.push(candidate(a, b))
            }
        }
    }

    /** Whether moving `v` to the new point leaves every face around it facing about as it did, and not a sliver. */
    const keepsShape = (v: number, other: number, x: number, y: number, z: number) => {
        for (const f of vertexFaces[v]) {
            if (!faceAlive[f]) {
                continue
            }

            const corners = [faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2]]

            // The two faces on the edge itself go away.
            if (corners.includes(other)) {
                continue
            }

            const before = corners.map(point)
            const after = corners.map((corner) => (corner === v ? [x, y, z] : point(corner)))
            const n0 = facePlane(before[0], before[1], before[2])
            const n1 = facePlane(after[0], after[1], after[2])
            const l0 = Math.hypot(n0[0], n0[1], n0[2])
            const l1 = Math.hypot(n1[0], n1[1], n1[2])

            if (l1 < 1e-14) {
                return false
            }

            if (l0 > 1e-14 && (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) / (l0 * l1) < MAX_TURN) {
                return false
            }

            if ((firstFacing[f * 3] * n1[0] + firstFacing[f * 3 + 1] * n1[1] + firstFacing[f * 3 + 2] * n1[2]) / l1 < MAX_DRIFT && firstFacing[f * 3] ** 2 + firstFacing[f * 3 + 1] ** 2 + firstFacing[f * 3 + 2] ** 2 > 0.5) {
                return false
            }

            const longest = Math.max(
                ...[0, 1, 2].map((k) => {
                    const p = after[k]
                    const q = after[(k + 1) % 3]

                    return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2
                }),
            )

            if (l1 / 2 / longest < MIN_SHAPE) {
                return false
            }
        }

        return true
    }

    while (heap.size > 0 && liveFaces > options.targetFaces) {
        const next = heap.pop()!
        const {a, b} = next

        if (!vertexAlive[a] || !vertexAlive[b] || stamps[a] !== next.stampA || stamps[b] !== next.stampB) {
            continue
        }

        if (next.cost > options.maxError) {
            break
        }

        const aroundA = neighbours(a)

        if (!aroundA.has(b)) {
            continue
        }

        // An edge may only collapse if its ends share no neighbours but the two
        // across its own faces. Otherwise two parts of the surface would fuse.
        const aroundB = neighbours(b)
        let shared = 0
        let edgeFaces = 0

        for (const v of aroundB) {
            if (aroundA.has(v)) {
                shared++
            }
        }

        for (const f of vertexFaces[a]) {
            if (faceAlive[f] && (faces[f * 3] === b || faces[f * 3 + 1] === b || faces[f * 3 + 2] === b)) {
                edgeFaces++
            }
        }

        if (edgeFaces !== 2 || shared !== 2) {
            continue
        }

        if (!keepsShape(a, b, next.x, next.y, next.z) || !keepsShape(b, a, next.x, next.y, next.z)) {
            continue
        }

        positions[a * 3] = next.x
        positions[a * 3 + 1] = next.y
        positions[a * 3 + 2] = next.z

        for (let k = 0; k < 10; k++) {
            quadrics[a * 10 + k] += quadrics[b * 10 + k]
        }

        for (const f of vertexFaces[b]) {
            if (!faceAlive[f]) {
                continue
            }

            const hasA = faces[f * 3] === a || faces[f * 3 + 1] === a || faces[f * 3 + 2] === a

            if (hasA) {
                faceAlive[f] = 0
                liveFaces--
                continue
            }

            for (let k = 0; k < 3; k++) {
                if (faces[f * 3 + k] === b) {
                    faces[f * 3 + k] = a
                }
            }

            vertexFaces[a].push(f)
        }

        vertexAlive[b] = 0
        vertexFaces[a] = vertexFaces[a].filter((f) => faceAlive[f])
        stamps[a]++

        for (const v of neighbours(a)) {
            stamps[v]++
        }

        for (const v of neighbours(a)) {
            heap.push(candidate(a, v))

            // A neighbour's other edges changed cost only through its own stamp.
            for (const w of neighbours(v)) {
                if (w !== a) {
                    heap.push(candidate(v, w))
                }
            }
        }
    }

    const remap = new Int32Array(vertexCount).fill(-1)
    const outPositions: number[] = []
    const outIndices: number[] = []

    for (let f = 0; f < faceCount; f++) {
        if (!faceAlive[f]) {
            continue
        }

        for (let k = 0; k < 3; k++) {
            const v = faces[f * 3 + k]

            if (remap[v] < 0) {
                remap[v] = outPositions.length / 3
                outPositions.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2])
            }

            outIndices.push(remap[v])
        }
    }

    return {positions: outPositions, indices: outIndices}
}
