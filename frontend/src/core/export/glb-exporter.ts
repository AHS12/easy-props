/**
 * GLB writing, the last step of an export.
 *
 * It writes the meshes it is given as they are, each a node of the root. The
 * materials and geometry are the caller's until the file is out, then disposed
 * here, so nothing an export created outlives it.
 */

import * as THREE from 'three'
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js'

export interface NamedMesh {
    readonly name: string
    readonly geometry: THREE.BufferGeometry
    readonly material: THREE.Material
}

export async function writeGLB(meshes: readonly NamedMesh[], name: string): Promise<ArrayBuffer> {
    const root = new THREE.Scene()
    root.name = name

    for (const {name: meshName, geometry, material} of meshes) {
        const mesh = new THREE.Mesh(geometry, material)

        mesh.name = meshName
        geometry.name = meshName
        root.add(mesh)
    }

    try {
        const exported = await new GLTFExporter()
            // The exporter names nodes but not meshes, and an engine lists both.
            .register(() => ({
                writeMesh(mesh: THREE.Mesh, meshDef: {name?: string}) {
                    meshDef.name = mesh.name
                },
            }))
            .parseAsync(root, {binary: true})

        if (!(exported instanceof ArrayBuffer)) {
            throw new Error('The export did not produce a binary glTF file.')
        }

        return exported
    } finally {
        root.clear()

        for (const {geometry, material} of meshes) {
            geometry.dispose()
            material.dispose()
        }
    }
}
