/**
 * The fixed material palette.
 *
 * A tree always reads as a coherent object because every generator draws
 * from this set. The same colours are used by the viewport and by the GLB
 * exporter, so an exported asset looks like what the user saw.
 */

import * as THREE from 'three'

export const MATERIAL_COLORS = {
    bark: '#6b4e35',
    barkLight: '#8a6a4f',
    leaves: '#4e7d3e',
    leavesDark: '#3a6130',
    coconut: '#7a5c3e',
} as const

export const VIEWPORT_COLORS = {
    background: '#2b332c',
    ground: '#333c33',
    grid: '#3a443a',
    gridMajor: '#46503f',
    selection: '#5c8c4a',
} as const

export function createSurfaceMaterial(color: string, flatShading: boolean): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.85,
        metalness: 0,
        flatShading,
    })
}
