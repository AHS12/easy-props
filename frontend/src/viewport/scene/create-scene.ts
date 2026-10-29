/**
 * The viewport scene: renderer, camera, lighting, ground, and grid.
 *
 * Everything Three.js lives here so the rest of the app never has to think
 * about it.
 */

import * as THREE from 'three'
import {getStyleProfile, type StyleProfileId} from '../../assets/style/style-profiles'
import type {Scene} from '../../core/scene/scene-model'
import {attachCameraControls} from './camera-controls'
import {createComponentRenderer, type ComponentRenderer} from './component-renderer'
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
        if (!mesh.isMesh || mesh.userData.isHelper) {
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.domElement.classList.add('viewport__canvas')

    return renderer
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

function addLighting(scene: THREE.Scene): void {
    // Fills the shadow side so nothing reads as black.
    const hemisphere = new THREE.HemisphereLight(0xcfe3d0, 0x6b5a45, 0.8)
    scene.add(hemisphere)

    const key = new THREE.DirectionalLight(0xfff6e8, 1.6)
    key.position.set(-8, 9, 2)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.radius = 4
    key.shadow.camera.near = 0.5
    key.shadow.camera.far = 30
    key.shadow.camera.left = -8
    key.shadow.camera.right = 8
    key.shadow.camera.top = 8
    key.shadow.camera.bottom = -8
    key.shadow.bias = -0.0005
    scene.add(key)

    // Dim fill from the opposite side.
    const fill = new THREE.DirectionalLight(0xd8e6f0, 0.45)
    fill.position.set(6, 3, -5)
    scene.add(fill)
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
    scene.background = new THREE.Color(VIEWPORT_COLORS.background)
    scene.fog = new THREE.Fog(new THREE.Color(VIEWPORT_COLORS.background), 18, 46)

    addLighting(scene)
    addGround(scene)

    const controls = attachCameraControls(camera, renderer.domElement)

    const components = createComponentRenderer()
    scene.add(components.group)

    let currentStyleId = styleId

    return {
        renderer,
        scene,
        camera,
        controls,
        components,

        syncScene(nextScene) {
            components.sync(nextScene, getStyleProfile(currentStyleId))
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
            renderer.dispose()
        },
    }
}
