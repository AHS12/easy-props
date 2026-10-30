/**
 * The viewport scene: renderer, camera, lighting, ground, and grid.
 *
 * Everything Three.js lives here so the rest of the app never has to think
 * about it.
 */

import * as THREE from 'three'
import {
    DEFAULT_LIGHTING,
    ambientColor,
    sunColor,
    sunDirection,
    type SceneLighting,
} from '../../assets/style/lighting'
import {getStyleProfile, type StyleProfileId} from '../../assets/style/style-profiles'
import type {Scene} from '../../core/scene/scene-model'
import {attachCameraControls} from './camera-controls'
import {
    createComponentRenderer,
    type ComponentRenderer,
    type ShadingMode,
} from './component-renderer'
import {VIEWPORT_COLORS} from './materials'

export interface ViewportScene {
    readonly renderer: THREE.WebGLRenderer
    readonly scene: THREE.Scene
    readonly camera: THREE.PerspectiveCamera
    readonly controls: ReturnType<typeof attachCameraControls>
    readonly components: ComponentRenderer
    /** Brings the viewport in line with the scene graph. */
    syncScene(scene: Scene): void
    /** Frames the whole tree. */
    frameScene(scene: Scene): void
    /** Moves the sun and re-lights the scene. */
    setLighting(lighting: SceneLighting): void
    /** Switches between the lit, flat, and wireframe views. */
    setShadingMode(mode: ShadingMode): void
    /** Applies a new style profile. The scene is resynced afterwards. */
    setStyle(styleId: StyleProfileId): void
    /** Faces in the content, excluding rendering helpers such as outlines. */
    countFaces(): number
    resize(): void
    dispose(): void
}

const CAMERA_FOV = 45
const CAMERA_NEAR = 0.05
const CAMERA_FAR = 500

/**
 * Counts the triangles of the real geometry under a root.
 *
 * Rendering helpers such as the selection outline are excluded, so the number
 * the user sees is the number they would actually export.
 */
function countFaces(root: THREE.Object3D): number {
    let triangles = 0

    root.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh || mesh.userData.isHelper || mesh.userData.isProxy) {
            return
        }

        const geometry = mesh.geometry
        const vertices = geometry.index
            ? geometry.index.count
            : (geometry.attributes.position?.count ?? 0)

        triangles += vertices / 3
    })

    return Math.round(triangles)
}

function createRenderer(container: HTMLElement): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
    })

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    // Neutral keeps the midtones bright. ACES crushes them, which makes a
    // sunlit tree read as if it were in the shade.
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.domElement.classList.add('viewport__canvas')

    return renderer
}

/**
 * A vertical gradient for the sky.
 *
 * A flat colour makes the tree look like it is floating in a void. A
 * gradient reads as a place.
 */
function createSkyTexture(): THREE.Texture {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 256

    const context = canvas.getContext('2d')
    const gradient = context!.createLinearGradient(0, 0, 0, 256)
    gradient.addColorStop(0, VIEWPORT_COLORS.skyTop)
    gradient.addColorStop(0.62, VIEWPORT_COLORS.skyHorizon)
    gradient.addColorStop(1, VIEWPORT_COLORS.skyHorizon)
    context!.fillStyle = gradient
    context!.fillRect(0, 0, 1, 256)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace

    return texture
}

function createCamera(container: HTMLElement): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(
        CAMERA_FOV,
        container.clientWidth / Math.max(container.clientHeight, 1),
        CAMERA_NEAR,
        CAMERA_FAR,
    )

    camera.position.set(-4.6, 3.6, 4.6)

    return camera
}

interface Lights {
    readonly hemisphere: THREE.HemisphereLight
    readonly sun: THREE.DirectionalLight
    readonly fill: THREE.DirectionalLight
}

function addLighting(scene: THREE.Scene): Lights {
    // Fills the shadow side so nothing reads as black.
    const hemisphere = new THREE.HemisphereLight(0xc6dcea, 0x4a3b2e, 0.75)
    scene.add(hemisphere)

    const sun = new THREE.DirectionalLight(0xfff4e2, 2.1)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.radius = 3
    sun.shadow.camera.near = 0.5
    sun.shadow.camera.far = 60
    // A normal bias kills the acne that a low sun would otherwise bring.
    sun.shadow.normalBias = 0.035
    sun.shadow.bias = -0.0002
    scene.add(sun)
    scene.add(sun.target)

    // Dim fill from the opposite side so the dark side stays readable.
    const fill = new THREE.DirectionalLight(0xcfe0f0, 0.4)
    scene.add(fill)

    return {hemisphere, sun, fill}
}

