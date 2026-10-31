/**
 * Tree thumbnails for the saved-tree gallery.
 *
 * A thumbnail is a real render, so the gallery compares trees honestly. The
 * render builds its own throwaway scene from the graph: the viewport keeps its
 * objects and its context, and never notices that a thumbnail was drawn.
 */

import * as THREE from 'three'
import {createSeededRandom} from '../../assets/shared/random'
import type {SceneComponent} from '../../assets/shared/component-types'
import {ambientColor, DEFAULT_LIGHTING, sunColor, sunDirection} from '../../assets/style/lighting'
import {createPartMaterial} from '../../assets/style/part-material'
import type {StyleProfile} from '../../assets/style/style-profiles'
import {findComponentGenerator} from '../../assets/component-generators'
import {materialColor} from '../../viewport/scene/component-renderer'
import type {Scene, SceneMaterials} from '../scene/scene-model'

export interface ThumbnailOptions {
    readonly style: StyleProfile
    /** Square edge length in pixels. Defaults to 320. */
    readonly size?: number
}

/** A throwaway scene holding one tree, and everything it created. */
export interface ThumbnailScene {
    readonly scene: THREE.Scene
    /** World bounds of the meshes. Empty when nothing could be built. */
    readonly bounds: THREE.Box3
    /** Frees every geometry, material, and texture the build created. */
    dispose(): void
}

const DEFAULT_SIZE = 320
const MIN_SIZE = 16
/** Past this a thumbnail is a waste of pixels, whatever the driver allows. */
const MAX_SIZE = 1024

const CAMERA_FOV = 35
/** Leaves a small margin, so a tree never touches the edge of the frame. */
const FRAME_MARGIN = 1.06
/** Behind-right and slightly above: the readable three-quarter view. */
const VIEW_DIRECTION: readonly [number, number, number] = [0.62, 0.4, -0.62]

/**
 * The backdrop.
 *
 * A warm neutral gradient, not a colour: a flat mid-tone either fights the
 * light panel or disappears into the dark one, and a green backdrop would
 * compete with the thing the card is about.
 */
const BACKGROUND_TOP = '#55585c'
const BACKGROUND_BOTTOM = '#2b2d30'
const BACKGROUND_STEPS = 64

const SHADE_SIZE = 32
const SHADE_OPACITY = 0.28

/** The geometry, materials, and textures a thumbnail has to dispose of. */
interface ThumbnailResources {
    readonly geometries: THREE.BufferGeometry[]
    readonly materials: THREE.Material[]
    readonly textures: THREE.Texture[]
}

let sharedRenderer: THREE.WebGLRenderer | null = null

/**
 * One renderer for every thumbnail.
 *
 * A browser only keeps a handful of WebGL contexts alive, and the one it
 * gives up is usually the viewport's. The parts panel already learned this;
 * the gallery follows the same rule.
 */
function getRenderer(): THREE.WebGLRenderer | null {
    if (sharedRenderer) {
        return sharedRenderer
    }

    try {
        const canvas = document.createElement('canvas')

        // The context is made here and handed over. A browser without WebGL
        // then never reaches the renderer's own failure path, which reports
        // to the console, and only one context is ever asked for.
        const context = canvas.getContext('webgl2', {
            alpha: false,
            antialias: true,
            // The canvas is read back with toDataURL. Without this the buffer
            // may already be cleared by the time it is read.
            preserveDrawingBuffer: true,
        })

        if (!context) {
            return null
        }

        const renderer = new THREE.WebGLRenderer({canvas, context, antialias: true})

        renderer.setPixelRatio(1)
        renderer.toneMapping = THREE.NeutralToneMapping
        renderer.toneMappingExposure = 1.15
        renderer.outputColorSpace = THREE.SRGBColorSpace
        // Shadows belong to the viewport. A thumbnail draws its own shade.
        renderer.shadowMap.enabled = false

        sharedRenderer = renderer

        return renderer
    } catch {
        // No WebGL at all, or the driver refused a context. The caller shows
        // a placeholder, which is the honest thing to do.
        return null
    }
}

/**
 * A vertical gradient, as a one-pixel-wide strip.
 *
 * Three stretches a 2D texture over the whole frame for `scene.background`, so
 * a gradient needs neither a canvas nor a shader.
 */
