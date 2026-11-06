/**
 * Renders scene components into Three.js objects.
 *
 * The renderer is a projection of the scene graph: when the graph changes,
 * only the components whose signature changed are regenerated. Everything
 * else keeps its geometry, and obsolete geometry is disposed.
 */

import * as THREE from 'three'
import {roleOfPart} from '../../assets/shared/generator-types'
import {findComponentGenerator} from '../../assets/component-generators'
import {createSeededRandom} from '../../assets/shared/random'
import type {SceneComponent} from '../../assets/shared/component-types'
import type {GeneratedPart, MaterialKind} from '../../assets/shared/generator-types'
import {darken, lighten, MATERIAL_COLORS} from '../../assets/style/materials'
import {createPartMaterial} from '../../assets/style/part-material'
import {createWindUniforms, createWindMaterial, measureWind, type WindUniforms} from './wind-material'
import {addLiveWind, createLiveWindDepthMaterial, createLiveWindUniforms, type LiveWindUniforms} from './live-wind'
import {findPropGenerator} from '../../assets/prop-generators'
import {SHADING_MODES, SHADING_MODE_LABELS, type ShadingMode} from '../../assets/style/shading'
import type {StyleProfile} from '../../assets/style/style-profiles'
import type {Scene, SceneMaterials} from '../../core/scene/scene-model'
import {VIEWPORT_COLORS} from './materials'
import {cartoonFromStandard, createCartoonMaterial} from './cartoon'
import {addCelLook, celCardFromStandard, centreCelLight, createCelMaterial, ensureFlatColours} from './cel'
import {createIdMaterial, setIdMap} from './ink-lines'

export {SHADING_MODES, SHADING_MODE_LABELS, type ShadingMode}

export interface ComponentMaterials {
    readonly lit: THREE.MeshStandardMaterial
    readonly cartoon: THREE.MeshToonMaterial
    readonly cel: THREE.MeshToonMaterial
    readonly flat: THREE.MeshBasicMaterial
    readonly wire: THREE.MeshBasicMaterial
    readonly wind: THREE.ShaderMaterial
    /** Its own colour, for finding where the Cartoon view's lines go. */
    readonly id: THREE.ShaderMaterial
}

export interface RenderedComponent {
    readonly id: string
    readonly group: THREE.Group
    readonly mesh: THREE.Mesh
    readonly outline: THREE.Mesh
    readonly materials: ComponentMaterials
    readonly materialKind: MaterialKind
    /** What this part should look like, which a mesh on its way may not show yet. */
    signature: string
    readonly styleId: string
}

