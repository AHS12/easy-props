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
import type {FaceCounts} from '../../core/export/pipeline/budget'
import type {Scene} from '../../core/scene/scene-model'
import type {CollisionShape} from '../../assets/shared/generator-types'
import {attachCameraControls} from './camera-controls'
import {createCollisionView} from './collision-shapes'
import {
    createComponentRenderer,
    type ComponentRenderer,
    type ShadingMode,
    type StandIn,
} from './component-renderer'
import {cartoonFromStandard} from './cartoon'
import {celFromStandard} from './cel'
import {createIdMaterial, createInkLines, LAND_ID, type LineStyle} from './ink-lines'
import {VIEWPORT_COLORS} from './materials'
import {createMeadowScenery, type MeadowScenery} from './meadow-scenery'

export type Backdrop = 'sky' | 'studio-sky' | 'meadow' | 'grove' | 'grey' | 'colour'

export interface ViewportScene {
    readonly renderer: THREE.WebGLRenderer
    readonly scene: THREE.Scene
    readonly camera: THREE.PerspectiveCamera
    readonly controls: ReturnType<typeof attachCameraControls>
    readonly components: ComponentRenderer
    /** Draws one frame: the scene, and the Cartoon view's lines over it. */
    draw(): void
    /** Brings the viewport in line with the scene graph. */
    syncScene(scene: Scene): void
    /** Told when a sync that waited for a mesh built elsewhere has been applied. */
    setOnContentArrived(listener: (() => void) | null): void
    /** Frames the whole tree. */
    frameScene(scene: Scene): void
    /** Moves the sun and re-lights the scene. */
    setLighting(lighting: SceneLighting): void
    /** Switches between the lit, flat, and wireframe views. */
    setShadingMode(mode: ShadingMode): void
    /** How thick the Cartoon and Comic lines are: 1 is the usual. */
    setLineWeight(weight: number): void
    /** Frames one part, or the whole prop for null. */
    frameComponent(componentId: string | null): void
    setBackdrop(backdrop: Backdrop, colour: string): void
    setGridVisible(visible: boolean): void
    setShadowsAllowed(allowed: boolean): void
    setFieldOfView(degrees: number): void
    /** Draws at this share of the screen's resolution. */
    setRenderScale(scale: number): void
    setScaleFigureVisible(visible: boolean): void
    /** Moves the prop in the wind: 0 holds it still. */
    setWind(strength: number, seconds: number): void
    /** Draws the shapes a game uses for walking into. An empty list clears them. */
    setCollisionShapes(shapes: readonly CollisionShape[]): void
    /** The prop's size in metres: width, height, depth. */
    contentSize(): readonly [number, number, number]
    /** Applies a new style profile. The scene is resynced afterwards. */
    setStyle(styleId: StyleProfileId): void
    /** Faces in the content, excluding rendering helpers such as outlines. */
    countFaces(): number
    /** The same faces, by what they will be exported as. */
    countFacesByMesh(): FaceCounts
    /** Shows a share of the full detail. The scene is resynced afterwards. */
    setDetail(detail: number): void
    /** Shows a far-away card in place of the prop, or the prop again with null. */
    setStandIn(card: StandIn | null): void
    resize(): void
    dispose(): void
}

const CAMERA_FOV = 45
/** Comic lines are bold ink. Cartoon ones are thin and soft, as a painter might pencil them. */
const LINE_STYLES: Readonly<Partial<Record<ShadingMode, LineStyle>>> = {
    cartoon: {weight: 0.75, strength: 0.45},
    cel: {weight: 1.5, strength: 1},
}
const CAMERA_NEAR = 0.05
const CAMERA_FAR = 500
/** A clear midday sun, however warm the rest of the time of day is. */
const MEADOW_WARMTH = 0.3
/** A big bright sky: shade stays clearly coloured and never goes dark. */
const MEADOW_SKY_LIGHT = 1.6
const MIN_NORMAL_BIAS = 0.035
const NORMAL_BIAS_TEXELS = 8

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

