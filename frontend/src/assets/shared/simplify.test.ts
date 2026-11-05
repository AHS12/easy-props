import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {edgeUse} from '../../tests/mesh-checks'
import {simplifyMesh} from './simplify'

function sphere() {
    const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, 16).deleteAttribute('normal').deleteAttribute('uv'))

    return {positions: Array.from(geometry.getAttribute('position').array), indices: Array.from(geometry.index!.array)}
}

describe('simplifying a surface', () => {
    it('cuts a dense ball down to the faces asked for', () => {
        const {positions, indices} = sphere()
        const simple = simplifyMesh(positions, indices, {targetFaces: 120, maxError: Infinity})

        expect(indices.length / 3).toBeGreaterThan(5000)
        expect(simple.indices.length / 3).toBeLessThanOrEqual(120)
        expect(simple.indices.length / 3).toBeGreaterThan(80)
    })

    it('keeps a closed surface closed', () => {
        const {positions, indices} = sphere()
        const simple = simplifyMesh(positions, indices, {targetFaces: 200, maxError: Infinity})

        expect([...edgeUse(simple.indices).values()].every((count) => count === 2)).toBe(true)
    })

    it('stays close to the shape it simplifies', () => {
        const {positions, indices} = sphere()
        const simple = simplifyMesh(positions, indices, {targetFaces: 200, maxError: Infinity})

        for (let at = 0; at < simple.positions.length; at += 3) {
            expect(Math.hypot(simple.positions[at], simple.positions[at + 1], simple.positions[at + 2])).toBeCloseTo(1, 1)
        }
    })

    it('stops early when every collapse left would move the surface too far', () => {
        const {positions, indices} = sphere()
        const loose = simplifyMesh(positions, indices, {targetFaces: 0, maxError: 1e-4})
        const tight = simplifyMesh(positions, indices, {targetFaces: 0, maxError: 1e-7})

        expect(tight.indices.length).toBeGreaterThan(loose.indices.length)
    })
})
