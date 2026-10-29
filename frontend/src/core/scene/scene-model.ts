/**
 * The editable scene graph.
 *
 * This is the source of truth for the user's work. Three.js objects are a
 * projection of it, rebuilt on demand. Everything here is serializable and
 * free of any UI dependency.
 */

import type {StyleProfile} from '../../assets/style/style-profiles'

export type ComponentType =
    | 'trunk'
    | 'branch'
    | 'root'
    | 'foliage-cluster'
    | 'palm-frond'
    | 'palm-crown'
    | 'coconut-cluster'

export interface Transform {
    readonly position: readonly [number, number, number]
    readonly rotation: readonly [number, number, number]
    readonly scale: readonly [number, number, number]
}

export interface SceneComponent {
    readonly id: string
    readonly type: ComponentType
    readonly generatorId: string
    readonly generatorVersion: number
    /** Attachment target. `null` means it is a root of its asset. */
    readonly parentId: string | null
    readonly transform: Transform
    /** Generator parameters. Shape depends on `generatorId`. */
    readonly parameters: Readonly<Record<string, unknown>>
    /** Per-component overrides of the asset's style profile. */
    readonly styleOverrides: Readonly<Partial<StyleProfile>> | null
    /** Deterministic variation seed for this component. */
    readonly seed: number
}

export interface SceneAsset {
    readonly id: string
    readonly kind: 'tree'
    readonly generatorId: string
    readonly generatorVersion: number
    /** Flat list. `parentId` expresses hierarchy. */
    readonly components: readonly SceneComponent[]
    readonly seed: number
}

export interface Scene {
    readonly id: string
    readonly assets: readonly SceneAsset[]
}

export const IDENTITY_TRANSFORM: Transform = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
}

export function createEmptyScene(id = 'scene-1'): Scene {
    return {id, assets: []}
}

/** Returns the component with the given id, or `undefined`. */
export function findComponent(scene: Scene, componentId: string): SceneComponent | undefined {
    for (const asset of scene.assets) {
        const found = asset.components.find((component) => component.id === componentId)
        if (found) {
            return found
        }
    }

    return undefined
}

/** Returns the asset that owns the given component, or `undefined`. */
export function findAssetOf(scene: Scene, componentId: string): SceneAsset | undefined {
    return scene.assets.find((asset) => asset.components.some((c) => c.id === componentId))
}

/** Returns the components attached directly to the given component. */
export function childComponents(asset: SceneAsset, componentId: string): SceneComponent[] {
    return asset.components.filter((component) => component.parentId === componentId)
}

/**
 * The plain-language name of a component type.
 *
 * This is the binding terminology mapping from the product spec: the user
 * sees "Leaf clump", never "foliage cluster".
 */
const TYPE_LABELS: Readonly<Record<ComponentType, string>> = {
    trunk: 'Trunk',
    branch: 'Branch',
    root: 'Root',
    'foliage-cluster': 'Leaf clump',
    'palm-frond': 'Palm frond',
    'palm-crown': 'Palm crown',
    'coconut-cluster': 'Coconut cluster',
}

export function describeComponent(component: SceneComponent): string {
    return TYPE_LABELS[component.type]
}