function createRenderer(container: HTMLElement, antialias: boolean): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({
        antialias,
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
function createSkyTexture(top: string, horizon: string): THREE.Texture {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 256

    const context = canvas.getContext('2d')
    const gradient = context!.createLinearGradient(0, 0, 0, 256)
    gradient.addColorStop(0, top)
    gradient.addColorStop(0.62, horizon)
    gradient.addColorStop(1, horizon)
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

function addGround(scene: THREE.Scene): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({color: new THREE.Color(VIEWPORT_COLORS.ground), roughness: 1})
    const ground = new THREE.Mesh(new THREE.CircleGeometry(50, 64), material)

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

    return material
}

/** A plain 1.8 m figure, for judging a prop's size. */
function createScaleFigure(): THREE.Group {
    const material = new THREE.MeshStandardMaterial({color: '#c9ccd1', roughness: 0.75})
    const figure = new THREE.Group()
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 1.02, 6, 16), material)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 14), material)

    body.position.y = 0.72
    body.scale.z = 0.72
    head.position.y = 1.665
    body.castShadow = true
    head.castShadow = true
    figure.add(body, head)
    figure.visible = false
    figure.name = 'scale_figure'

    return figure
}

export function createViewportScene(
    container: HTMLElement,
    styleId: StyleProfileId,
    antialias = true,
): ViewportScene {
    const renderer = createRenderer(container, antialias)
    const camera = createCamera(container)
    const scene = new THREE.Scene()

    const sky = createSkyTexture(VIEWPORT_COLORS.skyTop, VIEWPORT_COLORS.skyHorizon)
    const meadowSky = createSkyTexture(VIEWPORT_COLORS.meadowSkyTop, VIEWPORT_COLORS.meadowHorizon)
    scene.background = sky
    scene.fog = new THREE.Fog(new THREE.Color(VIEWPORT_COLORS.skyHorizon), 22, 60)

    const lights = addLighting(scene)
    const groundMaterial = addGround(scene)
    let meadow = false
    /** Meadow's sky and sunlight, which Studio with sky has too. */
    let bright = false
    let scenery: MeadowScenery | null = null
    const ground = scene.getObjectByName('ground') as THREE.Mesh
    const groundLooks: {cartoon?: THREE.MeshToonMaterial; cel?: THREE.MeshToonMaterial} = {}
    const groundId = createIdMaterial(LAND_ID, null, 0, THREE.FrontSide)

    /** Draws the ground and scenery as the prop is drawn. */
    const applyLook = () => {
        const look = shading === 'cartoon' || shading === 'cel' ? shading : 'lit'

        if (look === 'cartoon') {
            groundLooks.cartoon ??= cartoonFromStandard(groundMaterial)
        } else if (look === 'cel') {
            groundLooks.cel ??= celFromStandard(groundMaterial, ground.geometry)
        }

        ground.material = (look === 'lit' ? undefined : groundLooks[look]) ?? groundMaterial
        scenery?.setLook(look)
    }

    /** Every outlined thing in its own colour: the prop, and in the demos the scenery and ground. */
    const drawIds = () => {
        components.drawIds(renderer, camera)

        if (meadow && scenery) {
            scenery.drawIds(renderer, camera)

            const shown = ground.material
            ground.material = groundId
            renderer.render(ground, camera)
            ground.material = shown
        }
    }
    let gridWanted = true

    const controls = attachCameraControls(camera, renderer.domElement)

    const figure = createScaleFigure()
    scene.add(figure)

    const collision = createCollisionView()
    scene.add(collision.group)

    const horizon = scene.fog.color.clone()
    let shadowsAllowed = true
    let shadowsWanted = true

    let onContentArrived: (() => void) | null = null
    let detail = 1


    const components = createComponentRenderer(() => {
        fitToContent()
        onContentArrived?.()
    })
    scene.add(components.group)
    const inkLines = createInkLines()

    let currentStyleId = styleId
    let shading: ShadingMode = 'lit'
    let lineWeight = 1
    let lighting: SceneLighting = DEFAULT_LIGHTING

    /** The centre and radius the shadow camera has to cover. */
    const bounds = new THREE.Box3()
    const sphere = new THREE.Sphere()

    const showGrid = () => {
        for (const name of ['grid_minor', 'grid_major']) {
            scene.getObjectByName(name)!.visible = gridWanted && !meadow
        }
    }

    const applyLighting = () => {
        const direction = sunDirection(lighting)

        lights.sun.target.position.copy(sphere.center)
        lights.sun.target.updateMatrixWorld()

        // The sun sits far enough back that its shadow map covers the tree.
        const distance = Math.max(sphere.radius * 3, 12)
        lights.sun.position.copy(sphere.center).add(direction.clone().multiplyScalar(distance))

        lights.sun.color.copy(sunColor(bright ? lighting.warmth * MEADOW_WARMTH : lighting.warmth))
        lights.sun.intensity = 2.4 + lighting.warmth * 0.9
        lights.sun.castShadow = lighting.shadowStrength > 0.02
        lights.sun.shadow.intensity = lighting.shadowStrength

        // A low sun means the sky is doing more of the work, so the fill
        // rises as the sun falls. Nothing reads as black.
        const height = lighting.elevation / 90
        lights.hemisphere.color.copy(ambientColor(lighting.warmth))
        lights.hemisphere.groundColor.set(meadow ? VIEWPORT_COLORS.meadowBounce : lighting.warmth > 0.6 ? '#6b5238' : '#5a4a38')
        lights.hemisphere.intensity = (1.15 + (1 - height) * 0.9) * (bright ? MEADOW_SKY_LIGHT : 1)

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
        // Acne grows with the size of a shadow map's texels, so the bias has to as
        // well, or a large rock shows a jagged edge where its light meets its shade.
        lights.sun.shadow.normalBias = Math.max(MIN_NORMAL_BIAS, ((radius * 2) / lights.sun.shadow.mapSize.width) * NORMAL_BIAS_TEXELS)
    }

    const fitToContent = () => {
        bounds.setFromObject(components.group)
        if (bounds.isEmpty()) {
            bounds.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 4, 1))
        }
        bounds.getBoundingSphere(sphere)

        fitShadow()
        applyLighting()

        // The figure stands clear of the crown, on the side the camera starts.
        figure.position.set(bounds.min.x - 0.6, 0, bounds.max.z + 0.6)
        scenery?.setClearing(Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) / 2)
    }

    return {
        renderer,
        scene,
        camera,
        controls,
        components,

        draw() {
            groundLooks.cartoon?.color.copy(groundMaterial.color)
            groundLooks.cel?.color.copy(groundMaterial.color)
            renderer.render(scene, camera)

            const lines = LINE_STYLES[shading]

            if (lines) {
                inkLines.draw(renderer, camera, drawIds, {weight: lines.weight * lineWeight, strength: lines.strength})
            }
        },

        syncScene(nextScene) {
            components.sync(nextScene, getStyleProfile(currentStyleId), shading, detail)
            fitToContent()
        },

        setOnContentArrived(listener) {
            onContentArrived = listener
        },

        frameScene(nextScene) {
            const asset = nextScene.assets[0]
            const height =
                typeof asset?.parameters.height === 'number' ? asset.parameters.height : 4.2
            const width = typeof asset?.parameters.width === 'number' ? asset.parameters.width : 0

            // The canopy reaches wider and taller than the trunk, so the
            // frame is driven by the height plus room for the branches.
            // A rock says how wide it is, and a long one needs the room.
            const distance = Math.max(height * 2.7, width * 2.4, asset?.parameters.width === undefined ? 8 : 2)

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

        setLineWeight(weight) {
            lineWeight = weight
        },

        setShadingMode(mode) {
            shading = mode
            applyLook()
            // The shadow belongs to the finished looks only.
            shadowsWanted = mode === 'lit' || mode === 'cartoon' || mode === 'cel'
            renderer.shadowMap.enabled = shadowsWanted && shadowsAllowed
            renderer.shadowMap.needsUpdate = true
        },

        frameComponent(componentId) {
            const part = componentId
                ? components.all().find((component) => component.id === componentId)
                : undefined
            const box = new THREE.Box3().setFromObject(part ? part.mesh : components.group)

            if (box.isEmpty()) {
                return
            }

            const fit = box.getBoundingSphere(new THREE.Sphere())
            const fov = THREE.MathUtils.degToRad(camera.fov)
            const distance = Math.max((fit.radius * 1.25) / Math.sin(fov / 2), controls.minDistance)
            const direction = camera.position.clone().sub(controls.target).normalize()

            controls.target.copy(fit.center)
            camera.position.copy(fit.center).addScaledVector(direction, Math.min(distance, controls.maxDistance))
            controls.update()
        },

        setBackdrop(backdrop, colour) {
            const color =
                backdrop === 'grey' ? new THREE.Color('#6f7174') : backdrop === 'colour' ? new THREE.Color(colour) : null

            meadow = backdrop === 'meadow' || backdrop === 'grove'
            bright = meadow || backdrop === 'studio-sky'
            scene.background = color ?? (bright ? meadowSky : sky)
            ;(scene.fog as THREE.Fog).color.copy(color ?? (bright ? new THREE.Color(VIEWPORT_COLORS.meadowHorizon) : horizon))
            groundMaterial.color.set(meadow ? VIEWPORT_COLORS.meadowGround : bright ? VIEWPORT_COLORS.studioSkyGround : VIEWPORT_COLORS.ground)
            applyLighting()
            showGrid()

            // Built the first time it is wanted: most people never open it.
            if (meadow && !scenery) {
                scenery = createMeadowScenery()
                scene.add(scenery.group)
                applyLook()
                fitToContent()
            }

            if (scenery) {
                scenery.group.visible = meadow
                scenery.setTrees(backdrop === 'grove')
            }
        },

        setGridVisible(visible) {
            gridWanted = visible
            showGrid()
        },

        setShadowsAllowed(allowed) {
            shadowsAllowed = allowed
            renderer.shadowMap.enabled = shadowsWanted && shadowsAllowed
            renderer.shadowMap.needsUpdate = true
            // Materials bake the shadow state into their shaders.
            scene.traverse((object) => {
                const material = (object as THREE.Mesh).material as THREE.Material | undefined

                if (material && !Array.isArray(material)) {
                    material.needsUpdate = true
                }
            })
        },

        setFieldOfView(degrees) {
            camera.fov = degrees
            camera.updateProjectionMatrix()
        },

        setRenderScale(scale) {
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * scale)
            renderer.setSize(container.clientWidth, container.clientHeight)
        },

        setScaleFigureVisible(visible) {
            figure.visible = visible
        },

        setWind(strength, seconds) {
            components.setWind(strength, seconds)
        },

        setCollisionShapes(shapes) {
            collision.setShapes(shapes)
        },

        contentSize() {
            const box = new THREE.Box3().setFromObject(components.group)
            const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3())

            return [size.x, size.y, size.z]
        },

        setStyle(nextStyleId) {
            currentStyleId = nextStyleId
        },

        countFaces() {
            return countFaces(components.group)
        },

        countFacesByMesh() {
            const counts = {wood: 0, leaves: 0}

            for (const {mesh} of components.all()) {
                if (!mesh.userData.isProxy) {
                    const faces = countFaces(mesh)

                    if (mesh.userData.role === 'foliage') {
                        counts.leaves += faces
                    } else {
                        counts.wood += faces
                    }
                }
            }

            return counts
        },

        setDetail(next) {
            detail = next
        },

        setStandIn(card) {
            components.setStandIn(card)
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
            inkLines.dispose()
            groundLooks.cartoon?.dispose()
            groundLooks.cel?.dispose()
            groundId.dispose()
            collision.dispose()
            sky.dispose()
            meadowSky.dispose()
            scenery?.dispose()
            renderer.dispose()
        },
    }
}
