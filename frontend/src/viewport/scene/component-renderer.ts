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
import type {StyleProfile} from '../../assets/style/style-profiles'
import type {Scene} from '../../core/scene/scene-model'
import {MATERIAL_COLORS, VIEWPORT_COLORS} from './materials'

const MATERIAL_BY_KIND: Readonly<Record<MaterialKind, string>> = {
    bark: MATERIAL_COLORS.bark,
    'bark-light': MATERIAL_COLORS.barkLight,
    leaves: MATERIAL_COLORS.leaves,
    'leaves-dark': MATERIAL_COLORS.leavesDark,
    coconut: MATERIAL_COLORS.coconut,
}

export interface RenderedComponent {
    readonly id: string
    readonly group: THREE.Group
    readonly mesh: THREE.Mesh
    readonly outline: THREE.Mesh
    readonly material: THREE.MeshStandardMaterial
    readonly signature: string
}

export interface ComponentRenderer {
    readonly group: THREE.Group
    /** Brings the renderer in line with the scene graph. */
    sync(scene: Scene, style: StyleProfile): void
    get(componentId: string): RenderedComponent | undefined
    /** Every rendered component. */
    all(): readonly RenderedComponent[]
    dispose(): void
}

/**
 * A signature of everything that affects a component's geometry.
 *
 * When the signature is unchanged the geometry is reused.
 */
function signatureOf(component: SceneComponent, styleId: string): string {
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

    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(MATERIAL_BY_KIND[part.material]),
        roughness: 0.85,
        metalness: 0,
        flatShading: style.flatShading,
    })

    const mesh = new THREE.Mesh(part.geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = `${component.type}_${component.id}`
    mesh.userData.componentId = component.id

    // The outline shares the geometry, so it costs almost nothing.
    const outline = new THREE.Mesh(
        part.geometry,
        new THREE.MeshBasicMaterial({
            color: new THREE.Color(VIEWPORT_COLORS.selection),
            side: THREE.BackSide,
            transparent: true,
            opacity: 0.95,
        }),
    )
    outline.name = `${component.type}_${component.id}_outline`
    outline.scale.setScalar(1.03)
    outline.visible = false
    outline.userData.isHelper = true

    const group = new THREE.Group()
    group.name = component.id
    group.add(mesh)
    group.add(outline)

    group.position.set(...component.transform.position)
    group.rotation.set(...component.transform.rotation)
    group.scale.set(...component.transform.scale)

    return {id: component.id, group, mesh, outline, material, signature}
}

export function createComponentRenderer(): ComponentRenderer {
    const group = new THREE.Group()
    group.name = 'components'

    const rendered = new Map<string, RenderedComponent>()

    const disposeComponent = (component: RenderedComponent) => {
        component.mesh.geometry.dispose()
        component.material.dispose()
        component.group.removeFromParent()
    }

    return {
        group,

        sync(scene, style) {
            const asset = scene.assets[0]

            if (!asset) {
                for (const component of rendered.values()) {
                    disposeComponent(component)
                }
                rendered.clear()
                return
            }

            const seen = new Set<string>()

            for (const component of asset.components) {
                seen.add(component.id)

                const signature = signatureOf(component, style.id)
                const existing = rendered.get(component.id)

                if (existing && existing.signature === signature) {
                    continue
                }

                if (existing) {
                    disposeComponent(existing)
                    rendered.delete(component.id)
                }

                const created = buildComponent(component, style, signature)

                if (created) {
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
