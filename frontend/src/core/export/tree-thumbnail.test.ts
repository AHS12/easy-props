import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import * as THREE from 'three'
import {getStyleProfile} from '../../assets/style/style-profiles'
import {treePresets} from '../../assets/trees/presets'
import {createSceneFromPreset} from '../scene/initial-scene'
import {createEmptyScene, type Scene} from '../scene/scene-model'
import {buildThumbnailScene, frameThumbnailCamera, renderTreeThumbnail} from './tree-thumbnail'

const STYLE = getStyleProfile('low-poly')

function meshesIn(root: THREE.Object3D): THREE.Mesh[] {
    const found: THREE.Mesh[] = []

    root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
            found.push(object)
        }
    })

    return found
}

function cornersOf(bounds: THREE.Box3): THREE.Vector3[] {
    const corners: THREE.Vector3[] = []

    for (let index = 0; index < 8; index++) {
        corners.push(
            new THREE.Vector3(
                index & 1 ? bounds.max.x : bounds.min.x,
                index & 2 ? bounds.max.y : bounds.min.y,
                index & 4 ? bounds.max.z : bounds.min.z,
            ),
        )
    }

    return corners
}

/** A scene whose components point at generators that do not exist. */
function brokenScene(scene: Scene): Scene {
    const asset = scene.assets[0]

    return {
        ...scene,
        assets: [
            {
                ...asset,
                components: asset.components.map((component) => ({
                    ...component,
                    generatorId: 'missing-generator',
                })),
            },
        ],
    }
}

describe('tree thumbnail', () => {
    beforeEach(() => {
        // jsdom has no WebGL, and asking it for a context reports an error.
        // A null context is exactly what a browser without WebGL gives back,
        // so this models the case that has to end in a placeholder.
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('resolves to null instead of throwing when there is no WebGL context', async () => {
        const scene = createSceneFromPreset(treePresets[0].id)

        await expect(renderTreeThumbnail(scene, {style: STYLE})).resolves.toBeNull()
    })

    it('resolves to null for a scene with no assets', async () => {
        await expect(renderTreeThumbnail(createEmptyScene(), {style: STYLE})).resolves.toBeNull()
    })

    it('resolves to null when no component could be generated', async () => {
        const scene = brokenScene(createSceneFromPreset(treePresets[0].id))

        await expect(renderTreeThumbnail(scene, {style: STYLE})).resolves.toBeNull()
        expect(buildThumbnailScene(scene, STYLE).bounds.isEmpty()).toBe(true)
    })

    it('draws one mesh per component, inside their world bounds', () => {
        const scene = createSceneFromPreset(treePresets[0].id)
        const components = scene.assets[0].components

        const built = buildThumbnailScene(scene, STYLE)

        try {
            const names = meshesIn(built.scene).map((mesh) => mesh.name)

            expect(components.length).toBeGreaterThan(0)

            for (const component of components) {
                const position = new THREE.Vector3(...component.transform.position)

                expect(names).toContain(`${component.type}_${component.id}_mesh`)
                expect(built.bounds.containsPoint(position)).toBe(true)
            }
        } finally {
            built.dispose()
        }
    })

    it('frames the whole tree, filling most of the square', () => {
        for (const preset of treePresets) {
            const built = buildThumbnailScene(createSceneFromPreset(preset.id), STYLE)

            try {
                const camera = frameThumbnailCamera(built.bounds)

                expect(camera, preset.id).not.toBeNull()

                camera!.updateMatrixWorld()

                let widest = 0

                for (const corner of cornersOf(built.bounds)) {
                    const projected = corner.clone().project(camera!)

                    // Nothing may fall outside the frame ...
                    expect(Math.abs(projected.x), preset.id).toBeLessThanOrEqual(1)
                    expect(Math.abs(projected.y), preset.id).toBeLessThanOrEqual(1)

                    // ... and the tree has to reach close to an edge.
                    widest = Math.max(widest, Math.abs(projected.x), Math.abs(projected.y))
                }

                expect(widest, preset.id).toBeGreaterThan(0.85)
            } finally {
                built.dispose()
            }
        }
    }, 60000)

    it('frees every geometry, material, and texture when disposed', () => {
        const built = buildThumbnailScene(createSceneFromPreset(treePresets[0].id), STYLE)

        const meshes = meshesIn(built.scene)
        const background = built.scene.background as THREE.Texture

        expect(meshes.length).toBeGreaterThan(0)
        expect(background).toBeInstanceOf(THREE.Texture)

        const geometryDisposals = meshes.map((mesh) => vi.spyOn(mesh.geometry, 'dispose'))
        const materialDisposals = meshes.map((mesh) =>
            vi.spyOn(mesh.material as THREE.Material, 'dispose'),
        )
        const textureDisposal = vi.spyOn(background, 'dispose')

        built.dispose()

        for (const disposal of geometryDisposals) {
            expect(disposal).toHaveBeenCalledTimes(1)
        }

        for (const disposal of materialDisposals) {
            expect(disposal).toHaveBeenCalledTimes(1)
        }

        expect(textureDisposal).toHaveBeenCalledTimes(1)
        expect(meshesIn(built.scene)).toHaveLength(0)
    })

    it('can be disposed more than once', () => {
        const built = buildThumbnailScene(createSceneFromPreset(treePresets[0].id), STYLE)
        const mesh = meshesIn(built.scene)[0]
        const disposal = vi.spyOn(mesh.geometry, 'dispose')

        built.dispose()
        built.dispose()

        expect(disposal).toHaveBeenCalledTimes(1)
    })

    it('leaves the input scene exactly as it found it', () => {
        const scene = createSceneFromPreset(treePresets[0].id)
        const before = JSON.stringify(scene)

        buildThumbnailScene(scene, STYLE).dispose()

        expect(JSON.stringify(scene)).toBe(before)
    })
})
