/**
 * GLB export.
 *
 * An export builds its own scene from the graph and throws it away again, so
 * the viewport's objects stay untouched and nothing it created outlives the
 * file.
 */

import * as THREE from 'three'
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js'
import {createSeededRandom} from '../../assets/shared/random'
import type {SceneComponent} from '../../assets/shared/component-types'
import {findComponentGenerator} from '../../assets/trees/component-generators'
import {createPartMaterial} from '../../assets/style/part-material'
import type {StyleProfile} from '../../assets/style/style-profiles'
import type {Scene, SceneMaterials} from '../scene/scene-model'
import {materialColor} from '../../viewport/scene/component-renderer'

export interface ExportOptions {
    readonly style: StyleProfile
}

/** The geometry and materials an export has to dispose of afterwards. */
interface ExportResources {
    readonly geometries: THREE.BufferGeometry[]
    readonly materials: THREE.Material[]
}

function hasFinitePositions(geometry: THREE.BufferGeometry): boolean {
    const position = geometry.getAttribute('position')

    if (!position) {
        return false
    }

    const values = position.array

    for (let i = 0; i < values.length; i++) {
        if (!Number.isFinite(values[i])) {
            return false
        }
    }

    return true
}

/**
 * Makes a generated geometry safe to export.
 *
 * A geometry with a broken coordinate is dropped rather than written out:
 * one NaN vertex makes the whole file unreadable in most viewers.
 */
function isExportable(geometry: THREE.BufferGeometry): boolean {
    if (!hasFinitePositions(geometry)) {
        return false
    }

    if (!geometry.getAttribute('normal')) {
        geometry.computeVertexNormals()
    }

    return true
}

function buildComponentGroup(
    component: SceneComponent,
    style: StyleProfile,
    materials: SceneMaterials,
    resources: ExportResources,
): THREE.Group | undefined {
    const generator = findComponentGenerator(component.generatorId)

    if (!generator) {
        return undefined
    }

    const validated = generator.validate(component.parameters)

    const part = generator.generate(validated.parameters, {
        random: createSeededRandom(component.seed),
        seed: component.seed,
        style,
    })

    resources.geometries.push(part.geometry)

    if (!isExportable(part.geometry)) {
        return undefined
    }

    const material = createPartMaterial(part, materialColor(part.material, materials), style.flatShading)

    resources.materials.push(material)

    const mesh = new THREE.Mesh(part.geometry, material)
    mesh.name = `${component.type}_${component.id}_mesh`

    const group = new THREE.Group()
    group.name = `${component.type}_${component.id}`
    group.position.set(...component.transform.position)
    group.rotation.set(...component.transform.rotation)
    group.scale.set(...component.transform.scale)
    group.add(mesh)

    return group
}

/**
 * Writes the scene out as a binary glTF file.
 *
 * The asset's components already carry world-space transforms, so every group
 * hangs off the root. Nesting them by `parentId` would apply a parent's
 * transform a second time.
 */
export async function exportGLB(scene: Scene, options: ExportOptions): Promise<ArrayBuffer> {
    const root = new THREE.Scene()
    root.name = scene.id

    const resources: ExportResources = {geometries: [], materials: []}

    const asset = scene.assets[0]

    if (asset) {
        for (const component of asset.components) {
            const group = buildComponentGroup(component, options.style, asset.materials, resources)

            if (group) {
                root.add(group)
            }
        }
    }

    try {
        const exported = await new GLTFExporter().parseAsync(root, {binary: true})

        if (!(exported instanceof ArrayBuffer)) {
            throw new Error('The export did not produce a binary glTF file.')
        }

        return exported
    } finally {
        root.clear()

        for (const geometry of resources.geometries) {
            geometry.dispose()
        }

        for (const material of resources.materials) {
            material.dispose()
        }
    }
}
