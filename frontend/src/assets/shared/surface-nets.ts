/**
 * Turning a distance field into a mesh.
 *
 * A field is negative inside the shape and positive outside. Surface nets gives
 * each cell the surface passes through one vertex, at the average of where the
 * surface crosses its edges, and each grid edge the surface crosses one quad,
 * joining the four cells around it. Each vertex is then settled onto the exact
 * field, and its normal comes from the field, so the result shades as one piece.
 *
 * Working out a slice of cells needs nothing from any other slice, so slices can
 * run on many threads and be joined in order afterwards.
 */

type Vec3 = readonly [number, number, number]

export interface SurfaceField {
    distance(x: number, y: number, z: number): number
    /** A unit vector pointing out of the shape. */
    gradient(x: number, y: number, z: number): Vec3
}

/** One slice of a surface, which can be worked on anywhere. */
export interface SurfaceChunk {
    /** Per cell, which of its three far edges the surface crosses. */
    readonly crossedEdges: Uint8Array
    /** Which cells of this slice got a vertex. */
    readonly vertexCells: Int32Array
    readonly positions: Float64Array
    readonly normals: Float64Array
    readonly colors: Float64Array
}

export interface MeshBuffers {
    readonly positions: number[]
    readonly normals: number[]
    readonly colors: number[]
    readonly indices: number[]
}

const SETTLE_ITERATIONS = 2

/** Grid corners are packed into one number so the sample cache is a plain map. */
const OFFSET = 1 << 9
const SPAN = 1 << 10

export const packedCell = (i: number, j: number, k: number) =>
    i + OFFSET + (j + OFFSET) * SPAN + (k + OFFSET) * SPAN * SPAN

const EDGE_X = 1
const EDGE_Y = 2
const EDGE_Z = 4

/**
 * Works out the surface inside a slice of the cells.
 *
 * @param paint Writes a vertex's colour, three numbers, given where it is and its normal.
 */
export function sculptCells(
    field: SurfaceField,
    cells: Int32Array,
    cell: number,
    paint: (x: number, y: number, z: number, normal: Vec3, colors: number[]) => void,
): SurfaceChunk {
    const samples = new Map<number, number>()
    const sample = (i: number, j: number, k: number): number => {
        const key = packedCell(i, j, k)
        let value = samples.get(key)

        if (value === undefined) {
            value = field.distance(i * cell, j * cell, k * cell)
            samples.set(key, value)
        }

        return value
    }

    const cellCount = cells.length / 3
    const crossedEdges = new Uint8Array(cellCount)
    const vertexCells: number[] = []
    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const corners = new Float64Array(8)

    for (let index = 0; index < cellCount; index++) {
        const i = cells[index * 3]
        const j = cells[index * 3 + 1]
        const k = cells[index * 3 + 2]
        let inside = 0

        for (let c = 0; c < 8; c++) {
            corners[c] = sample(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))

            if (corners[c] < 0) {
                inside++
            }
        }

        const here = corners[0] < 0

        crossedEdges[index] =
            (here !== corners[1] < 0 ? EDGE_X : 0) |
            (here !== corners[2] < 0 ? EDGE_Y : 0) |
            (here !== corners[4] < 0 ? EDGE_Z : 0)

        if (inside === 0 || inside === 8) {
            continue
        }

        let sumX = 0
        let sumY = 0
        let sumZ = 0
        let crossings = 0

        for (let c = 0; c < 8; c++) {
            for (const bit of [1, 2, 4]) {
                if (c & bit) {
                    continue
                }

                const d = c | bit
                const from = corners[c]
                const to = corners[d]

                if (from < 0 === to < 0) {
                    continue
                }

                const t = from / (from - to)
                const x0 = c & 1
                const y0 = (c >> 1) & 1
                const z0 = (c >> 2) & 1

                sumX += x0 + ((d & 1) - x0) * t
                sumY += y0 + (((d >> 1) & 1) - y0) * t
                sumZ += z0 + (((d >> 2) & 1) - z0) * t
                crossings++
            }
        }

        let x = (i + sumX / crossings) * cell
        let y = (j + sumY / crossings) * cell
        let z = (k + sumZ / crossings) * cell

        for (let iteration = 0; iteration < SETTLE_ITERATIONS; iteration++) {
            const value = field.distance(x, y, z)
            const gradient = field.gradient(x, y, z)
            const step = Math.max(-cell, Math.min(cell, value))

            x -= gradient[0] * step
            y -= gradient[1] * step
            z -= gradient[2] * step
        }

        const n = field.gradient(x, y, z)

        vertexCells.push(index)
        positions.push(x, y, z)
        normals.push(n[0], n[1], n[2])
        paint(x, y, z, n, colors)
    }

    return {
        crossedEdges,
        vertexCells: Int32Array.from(vertexCells),
        positions: Float64Array.from(positions),
        normals: Float64Array.from(normals),
        colors: Float64Array.from(colors),
    }
}

