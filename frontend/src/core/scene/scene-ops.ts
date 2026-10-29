/**
 * Pure operations on the scene graph.
 *
 * Every operation returns a new scene and never mutates its input, so undo
 * can hold on to before and after states without copying meshes.
 */

import type {SceneComponent, SpinePoint} from '../../assets/shared/component-types'
import type {StyleProfile} from '../../assets/style/style-profiles'
import {generateTreeComponents} from '../../assets/trees/tree-generators'
import type {Scene, SceneAsset} from './scene-model'

function mapComponent(
    asset: SceneAsset,
    componentId: string,
    update: (component: SceneComponent) => SceneComponent,
): SceneAsset {
    let changed = false

    const components = asset.components.map((component) => {
        if (component.id !== componentId) {
            return component
        }

        changed = true
        return update(component)
    })

    return changed ? {...asset, components} : asset
}

/**
 * Merges a patch into a component's generator parameters.
 *
 * Unknown keys are kept, so a parameter added by a newer build is never
 * silently dropped.
 */
export function updateComponentParameters(
    scene: Scene,
    componentId: string,
    patch: Readonly<Record<string, unknown>>,
): Scene {
    return {
        ...scene,
        assets: scene.assets.map((asset) =>
            mapComponent(asset, componentId, (component) => ({
                ...component,
                parameters: {...component.parameters, ...patch},
            })),
        ),
    }
}

/** Replaces a component's transform. */
export function updateComponentTransform(
    scene: Scene,
    componentId: string,
    transform: SceneComponent['transform'],
): Scene {
    return {
        ...scene,
        assets: scene.assets.map((asset) =>
            mapComponent(asset, componentId, (component) => ({...component, transform})),
        ),
    }
}

/**
 * Changes a tree-level parameter and rebuilds the tree.
 *
 * The tree generator draws from the same seed every time, so changing one
 * parameter keeps the branch layout and only moves what the parameter
 * controls. A spine the user has dragged by hand is carried over.
 */
export function updateTreeParameters(
    scene: Scene,
    assetId: string,
    patch: Readonly<Record<string, number | string>>,
    style: StyleProfile,
): Scene {
    return {
        ...scene,
        assets: scene.assets.map((asset) => {
            if (asset.id !== assetId) {
                return asset
            }

            const parameters = {...asset.parameters, ...patch}

            const components = generateTreeComponents(
                asset.generatorId,
                parameters,
                asset.seed,
                style,
            )

            return {...asset, parameters, components}
        }),
    }
}

/**
 * Records a hand-edited trunk spine.
 *
 * The spine is stored on the tree so that changing a tree-level parameter
 * does not throw the user's edit away.
 */
export function setTrunkSpine(
    scene: Scene,
    assetId: string,
    spine: readonly SpinePoint[],
    style: StyleProfile,
): Scene {
    return {
        ...scene,
        assets: scene.assets.map((asset) => {
            if (asset.id !== assetId) {
                return asset
            }

            const parameters = {...asset.parameters, trunkSpine: spine}

            const components = generateTreeComponents(
                asset.generatorId,
                parameters,
                asset.seed,
                style,
            )

            return {...asset, parameters, components}
        }),
    }
}

/**
 * Rerolls the tree's seed.
 *
 * The structure stays the same; only the variation changes. The new seed is
 * derived from the old one, so the result is reproducible from the project
 * file.
 */
export function setAssetSeed(
    scene: Scene,
    assetId: string,
    seed: number,
    style: StyleProfile,
): Scene {
    return {
        ...scene,
        assets: scene.assets.map((asset) => {
            if (asset.id !== assetId) {
                return asset
            }

            const components = generateTreeComponents(
                asset.generatorId,
                asset.parameters,
                seed,
                style,
            )

            return {...asset, seed, components}
        }),
    }
}
