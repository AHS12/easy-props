/**
 * Thumbnail renders.
 *
 * The preset cards and the library rows show a real render of the thing, not
 * an illustration, so the cards compare honestly. The renders are made once
 * and cached.
 */

import * as THREE from 'three'
import type {LibraryPart} from '../assets/library/library'
import {createSeededRandom} from '../assets/shared/random'
import {getStyleProfile, type StyleProfileId} from '../assets/style/style-profiles'
import {findComponentGenerator} from '../assets/component-generators'
import {MATERIAL_COLORS, VIEWPORT_COLORS} from './scene/materials'

const PART_SIZE = 96

const cache = new Map<string, string>()

const MATERIAL_BY_KIND = {
    bark: MATERIAL_COLORS.bark,
    'bark-light': MATERIAL_COLORS.barkLight,
    leaves: MATERIAL_COLORS.leaves,
    'leaves-dark': MATERIAL_COLORS.leavesDark,
    coconut: MATERIAL_COLORS.coconut,
    painted: '#ffffff',
} as const

/**
 * One renderer for every thumbnail.
 *
 * A browser only keeps a handful of WebGL contexts alive. Making one per
 * thumbnail used to push past the limit and take the viewport's context down
 * with it, which left the viewport blank.
 */
let sharedRenderer: THREE.WebGLRenderer | null = null

function getRenderer(): THREE.WebGLRenderer {
    if (!sharedRenderer) {
        sharedRenderer = new THREE.WebGLRenderer({alpha: true, antialias: true})
        sharedRenderer.setPixelRatio(1)
        sharedRenderer.toneMapping = THREE.NeutralToneMapping
        sharedRenderer.toneMappingExposure = 1.15
        sharedRenderer.outputColorSpace = THREE.SRGBColorSpace
    }

    return sharedRenderer
}

/** The cached thumbnail for a key, if it has been rendered. */
export function getThumbnail(key: string): string | undefined {
    return cache.get(key)
}

interface Renderable {
    readonly geometry: THREE.BufferGeometry
    readonly kind: keyof typeof MATERIAL_BY_KIND
}

/**
 * Renders a set of meshes on a transparent background.
 *
 * The camera frames whatever it is given, so a part and a whole tree are
 * both shown as large as they can be.
 */
function renderIsolated(
    build: () => Renderable[],
    size: number,
    styleId: StyleProfileId,
): string {
    const profile = getStyleProfile(styleId)
    const renderer = getRenderer()

    renderer.setSize(size, size)

    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xcfe3d0, 0x5a4a38, 1.2))

    const key = new THREE.DirectionalLight(0xfff4e2, 2.4)
    key.position.set(-6, 8, 5)
    scene.add(key)

    const fill = new THREE.DirectionalLight(0xcfe0f0, 0.55)
    fill.position.set(6, 3, -5)
    scene.add(fill)

    const renderables = build()
    const materials: THREE.Material[] = []
    const group = new THREE.Group()

    for (const {geometry, kind} of renderables) {
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(MATERIAL_BY_KIND[kind]),
            roughness: 0.85,
            metalness: 0,
            flatShading: profile.flatShading,
        })

        const mesh = new THREE.Mesh(geometry, material)
        group.add(mesh)
        materials.push(material)
    }

    scene.add(group)

    const bounds = new THREE.Box3().setFromObject(group)
    const sphere = bounds.getBoundingSphere(new THREE.Sphere())
    const radius = Math.max(sphere.radius, 0.2)

    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100)
    camera.position
        .copy(sphere.center)
        .add(new THREE.Vector3(-0.62, 0.34, 0.62).normalize().multiplyScalar(radius * 3.1))
    camera.lookAt(sphere.center)

    renderer.render(scene, camera)

    const url = renderer.domElement.toDataURL('image/png')

    for (const {geometry} of renderables) {
        geometry.dispose()
    }

    for (const material of materials) {
        material.dispose()
    }

    return url
}

function renderLibraryPart(part: LibraryPart, styleId: StyleProfileId): string {
    const profile = getStyleProfile(styleId)
    const generator = findComponentGenerator(part.generatorId)

    if (!generator) {
        return ''
    }

    const seed = 4242

    return renderIsolated(() => {
        const validated = generator.validate(part.parameters)
        const built = generator.generate(validated.parameters, {
            random: createSeededRandom(seed),
            seed,
            style: profile,
        })

        return [{geometry: built.geometry.clone(), kind: built.material}]
    }, PART_SIZE, styleId)
}

/**
 * Renders any library part that has no thumbnail yet.
 *
 * Returns the cache so a caller can update its rows.
 */
export function buildLibraryThumbnails(
    parts: readonly LibraryPart[],
    styleId: StyleProfileId,
): ReadonlyMap<string, string> {
    for (const part of parts) {
        if (cache.has(part.id)) {
            continue
        }

        try {
            cache.set(part.id, renderLibraryPart(part, styleId))
        } catch {
            // A thumbnail is a nicety. A failure must not stop the panel.
            cache.set(part.id, '')
        }
    }

    return cache
}

/** Forgets every cached thumbnail, so they are rendered again. */
export function clearThumbnails(): void {
    cache.clear()
}

export {VIEWPORT_COLORS}
