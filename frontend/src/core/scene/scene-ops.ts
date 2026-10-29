/**
 * Pure operations on the scene graph.
 *
 * Every operation returns a new scene and never mutates its input, so undo
 * can hold on to before and after states without copying meshes.
 */

import type {Scene, SceneAsset, SceneComponent} from './scene-model'

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