export interface ComponentRenderer {
    readonly group: THREE.Group
    /** Brings the renderer in line with the scene graph. */
    sync(scene: Scene, style: StyleProfile, shading: ShadingMode, detail?: number): void
    get(componentId: string): RenderedComponent | undefined
    /** Every rendered component. */
    all(): readonly RenderedComponent[]
    /** Whether a mesh built elsewhere is still on its way, so what shows is not yet the newest scene. */
    readonly building: boolean
    /** Moves the prop in the wind: 0 holds it still. A prop that never moves ignores this. */
    setWind(strength: number, seconds: number): void
    /** Draws every part in its own colour, for the Cartoon view's lines. */
    drawIds(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void
    /** Shows a far-away card in place of the prop, or the prop again with null. Takes over the card. */
    setStandIn(card: StandIn | null): void
    dispose(): void
}

/** A flat stand-in for the whole prop, standing on its pivot. */
export interface StandIn {
    readonly geometry: THREE.BufferGeometry
    readonly material: THREE.MeshStandardMaterial
    readonly pivot: readonly [number, number, number]
}

/** The colour a material kind is painted with, given the tree's colours. */
export function materialColor(kind: MaterialKind, materials: SceneMaterials): string {
    switch (kind) {
        case 'bark':
            return materials.bark
        case 'bark-light':
            return lighten(materials.bark, 0.2)
        case 'leaves':
            return materials.leaves
        case 'leaves-dark':
            return darken(materials.leaves, 0.24)
        case 'coconut':
            return MATERIAL_COLORS.coconut
        case 'painted':
            // The colour is in the vertices. White leaves it alone.
            return '#ffffff'
    }
}

/**
 * A signature of everything that affects a component's geometry.
 *
 * When the signature is unchanged the geometry is reused.
 */
function signatureOf(component: SceneComponent, styleId: string): string {
    const generator = findComponentGenerator(component.generatorId)

    if (generator?.signature) {
        return JSON.stringify([
            styleId,
            component.generatorId,
            component.generatorVersion,
            generator.signature(generator.validate(component.parameters).parameters),
        ])
    }

    return JSON.stringify([
        styleId,
        component.generatorId,
        component.generatorVersion,
        component.transform,
        component.parameters,
    ])
}

function buildComponent(
    component: SceneComponent,
    style: StyleProfile,
    signature: string,
    materials: SceneMaterials,
    detail: number,
    windUniforms: WindUniforms,
    liveWind: LiveWindUniforms,
    idIndex: number,
): RenderedComponent | undefined {
    const generator = findComponentGenerator(component.generatorId)

    if (!generator) {
        return undefined
    }

    const validated = generator.validate(component.parameters)

    const part = generator.generate(validated.parameters, {
        random: createSeededRandom(component.seed),
        seed: component.seed,
        style,
        detail,
    })

    const color = new THREE.Color(materialColor(part.material, materials))

    const lit = createPartMaterial(part, color, style.flatShading)
    const cartoon = createCartoonMaterial(part, color, style.flatShading)
    const cel = createCelMaterial(part, color, style.flatShading)

    const isProxy = part.surface?.proxy === true

    const wind = createWindMaterial(windUniforms, roleOfPart(part) === 'foliage', part.surface)

    const flat = new THREE.MeshBasicMaterial({
        color,
        vertexColors: part.surface?.vertexColors ?? false,
        map: part.surface?.map ?? null,
        alphaTest: part.surface?.alphaTest ?? 0,
    })

    const wire = new THREE.MeshBasicMaterial({
        color: new THREE.Color(VIEWPORT_COLORS.wireframe),
        wireframe: true,
    })

    const foliage = roleOfPart(part) === 'foliage'

    const id = createIdMaterial(idIndex, part.surface?.map ?? null, part.surface?.alphaTest ?? 0, lit.side)

    for (const material of [lit, cartoon, cel, flat, wire, id]) {
        addLiveWind(material, windUniforms, liveWind, foliage)
    }
    addCelLook(cel)

    const mesh = new THREE.Mesh(part.geometry, lit)
    mesh.customDepthMaterial = createLiveWindDepthMaterial(
        windUniforms,
        liveWind,
        foliage,
        part.surface?.map ?? null,
        part.surface?.alphaTest ?? 0,
    )
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = `${component.type}_${component.id}`
    mesh.userData.componentId = component.id
    // Hidden, but a raycast does not care: this is what the pointer lands on.
    mesh.visible = !isProxy
    mesh.userData.isProxy = isProxy
    mesh.userData.role = roleOfPart(part)
    mesh.userData.receivesShadow = part.surface?.receiveShadow ?? true

    // The outline shares the geometry, so it costs almost nothing.
    const outline = new THREE.Mesh(
        part.geometry,
        new THREE.MeshBasicMaterial({
            color: new THREE.Color(VIEWPORT_COLORS.selection),
            side: THREE.BackSide,
            transparent: true,
            opacity: 0.95,
            map: part.surface?.map ?? null,
            alphaTest: part.surface?.alphaTest ?? 0,
            ...(isProxy ? {side: THREE.FrontSide, depthTest: false, opacity: 0.4} : {}),
        }),
    )
    // The outline moves with its part, so a selection stays on what it selects.
    addLiveWind(outline.material as THREE.Material, windUniforms, liveWind, foliage)
    outline.name = `${component.type}_${component.id}_outline`
    // A proxy already sits outside the bark, and its vertices are in world
    // space, where scaling about the origin would slide it off the limb.
    outline.scale.setScalar(isProxy ? 1 : 1.03)
    outline.visible = false
    outline.userData.isHelper = true

    const group = new THREE.Group()
    group.name = component.id
    group.add(mesh)
    group.add(outline)

    group.position.set(...component.transform.position)
    group.rotation.set(...component.transform.rotation)
    group.scale.set(...component.transform.scale)

    return {
        id: component.id,
        group,
        mesh,
        outline,
        materials: {lit, cartoon, cel, flat, wire, wind, id},
        materialKind: part.material,
        signature,
        styleId: style.id,
    }
}

/** Keeps a part's materials showing the texture of a mesh swapped in under them. */
function reprint(component: RenderedComponent, part: GeneratedPart | undefined): void {
    const map = part?.surface?.map ?? null
    const {lit, cartoon, cel, flat} = component.materials
    const depth = component.mesh.customDepthMaterial as THREE.MeshDepthMaterial

    for (const material of [lit, cartoon, cel, flat, component.outline.material as THREE.MeshBasicMaterial, depth]) {
        // Gaining or losing a texture changes the shader, not just a value.
        material.needsUpdate = !material.map !== !map
        material.map = map
    }

    lit.normalMap = part?.surface?.normalMap ?? null
    cartoon.normalMap = lit.normalMap
    setIdMap(component.materials.id, map)
}

/** A style id that also says which detail level is showing. Full detail is just the style. */
const levelledId = (styleId: string, detail: number) => (detail === 1 ? styleId : `${styleId}@${detail}`)

/** What a sync was asked to show. */
interface SyncRequest {
    readonly scene: Scene
    readonly style: StyleProfile
    readonly shading: ShadingMode
    readonly detail: number
}

/** How many times the threads practise on the first tree, so the first drag is not the slowest. */
const WARM_UP_BUILDS = 3

/**
 * @param onContentArrived Called when a sync that waited for a mesh built
 * elsewhere has finally been applied, since the scene changed after sync returned.
 */
export function createComponentRenderer(onContentArrived?: () => void): ComponentRenderer {
    const group = new THREE.Group()
    group.name = 'components'

    const rendered = new Map<string, RenderedComponent>()
    let building = false
    let wanted: SyncRequest | null = null
    let warmedUp = false

    let shading: ShadingMode = 'lit'
    const windUniforms = createWindUniforms()
    const liveWind = createLiveWindUniforms()
    /** What the wind was last measured against, so it is measured once per change. */
    let measuredScene: Scene | null = null
    let shownScene: Scene | null = null
    let still = false
    let standIn: THREE.Mesh | null = null
    /** The card's own material, and the ones it wears in the Cartoon and Comic views. */
    let cardLooks: {lit: THREE.MeshStandardMaterial; cartoon: THREE.MeshToonMaterial; cel?: THREE.MeshToonMaterial; id: THREE.ShaderMaterial} | null = null
    let nextId = 0

    const showCardLook = () => {
        if (!standIn || !cardLooks) {
            return
        }

        // Flattening the card's picture takes a moment, so only the Comic view pays for it.
        if (shading === 'cel' && !cardLooks.cel) {
            const cel = celCardFromStandard(cardLooks.lit)
            addLiveWind(cel, windUniforms, liveWind, false)
            addCelLook(cel)
            cardLooks.cel = cel
        }

        standIn.material = shading === 'cartoon' ? cardLooks.cartoon : shading === 'cel' ? cardLooks.cel! : cardLooks.lit
    }

    const showParts = () => {
        for (const component of rendered.values()) {
            component.group.visible = standIn === null
        }
    }

    const removeStandIn = () => {
        if (!standIn) {
            return
        }

        const looks = cardLooks!

        standIn.removeFromParent()
        standIn.geometry.dispose()
        looks.lit.map?.dispose()
        looks.lit.normalMap?.dispose()
        looks.lit.dispose()
        looks.cartoon.dispose()
        // Its picture is a flattened copy of the card's, made for it alone.
        looks.cel?.map?.dispose()
        looks.cel?.dispose()
        looks.id.dispose()
        standIn.customDepthMaterial?.dispose()
        standIn = null
        cardLooks = null
    }

    const measureFor = (scene: Scene) => {
        const asset = scene.assets[0]

        if (asset && measuredScene !== scene) {
            measuredScene = scene
            measureWind(windUniforms, rendered.values(), findPropGenerator(asset.generatorId), asset)
        }
    }

    const applyShading = (component: RenderedComponent) => {
        component.mesh.material =
            shading === 'lit'
                ? component.materials.lit
                : shading === 'cartoon'
                  ? component.materials.cartoon
                  : shading === 'cel'
                    ? component.materials.cel
                    : shading === 'flat'
                    ? component.materials.flat
                    : shading === 'wind'
                      ? component.materials.wind
                      : component.materials.wire

        // Shadows only belong to the finished looks.
        const finished = shading === 'lit' || shading === 'cartoon' || shading === 'cel'
        component.mesh.castShadow = finished && component.mesh.visible
        component.mesh.receiveShadow = finished && component.mesh.userData.receivesShadow

        // Finding a part's few main colours takes a moment, so only the Comic view pays for it.
        if (shading === 'cel') {
            ensureFlatColours(component.mesh.geometry)
            centreCelLight(component.materials.cel, component.mesh.geometry)
        }
    }

    const disposeComponent = (component: RenderedComponent) => {
        component.mesh.geometry.dispose()
        component.materials.lit.dispose()
        component.materials.cartoon.dispose()
        component.materials.cel.dispose()
        component.materials.id.dispose()
        component.materials.flat.dispose()
        component.materials.wire.dispose()
        component.materials.wind.dispose()
        component.mesh.customDepthMaterial?.dispose()
        ;(component.outline.material as THREE.Material).dispose()
        component.group.removeFromParent()
    }

    /** Runs the threads through a first tree, off to the side, and throws the results away. */
    const warmUp = (component: SceneComponent, style: StyleProfile) => {
        const generator = findComponentGenerator(component.generatorId)

        if (warmedUp || !generator?.buildOffThread) {
            return
        }

        warmedUp = true

        const parameters = generator.validate(component.parameters).parameters
        const practise = (remaining: number) => {
            if (remaining > 0) {
                generator.buildOffThread!(parameters, style)?.then(
                    (geometry) => {
                        geometry.dispose()
                        practise(remaining - 1)
                    },
                    () => {},
                )
            }
        }

        practise(WARM_UP_BUILDS)
    }

    /** Brings every part in line with the scene, here and now. */
    const apply = ({scene, style, shading: nextShading, detail}: SyncRequest) => {
        const asset = scene.assets[0]

        if (!asset) {
            for (const component of rendered.values()) {
                disposeComponent(component)
            }
            rendered.clear()
            return
        }

        if (nextShading !== shading) {
            shading = nextShading
            showCardLook()
        }

        const seen = new Set<string>()

        for (const component of asset.components) {
            seen.add(component.id)

            const signature = signatureOf(component, levelledId(style.id, detail))
            const existing = rendered.get(component.id)

            if (existing && existing.signature === signature) {
                // A part whose signature leaves out its position can move
                // without a rebuild.
                existing.group.position.set(...component.transform.position)

                // The geometry is unchanged. Only the colours can differ.
                const color = new THREE.Color(
                    materialColor(existing.materialKind, asset.materials),
                )
                existing.materials.lit.color.copy(color)
                existing.materials.cartoon.color.copy(color)
                existing.materials.cel.color.copy(color)
                existing.materials.flat.color.copy(color)
                applyShading(existing)
                continue
            }

            if (existing) {
                disposeComponent(existing)
                rendered.delete(component.id)
            }

            const created = buildComponent(component, style, signature, asset.materials, detail, windUniforms, liveWind, nextId++)

            if (created) {
                applyShading(created)
                rendered.set(component.id, created)
                group.add(created.group)
                warmUp(component, style)
            }
        }

        for (const [id, component] of rendered) {
            if (!seen.has(id)) {
                disposeComponent(component)
                rendered.delete(id)
            }
        }

        shownScene = scene
        measuredScene = null
        still = findPropGenerator(asset.generatorId)?.still === true

        if (shading === 'wind' || liveWind.strength.value > 0) {
            measureFor(scene)
        }

        showParts()
    }

    /**
     * Starts building the heavy mesh this request needs, if it needs one.
     *
     * A new style can change a part's material, so that still rebuilds in place.
     */
    const startHeavyBuild = (request: SyncRequest): boolean => {
        const {scene, style, detail} = request

        for (const component of scene.assets[0]?.components ?? []) {
            const generator = findComponentGenerator(component.generatorId)
            const existing = rendered.get(component.id)

            if (!generator?.buildOffThread || !existing || existing.styleId !== style.id) {
                continue
            }

            const signature = signatureOf(component, levelledId(style.id, detail))

            if (existing.signature === signature) {
                continue
            }

            const build = generator.buildOffThread(generator.validate(component.parameters).parameters, style, detail)

            if (!build) {
                continue
            }

            building = true

            const finish = (geometry: THREE.BufferGeometry | null) => {
                building = false

                if (rendered.get(component.id) === existing) {
                    if (geometry) {
                        existing.mesh.geometry.dispose()
                        existing.mesh.geometry = geometry
                        existing.outline.geometry = geometry
                        existing.signature = signature
                        reprint(existing, generator.dress?.(geometry, generator.validate(component.parameters).parameters))
                    }

                    // The rest of the tree joins it now, so the whole tree moves
                    // in one frame. Without a mesh, this rebuilds it in place.
                    apply(request)
                    onContentArrived?.()
                } else {
                    geometry?.dispose()
                }

                if (wanted) {
                    const next = wanted

                    wanted = null
                    sync(next)
                }
            }

            build.then(finish, () => finish(null))

            return true
        }

        return false
    }

    /**
     * Shows a request, as soon as all of it can be shown together.
     *
     * A heavy mesh is built elsewhere and everything waits for it, so leaves
     * never drift away from the wood. One build runs at a time, and only the
     * newest request is kept, so a fast drag skips values it has passed instead
     * of falling behind. A change that needs no heavy mesh appears at once.
     */
    const sync = (request: SyncRequest) => {
        if (building) {
            wanted = request
            return
        }

        if (!startHeavyBuild(request)) {
            apply(request)
        }
    }

    return {
        group,

        sync(scene, style, nextShading, detail = 1) {
            if (!scene.assets[0]) {
                wanted = null
                apply({scene, style, shading: nextShading, detail})
                return
            }

            sync({scene, style, shading: nextShading, detail})
        },

        get(componentId) {
            return rendered.get(componentId)
        },

        all() {
            return [...rendered.values()]
        },

        get building() {
            return building
        },

        setWind(strength, seconds) {
            // The Wind view shows the numbers, and moving them would only blur them.
            const next = still || shading === 'wind' ? 0 : strength

            if (next > 0 && shownScene) {
                measureFor(shownScene)
            }

            liveWind.strength.value = next
            liveWind.time.value = seconds
        },

        drawIds(renderer, camera) {
            const shown: [RenderedComponent, THREE.Material | THREE.Material[], boolean][] = []

            for (const component of rendered.values()) {
                shown.push([component, component.mesh.material, component.outline.visible])
                component.mesh.material = component.materials.id
                component.outline.visible = false
            }

            const cardMaterial = standIn?.material
            if (standIn && cardLooks) {
                standIn.material = cardLooks.id
            }

            renderer.render(group, camera)

            for (const [component, material, outlined] of shown) {
                component.mesh.material = material
                component.outline.visible = outlined
            }
            if (standIn && cardMaterial) {
                standIn.material = cardMaterial
            }
        },

        setStandIn(card) {
            removeStandIn()

            if (card) {
                const mesh = new THREE.Mesh(card.geometry, card.material)
                const looks = {
                    lit: card.material,
                    cartoon: cartoonFromStandard(card.material),
                    // Its own colour in the lines pass, so a far-away crown is outlined too.
                    id: createIdMaterial(nextId++, card.material.map, card.material.alphaTest, card.material.side),
                }

                // It sways as the wood does, and never flutters, as in the file.
                for (const material of [looks.lit, looks.cartoon, looks.id]) {
                    addLiveWind(material, windUniforms, liveWind, false)
                }
                cardLooks = looks
                mesh.customDepthMaterial = createLiveWindDepthMaterial(windUniforms, liveWind, false, card.material.map, card.material.alphaTest)
                mesh.position.set(...card.pivot)
                mesh.castShadow = true
                mesh.receiveShadow = true
                mesh.name = 'far_away_card'
                mesh.userData.isHelper = true
                standIn = mesh
                group.add(mesh)
                showCardLook()
            }

            showParts()
        },

        dispose() {
            removeStandIn()

            for (const component of rendered.values()) {
                disposeComponent(component)
            }
            rendered.clear()
            group.clear()
        },
    }
}