/**
 * Joins the slices into one surface, in their original order.
 *
 * @param groundLevel A face entirely below this height is left out.
 */
export function joinChunks(
    cells: Int32Array,
    chunks: readonly SurfaceChunk[],
    buffers: MeshBuffers,
    groundLevel: number,
): void {
    const vertexOf = new Map<number, number>()
    let offset = 0

    for (const chunk of chunks) {
        for (let v = 0; v < chunk.vertexCells.length; v++) {
            const at = (offset + chunk.vertexCells[v]) * 3

            vertexOf.set(packedCell(cells[at], cells[at + 1], cells[at + 2]), buffers.positions.length / 3)
            buffers.positions.push(chunk.positions[v * 3], chunk.positions[v * 3 + 1], chunk.positions[v * 3 + 2])
            buffers.normals.push(chunk.normals[v * 3], chunk.normals[v * 3 + 1], chunk.normals[v * 3 + 2])
            buffers.colors.push(chunk.colors[v * 3], chunk.colors[v * 3 + 1], chunk.colors[v * 3 + 2])
        }

        offset += chunk.crossedEdges.length
    }

    const pushTriangle = (a: number, b: number, c: number) => {
        const p = buffers.positions

        if (p[a * 3 + 1] < groundLevel && p[b * 3 + 1] < groundLevel && p[c * 3 + 1] < groundLevel) {
            return
        }

        const abx = p[b * 3] - p[a * 3]
        const aby = p[b * 3 + 1] - p[a * 3 + 1]
        const abz = p[b * 3 + 2] - p[a * 3 + 2]
        const acx = p[c * 3] - p[a * 3]
        const acy = p[c * 3 + 1] - p[a * 3 + 1]
        const acz = p[c * 3 + 2] - p[a * 3 + 2]
        const nx = aby * acz - abz * acy
        const ny = abz * acx - abx * acz
        const nz = abx * acy - aby * acx
        const n = buffers.normals
        const facing =
            nx * (n[a * 3] + n[b * 3] + n[c * 3]) +
            ny * (n[a * 3 + 1] + n[b * 3 + 1] + n[c * 3 + 1]) +
            nz * (n[a * 3 + 2] + n[b * 3 + 2] + n[c * 3 + 2])

        // The field already says which way is out, so winding never has to be
        // worked out edge by edge. All three corners vote: in a sharp crease one
        // corner's normal can point the other way from the face it sits on.
        if (facing >= 0) {
            buffers.indices.push(a, b, c)
        } else {
            buffers.indices.push(a, c, b)
        }
    }

    const quadAround = (around: readonly number[]) => {
        const a = vertexOf.get(around[0])
        const b = vertexOf.get(around[1])
        const c = vertexOf.get(around[2])
        const d = vertexOf.get(around[3])

        if (a === undefined || b === undefined || c === undefined || d === undefined) {
            return
        }

        pushTriangle(a, b, c)
        pushTriangle(a, c, d)
    }

    offset = 0

    for (const chunk of chunks) {
        for (let index = 0; index < chunk.crossedEdges.length; index++) {
            const edges = chunk.crossedEdges[index]

            if (edges === 0) {
                continue
            }

            const at = (offset + index) * 3
            const i = cells[at]
            const j = cells[at + 1]
            const k = cells[at + 2]

            if (edges & EDGE_X) {
                quadAround([packedCell(i, j - 1, k - 1), packedCell(i, j, k - 1), packedCell(i, j, k), packedCell(i, j - 1, k)])
            }

            if (edges & EDGE_Y) {
                quadAround([packedCell(i - 1, j, k - 1), packedCell(i, j, k - 1), packedCell(i, j, k), packedCell(i - 1, j, k)])
            }

            if (edges & EDGE_Z) {
                quadAround([packedCell(i - 1, j - 1, k), packedCell(i, j - 1, k), packedCell(i, j, k), packedCell(i - 1, j, k)])
            }
        }

        offset += chunk.crossedEdges.length
    }
}