function addGround(scene: THREE.Scene): void {
    const ground = new THREE.Mesh(
        new THREE.CircleGeometry(50, 64),
        new THREE.MeshStandardMaterial({color: new THREE.Color(VIEWPORT_COLORS.ground), roughness: 1}),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    ground.name = 'ground'
    scene.add(ground)

    const minor = new THREE.GridHelper(40, 40, VIEWPORT_COLORS.grid, VIEWPORT_COLORS.grid)
    minor.position.y = 0.002
    minor.material.transparent = true
    minor.material.opacity = 0.38
    minor.name = 'grid_minor'
    scene.add(minor)

    const major = new THREE.GridHelper(100, 10, VIEWPORT_COLORS.gridMajor, VIEWPORT_COLORS.gridMajor)
    major.position.y = 0.004
    major.material.transparent = true
    major.material.opacity = 0.55
    major.name = 'grid_major'
    scene.add(major)
}

export function createViewportScene(container: HTMLElement, styleId: StyleProfileId): ViewportScene {
    const renderer = createRenderer(container)
    const camera = createCamera(container)
    const scene = new THREE.Scene()

    const sky = createSkyTexture()
    scene.background = sky
    scene.fog = new THREE.Fog(new THREE.Color(VIEWPORT_COLORS.skyHorizon), 22, 60)

    const lights = addLighting(scene)
    addGround(scene)

    const controls = attachCameraControls(camera, renderer.domElement)

    const components = createComponentRenderer()
    scene.add(components.group)

    let currentStyleId = styleId
    let shading: ShadingMode = 'lit'
    let lighting: SceneLighting = DEFAULT_LIGHTING

    /** The centre and radius the shadow camera has to cover. */
    const bounds = new THREE.Box3()
    const sphere = new THREE.Sphere()

    const applyLighting = () => {
        const direction = sunDirection(lighting)

        lights.sun.target.position.copy(sphere.center)
        lights.sun.target.updateMatrixWorld()

        // The sun sits far enough back that its shadow map covers the tree.
        const distance = Math.max(sphere.radius * 3, 12)
        lights.sun.position.copy(sphere.center).add(direction.clone().multiplyScalar(distance))

        lights.sun.color.copy(sunColor(lighting.warmth))
        lights.sun.intensity = 2.4 + lighting.warmth * 0.9
        lights.sun.castShadow = lighting.shadowStrength > 0.02
        lights.sun.shadow.intensity = lighting.shadowStrength

        // A low sun means the sky is doing more of the work, so the fill
        // rises as the sun falls. Nothing reads as black.
        const height = lighting.elevation / 90
        lights.hemisphere.color.copy(ambientColor(lighting.warmth))
        lights.hemisphere.groundColor.set(lighting.warmth > 0.6 ? '#6b5238' : '#5a4a38')
        lights.hemisphere.intensity = 1.15 + (1 - height) * 0.9

        // The fill comes from the opposite side of the sun.
        lights.fill.position.set(-direction.x, 0.4, -direction.z).multiplyScalar(10)
        lights.fill.intensity = 0.55
    }

    const fitShadow = () => {
        const radius = Math.max(sphere.radius, 2)
        const camera = lights.sun.shadow.camera

        camera.left = -radius
        camera.right = radius
        camera.top = radius
        camera.bottom = -radius
        camera.near = 0.1
        camera.far = radius * 6
        camera.updateProjectionMatrix()
    }

    return {
        renderer,
        scene,
        camera,
        controls,
        components,

        syncScene(nextScene) {
            components.sync(nextScene, getStyleProfile(currentStyleId), shading)

            bounds.setFromObject(components.group)
            if (bounds.isEmpty()) {
                bounds.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 4, 1))
            }
            bounds.getBoundingSphere(sphere)

            fitShadow()
            applyLighting()
        },

        frameScene(nextScene) {
            const asset = nextScene.assets[0]
            const height =
                typeof asset?.parameters.height === 'number' ? asset.parameters.height : 4.2

            // The canopy reaches wider and taller than the trunk, so the
            // frame is driven by the height plus room for the branches.
            const distance = Math.max(height * 2.7, 8)

            controls.target.set(0, height * 0.58, 0)
            camera.position
                .copy(controls.target)
                .add(new THREE.Vector3(-0.62, 0.36, 0.62).normalize().multiplyScalar(distance))
            controls.update()
        },

        setLighting(nextLighting) {
            lighting = nextLighting
            applyLighting()
        },

        setShadingMode(mode) {
            shading = mode
            // The shadow belongs to the finished look only.
            renderer.shadowMap.enabled = mode === 'lit'
            renderer.shadowMap.needsUpdate = true
        },

        setStyle(nextStyleId) {
            currentStyleId = nextStyleId
        },

        countFaces() {
            return countFaces(components.group)
        },

        resize() {
            const width = container.clientWidth
            const height = container.clientHeight

            if (width === 0 || height === 0) {
                return
            }

            camera.aspect = width / height
            camera.updateProjectionMatrix()
            renderer.setSize(width, height)
        },

        dispose() {
            controls.dispose()
            components.dispose()
            sky.dispose()
            renderer.dispose()
        },
    }
}