function createBackgroundTexture(): THREE.Texture {
    const top = new THREE.Color(BACKGROUND_TOP)
    const bottom = new THREE.Color(BACKGROUND_BOTTOM)
    const colour = new THREE.Color()
    const rgb = {r: 0, g: 0, b: 0}

    const data = new Uint8Array(BACKGROUND_STEPS * 4)

    for (let row = 0; row < BACKGROUND_STEPS; row++) {
        colour.copy(bottom).lerp(top, row / (BACKGROUND_STEPS - 1))
        colour.getRGB(rgb, THREE.SRGBColorSpace)

        // Texture rows start at the bottom of the image.
        const index = row * 4
        data[index] = Math.round(rgb.r * 255)
        data[index + 1] = Math.round(rgb.g * 255)
        data[index + 2] = Math.round(rgb.b * 255)
        data[index + 3] = 255
    }

    const texture = new THREE.DataTexture(data, 1, BACKGROUND_STEPS)

    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    texture.needsUpdate = true

    return texture
}

/** A soft round mask, black with a fading alpha. */
function createShadeTexture(): THREE.Texture {
    const data = new Uint8Array(SHADE_SIZE * SHADE_SIZE * 4)

    for (let y = 0; y < SHADE_SIZE; y++) {
        for (let x = 0; x < SHADE_SIZE; x++) {
            const offsetX = ((x + 0.5) / SHADE_SIZE) * 2 - 1
            const offsetY = ((y + 0.5) / SHADE_SIZE) * 2 - 1
            const distance = Math.min(Math.sqrt(offsetX * offsetX + offsetY * offsetY), 1)
            const falloff = (1 - distance) * (1 - distance)

            const index = (y * SHADE_SIZE + x) * 4
            data[index + 3] = Math.round(falloff * 255)
        }
    }

    const texture = new THREE.DataTexture(data, SHADE_SIZE, SHADE_SIZE, THREE.RGBAFormat)

    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    texture.needsUpdate = true

    return texture
}

function buildComponentGroup(
    component: SceneComponent,
    style: StyleProfile,
    materials: SceneMaterials,
    resources: ThumbnailResources,
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

    const material = createPartMaterial(part, materialColor(part.material, materials), style.flatShading)

    resources.geometries.push(part.geometry)

    // A part that only exists to be clicked has nothing to show.
    if (part.surface?.proxy) {
        return undefined
    }
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
 * The viewport's own key light, aimed the same way.
 *
 * A thumbnail lit differently would show a tree the user never
 * saw, which is worse than no thumbnail.
 */
function addLighting(root: THREE.Scene, sphere: THREE.Sphere): void {
    const {warmth, elevation} = DEFAULT_LIGHTING
    const direction = sunDirection(DEFAULT_LIGHTING)

    const sky = new THREE.HemisphereLight(
        ambientColor(warmth),
        '#5a4a38',
        1.15 + (1 - elevation / 90) * 0.9,
    )
    root.add(sky)

    const sun = new THREE.DirectionalLight(sunColor(warmth), 2.4 + warmth * 0.9)
    sun.position.copy(sphere.center).addScaledVector(direction, Math.max(sphere.radius * 3, 6))
    sun.target.position.copy(sphere.center)
    root.add(sun, sun.target)

    const fill = new THREE.DirectionalLight(0xcfe0f0, 0.55)
    fill.position
        .set(-direction.x, 0.4, -direction.z)
        .multiplyScalar(Math.max(sphere.radius * 3, 6))
    root.add(fill)
}

/**
 * A soft contact shadow under the trunk.
 *
 * A shadow map would cost a render target per thumbnail for a few pixels of
 * darker green. A blurred ellipse reads the same and costs one plane.
 */
function addGroundShade(
    root: THREE.Scene,
    bounds: THREE.Box3,
    resources: ThumbnailResources,
): void {
    const extent = bounds.getSize(new THREE.Vector3())
    const width = Math.max(extent.x, extent.z)

    if (!Number.isFinite(width) || width <= 0) {
        return
    }

    const texture = createShadeTexture()
    resources.textures.push(texture)

    const geometry = new THREE.PlaneGeometry(width * 1.35, width * 1.35)
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        opacity: SHADE_OPACITY,
        toneMapped: false,
    })

    resources.geometries.push(geometry)
    resources.materials.push(material)

    const shade = new THREE.Mesh(geometry, material)
    shade.name = 'thumbnail_ground_shade'
    shade.rotation.x = -Math.PI / 2
    shade.position.set(
        (bounds.min.x + bounds.max.x) / 2,
        bounds.min.y + width * 0.002,
        (bounds.min.z + bounds.max.z) / 2,
    )

    root.add(shade)
}

/** A sphere the framing and the lights can trust, whatever the scene holds. */
function usableSphere(bounds: THREE.Box3): THREE.Sphere {
    const sphere = bounds.getBoundingSphere(new THREE.Sphere())

    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) {
        return new THREE.Sphere(new THREE.Vector3(), 1)
    }

    return sphere
}

/**
 * Builds the throwaway scene for one tree.
 *
 * Exported so the resources can be checked without a GPU: the pixels are a
 * renderer's job, the bookkeeping is this module's.
 */
