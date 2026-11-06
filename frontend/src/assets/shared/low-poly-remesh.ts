/**
 * A smooth shape made low-poly: sampled on a grid, pulled out as one surface by
 * surface nets, then cut down to a few large flat faces by quadric error.
 */

import {simplifyMesh} from './simplify'
import {joinChunks, packedCell, sculptCells, type MeshBuffers, type SurfaceField} from './surface-nets'

type Vec3 = readonly [number, number, number]

const GRADIENT_STEP = 0.004

/** Smooth minimum: the two shapes melt into one with a fillet of about `k`. */
export function smin(a: number, b: number, k: number): number {
    if (k <= 0) {
        return Math.min(a, b)
    }

    const h = Math.max(k - Math.abs(a - b), 0) / k

    return Math.min(a, b) - h * h * k * 0.25
}

export function withGradient(distance: (x: number, y: number, z: number) => number): SurfaceField {
    return {
        distance,
        gradient(x, y, z) {
            const e = GRADIENT_STEP
            const gx = distance(x + e, y, z) - distance(x - e, y, z)
            const gy = distance(x, y + e, z) - distance(x, y - e, z)
            const gz = distance(x, y, z + e) - distance(x, y, z - e)
            const length = Math.hypot(gx, gy, gz)

            return length < 1e-12 ? [0, 1, 0] : [gx / length, gy / length, gz / length]
        },
    }
}

/** Every grid cell within a box around each shape: a prop is mostly air. */
export function cellsAround(boxes: readonly {min: Vec3; max: Vec3}[], cell: number): Int32Array {
    const seen = new Set<number>()
    const cells: number[] = []

    for (const {min, max} of boxes) {
        const low = min.map((value) => Math.floor(value / cell) - 1)
        const high = max.map((value) => Math.floor(value / cell) + 1)

        for (let i = low[0]; i <= high[0]; i++) {
            for (let j = low[1]; j <= high[1]; j++) {
                for (let k = low[2]; k <= high[2]; k++) {
                    const key = packedCell(i, j, k)

                    if (!seen.has(key)) {
                        seen.add(key)
                        cells.push(i, j, k)
                    }
                }
            }
        }
    }

    return Int32Array.from(cells)
}

/** One surface out of a field, cut down to its few faces. */
export function lowPolySurface(field: SurfaceField, cells: Int32Array, cell: number, maxError: number, targetFaces: number) {
    const chunk = sculptCells(field, cells, cell, (_x, _y, _z, _n, colors) => colors.push(0, 0, 0))
    const buffers: MeshBuffers = {positions: [], normals: [], colors: [], indices: []}

    joinChunks(cells, [chunk], buffers, -Infinity)

    return simplifyMesh(buffers.positions, buffers.indices, {targetFaces, maxError: maxError * maxError})
}
