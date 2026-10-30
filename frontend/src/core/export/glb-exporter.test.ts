import {describe, expect, it} from 'vitest'
import * as THREE from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {getStyleProfile} from '../../assets/style/style-profiles'
import {treePresets} from '../../assets/trees/presets'
import {createEmptyScene} from '../scene/scene-model'
import {createSceneFromPreset} from '../scene/initial-scene'
import {exportGLB} from './glb-exporter'

const STYLE = getStyleProfile('low-poly')

async function reload(exported: ArrayBuffer): Promise<THREE.Group> {
    const gltf = await new GLTFLoader().parseAsync(exported, '')

    return gltf.scene
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
    const found: THREE.Mesh[] = []

    root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
            found.push(object)
        }
    })

    return found
}

function names(root: THREE.Object3D): string[] {
    const found: string[] = []

    root.traverse((object) => {
        found.push(object.name)
    })

    return found
}

function expectClose(actual: readonly number[], expected: readonly number[]): void {
    expect(actual.length).toBe(expected.length)

    for (let i = 0; i < expected.length; i++) {
        expect(actual[i]).toBeCloseTo(expected[i], 4)
    }
}

function vector(object: THREE.Object3D): number[] {
    return [object.position.x, object.position.y, object.position.z]
}

/** Euler triples have equivalent branches, so rotations are compared as quaternions. */
function expectSameRotation(
    object: THREE.Object3D,
    rotation: readonly [number, number, number],
): void {
    const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation))

    expect(object.quaternion.angleTo(expected)).toBeLessThan(1e-4)
}

function scale(object: THREE.Object3D): number[] {
    return [object.scale.x, object.scale.y, object.scale.z]
}

describe('GLB export', () => {
    it('reloads every preset with meshes, finite vertices and readable names', async () => {
        // Painted leaves carry a texture, and jsdom has no canvas to write one
        // with. Their export needs a real browser.
        for (const preset of treePresets.filter((p) => p.generatorId !== 'painted-tree')) {
            const scene = createSceneFromPreset(preset.id)

            const exported = await exportGLB(scene, {style: STYLE})

            expect(exported.byteLength, preset.id).toBeGreaterThan(0)

            const loaded = await reload(exported)
            const found = meshes(loaded)

            expect(found.length, preset.id).toBeGreaterThan(0)

            for (const mesh of found) {
                const position = mesh.geometry.getAttribute('position')
                const normal = mesh.geometry.getAttribute('normal')

                expect(position, preset.id).toBeDefined()
                expect(normal, preset.id).toBeDefined()

                for (let i = 0; i < position.array.length; i++) {
                    expect(Number.isFinite(position.array[i]), preset.id).toBe(true)
                }

                for (let i = 0; i < normal.array.length; i++) {
                    expect(Number.isFinite(normal.array[i]), preset.id).toBe(true)
                }
            }

            // Every component gets its own group, named after its type, so a
            // tree can be told apart once it is in Blender. A painted tree is
            // one bark surface and its clumps rather than a trunk and branches,
            // which is why this asks for each component's name instead of a trunk.
            const expected = scene.assets[0].components.map(
                (component) => `${component.type}_${component.id}`,
            )

            for (const name of expected) {
                expect(names(loaded), preset.id).toContain(name)
            }
        }
    }, 120000)

    it('writes one root group per component', async () => {
        const scene = createSceneFromPreset(treePresets[0].id)
        const components = scene.assets[0].components

        const loaded = await reload(await exportGLB(scene, {style: STYLE}))

        expect(components.length).toBeGreaterThan(0)
        expect(loaded.children.length).toBe(components.length)
        expect(loaded.children.map((child) => child.name)).toEqual(
            components.map((component) => `${component.type}_${component.id}`),
        )
    }, 60000)

    it('keeps each component transform on the group rather than in the vertices', async () => {
        const scene = createSceneFromPreset(treePresets[0].id)
        const components = scene.assets[0].components

        const loaded = await reload(await exportGLB(scene, {style: STYLE}))

        for (let i = 0; i < components.length; i++) {
            const transform = components[i].transform
            const group = loaded.children[i]

            expectClose(vector(group), transform.position)
            expectSameRotation(group, transform.rotation)
            expectClose(scale(group), transform.scale)

            expect(group.children.length).toBe(1)

            const mesh = group.children[0]

            expectClose(vector(mesh), [0, 0, 0])
            expectSameRotation(mesh, [0, 0, 0])
            expectClose(scale(mesh), [1, 1, 1])
        }
    }, 60000)

    it('leaves the input scene exactly as it found it', async () => {
        const scene = createSceneFromPreset(treePresets[0].id)
        const before = JSON.stringify(scene)

        await exportGLB(scene, {style: STYLE})

        expect(JSON.stringify(scene)).toBe(before)
    }, 60000)

    it('writes a valid empty file for a scene with nothing in it', async () => {
        const exported = await exportGLB(createEmptyScene(), {style: STYLE})

        expect(exported.byteLength).toBeGreaterThan(0)

        const loaded = await reload(exported)

        expect(loaded.children.length).toBe(0)
        expect(meshes(loaded).length).toBe(0)
    }, 60000)
})