export function buildThumbnailScene(scene: Scene, style: StyleProfile): ThumbnailScene {
    const root = new THREE.Scene()
    root.name = scene.id

    const resources: ThumbnailResources = {geometries: [], materials: [], textures: []}

    const tree = new THREE.Group()
    tree.name = 'thumbnail_tree'

    const asset = scene.assets[0]

    if (asset) {
        for (const component of asset.components) {
            const group = buildComponentGroup(component, style, asset.materials, resources)

            if (group) {
                tree.add(group)
            }
        }
    }

    root.add(tree)

    const bounds = new THREE.Box3().setFromObject(tree)
    const background = createBackgroundTexture()

    resources.textures.push(background)
    root.background = background

    if (!bounds.isEmpty()) {
        addGroundShade(root, bounds, resources)
    }

    addLighting(root, usableSphere(bounds))

    let disposed = false

    return {
        scene: root,
        bounds,

        dispose() {
            if (disposed) {
                return
            }

            disposed = true
            root.clear()

            for (const geometry of resources.geometries) {
                geometry.dispose()
            }

            for (const material of resources.materials) {
                material.dispose()
            }

            for (const texture of resources.textures) {
                texture.dispose()
            }

            resources.geometries.length = 0
            resources.materials.length = 0
            resources.textures.length = 0
        },
    }
}

/**
 * A camera that fits the whole tree in a square frame.
 *
 * The distance is the smallest one that keeps every corner of the bounding box
 * inside the frustum. A bounding sphere would be easier, but a wide canopy
 * then fills half the card; fitting the corners fills it, and because the
 * frustum and the box are convex, keeping the corners in keeps the box in.
 *
 * Null when the bounds hold nothing that can be framed.
 */
export function frameThumbnailCamera(bounds: THREE.Box3): THREE.PerspectiveCamera | null {
    if (bounds.isEmpty()) {
        return null
    }

    const centre = bounds.getCenter(new THREE.Vector3())
    const direction = new THREE.Vector3(...VIEW_DIRECTION).normalize()
    const worldUp = new THREE.Vector3(0, 1, 0)
    const right = new THREE.Vector3().crossVectors(worldUp, direction).normalize()
    const up = new THREE.Vector3().crossVectors(direction, right).normalize()

    const tangent = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2))
    const corner = new THREE.Vector3()
    const offset = new THREE.Vector3()

    let distance = 0

    for (let index = 0; index < 8; index++) {
        corner.set(
            index & 1 ? bounds.max.x : bounds.min.x,
            index & 2 ? bounds.max.y : bounds.min.y,
            index & 4 ? bounds.max.z : bounds.min.z,
        )

        offset.subVectors(corner, centre)

        if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y) || !Number.isFinite(offset.z)) {
            return null
        }

        const depth = offset.dot(direction)
        const lateral = Math.max(Math.abs(offset.dot(right)), Math.abs(offset.dot(up)))

        distance = Math.max(distance, depth + lateral / tangent)
    }

    if (!Number.isFinite(distance) || distance <= 0) {
        return null
    }

    distance *= FRAME_MARGIN

    const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, 0.5)
    const camera = new THREE.PerspectiveCamera(
        CAMERA_FOV,
        1,
        Math.max(distance * 0.02, 0.01),
        distance + radius * 3,
    )

    camera.position.copy(centre).addScaledVector(direction, distance)
    camera.lookAt(centre)

    return camera
}

/**
 * A size the renderer can actually allocate.
 *
 * A canvas past the driver's limit comes back blank, so the request is capped
 * rather than trusted.
 */
function clampSize(size: number | undefined, limit: number): number {
    const cap = Math.max(Math.min(limit, MAX_SIZE), MIN_SIZE)
    const wanted = Math.round(size ?? DEFAULT_SIZE)

    if (!Number.isFinite(wanted)) {
        return Math.min(DEFAULT_SIZE, cap)
    }

    return Math.max(MIN_SIZE, Math.min(wanted, cap))
}

/** A PNG data URL of the tree, or null when it cannot be drawn. */
export async function renderTreeThumbnail(
    scene: Scene,
    options: ThumbnailOptions,
): Promise<string | null> {
    const renderer = getRenderer()

    if (!renderer) {
        return null
    }

    let built: ThumbnailScene | null = null

    try {
        if (renderer.getContext().isContextLost()) {
            return null
        }

        const size = clampSize(options.size, renderer.capabilities.maxTextureSize)

        built = buildThumbnailScene(scene, options.style)

        const camera = frameThumbnailCamera(built.bounds)

        if (!camera) {
            return null
        }

        renderer.setSize(size, size, false)
        renderer.render(built.scene, camera)

        return renderer.domElement.toDataURL('image/png')
    } catch {
        return null
    } finally {
        built?.dispose()
    }
}
