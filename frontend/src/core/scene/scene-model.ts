/**
 * The editable scene graph.
 *
 * This is the source of truth for the user's work. Three.js objects are a
 * projection of it, rebuilt on demand. Everything here is serializable and
 * free of any UI dependency.
 */

import type {SceneComponent, SpinePoint} from '../../assets/shared/component-types'

/** A value a tree parameter can hold. */
export type AssetParameterValue = number | string | readonly SpinePoint[]

export type AssetParameters = Readonly<Record<string, AssetParameterValue>>

/**
 * The colours the tree is painted with.
 *
 * Only two to choose from. The darker leaf tone is derived from the leaf
 * colour, so a beginner never has to match two swatches by eye.
 */
export interface SceneMaterials {
    readonly bark: string
    readonly leaves: string
}

export interface SceneAsset {
    readonly id: string
    readonly kind: 'tree'
    readonly generatorId: string
    readonly generatorVersion: number
    /** Flat list. `parentId` expresses hierarchy. */
    readonly components: readonly SceneComponent[]
    readonly seed: number
    /** The tree's own parameters, so the inspector can show tree-level controls. */
    readonly parameters: AssetParameters
    /** The colours the tree is painted with. */
    readonly materials: SceneMaterials
}

export interface Scene {
    readonly id: string
    readonly assets: readonly SceneAsset[]
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
