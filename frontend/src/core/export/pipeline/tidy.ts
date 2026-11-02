/**
 * Tidying wood before it's written, so an engine drawing faces one-sided shows it whole.
 *
 * Each generator means its faces to point out, and the lighting directions on the
 * corners say where out is. A few faces still come out the wrong way: in tight folds of
 * sculpted wood at a light level, and where simplifying crushes a thin branch flat.
 * Leaves are left alone, as their cards are meant to be seen from both sides.
 */

import * as THREE from 'three'

/** Turns round any face pointing against all three of its corners, and drops repeated faces. */
export function tidyWood(geometry: THREE.BufferGeometry): void {
    const index = geometry.index

    if (!index) {
        return
    }

    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')
    const corners = Array.from(index.array)
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const corner = new THREE.Vector3()
    const facing = new THREE.Vector3()
    const place = (vertex: number) =>
        `${position.getX(vertex).toFixed(5)},${position.getY(vertex).toFixed(5)},${position.getZ(vertex).toFixed(5)}`
    const facesAt = new Map<string, number[]>()
    const facings: THREE.Vector3[] = []

    for (let face = 0; face < corners.length / 3; face++) {
        const [i, j, k] = corners.slice(face * 3, face * 3 + 3)

        a.fromBufferAttribute(position, i)
        b.fromBufferAttribute(position, j)
        c.fromBufferAttribute(position, k)
        facing.subVectors(c, b).cross(corner.subVectors(a, b))

        if (normal && [i, j, k].every((vertex) => corner.fromBufferAttribute(normal, vertex).dot(facing) < 0)) {
            corners[face * 3 + 1] = k
            corners[face * 3 + 2] = j
            facing.negate()
        }

        facings.push(facing.clone())

        const key = [place(i), place(j), place(k)].sort().join('|')

        facesAt.set(key, [...(facesAt.get(key) ?? []), face])
    }

    // A copy of a face on the same three points, facing the same way, adds nothing.
    // Two back to back are kept: they're a thin branch simplified flat, and still part
    // of the outline, seen from either side.
    const copies = new Set<number>()

    for (const faces of facesAt.values()) {
        for (const face of faces.slice(1)) {
            if (faces.slice(0, faces.indexOf(face)).some((earlier) => facings[earlier].dot(facings[face]) > 0)) {
                copies.add(face)
            }
        }
    }

    const kept = copies.size === 0 ? corners : corners.filter((_, at) => !copies.has(Math.floor(at / 3)))

    geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(kept), 1))
}
