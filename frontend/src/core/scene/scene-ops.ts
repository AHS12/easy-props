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
 * The component and everything hanging off it.
 */
export function withDescendants(
    components: readonly SceneComponent[],
    componentId: string,
): SceneComponent[] {
    const collected = new Set<string>([componentId])

    let changed = true
    while (changed) {
        changed = false

        for (const component of components) {
            if (component.parentId && collected.has(component.parentId) && !collected.has(component.id)) {
                collected.add(component.id)
                changed = true
            }
        }
    }

    return components.filter((component) => collected.has(component.id))
}

/**
 * Folds a fresh set of generated parts into the ones already in the scene.
 *
 * A part the user has shaped keeps its shape and takes only its new
 * position, so changing the tree's height does not undo a hand-shaped
 * branch. A part the user added by hand is never touched at all.
 */
export function mergeGenerated(
    existing: readonly SceneComponent[],
    generated: readonly SceneComponent[],
): SceneComponent[] {
    const bySlot = new Map<string, SceneComponent>()

    for (const component of existing) {
        if (component.slot !== null) {
            bySlot.set(component.slot, component)
        }
    }

    const merged = generated.map((fresh) => {
        const previous = fresh.slot === null ? undefined : bySlot.get(fresh.slot)

        if (previous && previous.edited) {
            return {...fresh, id: previous.id, parameters: previous.parameters, edited: true}
        }

        return fresh
    })

    const manual = existing.filter((component) => component.slot === null)

    return [...merged, ...manual]
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
                edited: true,
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
 * controls.
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
            const generated = generateTreeComponents(
                asset.generatorId,
                parameters,
                asset.seed,
                style,
            )

            return {...asset, parameters, components: mergeGenerated(asset.components, generated)}
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
            const generated = generateTreeComponents(
                asset.generatorId,
                parameters,
                asset.seed,
                style,
            )

            return {...asset, parameters, components: mergeGenerated(asset.components, generated)}
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

            const generated = generateTreeComponents(
                asset.generatorId,
                asset.parameters,
                seed,
                style,
            )

            return {
                ...asset,
                seed,
                components: mergeGenerated(asset.components, generated),
            }
        }),
    }
}

/**
 * Adds a part the user picked from the library.
 *
 * A part added by hand has no slot, so a rebuild leaves it alone.
 */
export function addComponent(
    scene: Scene,
    assetId: string,
    component: SceneComponent,
): Scene {
    return {
        ...scene,
        assets: scene.assets.map((asset) =>
            asset.id === assetId ? {...asset, components: [...asset.components, component]} : asset,
        ),
    }
}

/** Removes a part and everything hanging off it. */
export function removeComponent(scene: Scene, componentId: string): Scene {
    return {
        ...scene,
        assets: scene.assets.map((asset) => {
            const doomed = new Set(withDescendants(asset.components, componentId).map((c) => c.id))

            if (doomed.size === 0) {
                return asset
            }

            return {
                ...asset,
                components: asset.components.filter((component) => !doomed.has(component.id)),
            }
        }),
    }
}

/**
 * Copies a part and everything hanging off it.
 *
 * The copy keeps the parameters and gets a new identity, so it can be
 * shaped independently.
 */
export function copyComponent(
    scene: Scene,
    componentId: string,
    seedForId: (attempt: number) => string,
): Scene {
    return {
        ...scene,
        assets: scene.assets.map((asset) => {
            const source = asset.components.find((component) => component.id === componentId)

            if (!source) {
                return asset
            }

            const group = withDescendants(asset.components, componentId)
            const idMap = new Map<string, string>()

            for (const component of group) {
                idMap.set(component.id, seedForId(idMap.size))
            }

            const copies = group.map((component) => ({
                ...component,
                id: idMap.get(component.id)!,
                parentId: component.parentId ? (idMap.get(component.parentId) ?? component.parentId) : null,
                // A copy is the user's, not the generator's.
                slot: null,
                edited: true,
            }))

            return {...asset, components: [...asset.components, ...copies]}
        }),
    }
}

/**
 * Puts a part's parameters back to the generator's defaults.
 *
 * The part stays the user's, so a rebuild does not put the tree's version
 * back in its place.
 */
export function restoreComponentDefault(scene: Scene, componentId: string): Scene {
    return {
        ...scene,
        assets: scene.assets.map((asset) =>
            mapComponent(asset, componentId, (component) => ({
                ...component,
                parameters: {},
                edited: true,
            })),
        ),
    }
}
