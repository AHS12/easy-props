/**
 * Renders scene components into Three.js objects.
 *
 * The renderer is a projection of the scene graph: when the graph changes,
 * only the components whose signature changed are regenerated. Everything
 * else keeps its geometry, and obsolete geometry is disposed.
 */

import * as THREE from 'three'
import {findComponentGenerator} from '../../assets/trees/component-generators'
import {createSeededRandom} from '../../assets/shared/random'
import type {SceneComponent} from '../../assets/shared/component-types'
import type {MaterialKind} from '../../assets/shared/generator-types'
import {darken, lighten, MATERIAL_COLORS} from '../../assets/style/materials'
import {createPartMaterial} from '../../assets/style/part-material'
import {SHADING_MODES, SHADING_MODE_LABELS, type ShadingMode} from '../../assets/style/shading'
import type {StyleProfile} from '../../assets/style/style-profiles'
import type {Scene, SceneMaterials} from '../../core/scene/scene-model'
import {VIEWPORT_COLORS} from './materials'

export {SHADING_MODES, SHADING_MODE_LABELS, type ShadingMode}

export interface ComponentMaterials {
    readonly lit: THREE.MeshStandardMaterial
    readonly flat: THREE.MeshBasicMaterial
    readonly wire: THREE.MeshBasicMaterial
}

export interface RenderedComponent {
    readonly id: string
    readonly group: THREE.Group
    readonly mesh: THREE.Mesh
    readonly outline: THREE.Mesh
    readonly materials: ComponentMaterials
    readonly materialKind: MaterialKind
    readonly signature: string
}

export interface ComponentRenderer {
    readonly group: THREE.Group
    /** Brings the renderer in line with the scene graph. */
    sync(scene: Scene, style: StyleProfile, shading: ShadingMode): void
    get(componentId: string): RenderedComponent | undefined
    /** Every rendered component. */
    all(): readonly RenderedComponent[]
    dispose(): void
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
    })

    const color = new THREE.Color(materialColor(part.material, materials))

    const lit = createPartMaterial(part, color, style.flatShading)

    const isProxy = part.surface?.proxy === true

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

    const mesh = new THREE.Mesh(part.geometry, lit)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = `${component.type}_${component.id}`
    mesh.userData.componentId = component.id
    // Hidden, but a raycast does not care: this is what the pointer lands on.
    mesh.visible = !isProxy
    mesh.userData.isProxy = isProxy
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
        materials: {lit, flat, wire},
        materialKind: part.material,
        signature,
    }
}

export function createComponentRenderer(): ComponentRenderer {
    const group = new THREE.Group()
    group.name = 'components'

    const rendered = new Map<string, RenderedComponent>()

    let shading: ShadingMode = 'lit'

    const applyShading = (component: RenderedComponent) => {
        component.mesh.material =
            shading === 'lit'
                ? component.materials.lit
                : shading === 'flat'
                  ? component.materials.flat
                  : component.materials.wire

        // Shadows only belong to the finished look.
        component.mesh.castShadow = shading === 'lit' && component.mesh.visible
        component.mesh.receiveShadow = shading === 'lit' && component.mesh.userData.receivesShadow
    }

    const disposeComponent = (component: RenderedComponent) => {
        component.mesh.geometry.dispose()
        component.materials.lit.dispose()
        component.materials.flat.dispose()
        component.materials.wire.dispose()
        ;(component.outline.material as THREE.Material).dispose()
        component.group.removeFromParent()
    }

    return {
        group,

        sync(scene, style, nextShading) {
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
            }

            const seen = new Set<string>()

            for (const component of asset.components) {
                seen.add(component.id)

                const signature = signatureOf(component, style.id)
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
                    existing.materials.flat.color.copy(color)
                    applyShading(existing)
                    continue
                }

                if (existing) {
                    disposeComponent(existing)
                    rendered.delete(component.id)
                }

                const created = buildComponent(component, style, signature, asset.materials)

                if (created) {
                    applyShading(created)
                    rendered.set(component.id, created)
                    group.add(created.group)
                }
            }

            for (const [id, component] of rendered) {
                if (!seen.has(id)) {
                    disposeComponent(component)
                    rendered.delete(id)
                }
            }
        },

        get(componentId) {
            return rendered.get(componentId)
        },

        all() {
            return [...rendered.values()]
        },

        dispose() {
            for (const component of rendered.values()) {
                disposeComponent(component)
            }
            rendered.clear()
            group.clear()
        },
    }
}
