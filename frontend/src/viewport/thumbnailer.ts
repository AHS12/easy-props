/**
 * Preset thumbnails.
 *
 * Each preset card shows a real render of that tree, not an illustration, so
 * the cards compare honestly. The renders are made once and cached.
 */

import * as THREE from 'three'
import {createSeededRandom} from '../assets/shared/random'
import {getStyleProfile, type StyleProfileId} from '../assets/style/style-profiles'
import {findComponentGenerator} from '../assets/trees/component-generators'
import {generateTreeComponents} from '../assets/trees/tree-generators'
import type {TreePreset} from '../assets/trees/presets'
import {MATERIAL_COLORS} from './scene/materials'

const THUMBNAIL_SIZE = 192

const cache = new Map<string, string>()

const MATERIAL_BY_KIND = {
    bark: MATERIAL_COLORS.bark,
    'bark-light': MATERIAL_COLORS.barkLight,
    leaves: MATERIAL_COLORS.leaves,
    'leaves-dark': MATERIAL_COLORS.leavesDark,
    coconut: MATERIAL_COLORS.coconut,
} as const

/** The cached thumbnail for a preset, if it has been rendered. */
export function getPresetThumbnail(presetId: string): string | undefined {
    return cache.get(presetId)
}

function renderThumbnail(preset: TreePreset, styleId: StyleProfileId): string {
    const profile = getStyleProfile(styleId)

    const renderer = new THREE.WebGLRenderer({alpha: true, antialias: true})
    renderer.setPixelRatio(1)
    renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xcfe3d0, 0x6b5a45, 0.9))

    const key = new THREE.DirectionalLight(0xfff6e8, 1.5)
    key.position.set(-6, 8, 5)
    scene.add(key)

    const components = generateTreeComponents(
        preset.generatorId,
        preset.parameters,
        preset.seed,
        profile,
    )

    const disposables: THREE.BufferGeometry[] = []
    const materials: THREE.Material[] = []

    for (const component of components) {
        const generator = findComponentGenerator(component.generatorId)

        if (!generator) {
            continue
        }

        const validated = generator.validate(component.parameters)
        const part = generator.generate(validated.parameters, {
            random: createSeededRandom(component.seed),
            seed: component.seed,
            style: profile,
        })

        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(MATERIAL_BY_KIND[part.material]),
            roughness: 0.85,
            metalness: 0,
            flatShading: profile.flatShading,
        })

        const mesh = new THREE.Mesh(part.geometry, material)
        mesh.position.set(...component.transform.position)
        mesh.rotation.set(...component.transform.rotation)
        mesh.scale.set(...component.transform.scale)
        scene.add(mesh)

        disposables.push(part.geometry)
        materials.push(material)
    }

    const height =
        typeof preset.parameters.height === 'number' ? preset.parameters.height : 4.2

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    const target = new THREE.Vector3(0, height * 0.5, 0)
    camera.position
        .copy(target)
        .add(new THREE.Vector3(-0.62, 0.34, 0.62).normalize().multiplyScalar(height * 2.6))
    camera.lookAt(target)

    renderer.render(scene, camera)

    const url = renderer.domElement.toDataURL('image/png')

    for (const geometry of disposables) {
        geometry.dispose()
    }

    for (const material of materials) {
        material.dispose()
    }

    renderer.dispose()

    return url
}

/**
 * Renders any preset that has no thumbnail yet.
 *
 * Returns the cache so a caller can update its cards.
 */
export function buildPresetThumbnails(
    presets: readonly TreePreset[],
    styleId: StyleProfileId,
): ReadonlyMap<string, string> {
    for (const preset of presets) {
        if (cache.has(preset.id)) {
            continue
        }

        try {
            cache.set(preset.id, renderThumbnail(preset, styleId))
        } catch {
            // A thumbnail is a nicety. A failure must not stop the panel.
            cache.set(preset.id, '')
        }
    }

    return cache
}
