/**
 * Pure operations on the scene graph.
 *
 * Every operation returns a new scene and never mutates its input, so undo
 * can hold on to before and after states without copying meshes.
 */

import type {SceneComponent, SurfacePush} from '../../assets/shared/component-types'
import type {StyleProfile} from '../../assets/style/style-profiles'
import {MAX_PUSHES} from '../../assets/shared/pushes'
import {resampleSpine, reshapesSpine, spineKindOf, spineLengthKey, type SpineLike} from '../../assets/shared/spines'
import {buildBranchSpine} from '../../assets/trees/components/branch'
import {buildRootSpine} from '../../assets/trees/components/root'
import {respineForBend, SPINE_POINT_COUNT, type BendAmount} from '../../assets/trees/components/trunk'
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
            if (fresh.type === 'trunk') {
                return mergeShapedTrunk(fresh, previous)
            }

            return {...fresh, id: previous.id, parameters: previous.parameters, edited: true}
        }

        return fresh
    })

    const manual = existing.filter((component) => component.slot === null)

    return [...merged, ...manual]
}

/**
 * Folds a reshaped trunk into a fresh one.
 *
 * The trunk's parameters carry the tree's shape, so keeping all of them would
 * freeze the trunk while its branches moved. Only the spine and its point
 * count are the user's; the rest keeps following the tree. Changing Bend
 * rebuilds the spine at the count the user chose, because Bend is the shape
 * control and it must not go dead after a drag.
 */
function mergeShapedTrunk(
    fresh: SceneComponent,
    previous: SceneComponent,
): SceneComponent {
    const previousSpine = previous.parameters.spine
    const count = Math.round(numberOr(previous.parameters.controlPoints, SPINE_POINT_COUNT))
    const reshaped = fresh.parameters.bend !== previous.parameters.bend

    const spine =
        reshaped || !Array.isArray(previousSpine)
            ? respineForBend(
                  fresh.parameters.bend as BendAmount,
                  numberOr(fresh.parameters.height, 4),
                  numberOr(fresh.parameters.leanAzimuth, 0),
                  numberOr(fresh.parameters.leanWobble, 0),
                  count,
              )
            : previousSpine

    return {
        ...fresh,
        id: previous.id,
        edited: true,
        parameters: {...fresh.parameters, controlPoints: count, spine},
    }
}

function numberOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Rebuilds or resamples a part's spine after a control that shapes it changes.
 *
 * Without this a dragged spine would leave Bend, Curl, and Drop dead: the
 * slider would move and the part would not.
 */
function respineAfterPatch(
    component: SceneComponent,
    parameters: Readonly<Record<string, unknown>>,
    keys: readonly string[],
): Readonly<Record<string, unknown>> {
    const kind = spineKindOf(component.type)
    const length = numberOr(parameters[spineLengthKey(component.type)], 1)
    const count = Math.round(numberOr(parameters.controlPoints, SPINE_POINT_COUNT))

    if (kind && keys.includes('controlPoints')) {
        // A loop cut keeps the shape and only changes how many handles there
        // are, so the part's own spine is resampled rather than rebuilt.
        const current = component.parameters.spine
        const points = Array.isArray(current) ? (current as SpineLike[]) : []

        return {
            ...parameters,
            spine: resampleSpine(
                points.length >= 2
                    ? points
                    : [
                          {t: 0, x: 0, y: 0, z: 0},
                          {t: 1, x: 0, y: 0, z: 0},
                      ],
                kind,
                count,
            ),
        }
    }

    switch (component.type) {
        case 'trunk':
            return {
                ...parameters,
                spine: respineForBend(
                    parameters.bend as BendAmount,
                    numberOr(parameters.height, 4),
                    numberOr(parameters.leanAzimuth, 0),
                    numberOr(parameters.leanWobble, 0),
                    count,
                ),
            }

        case 'branch':
            return {
                ...parameters,
                spine: buildBranchSpine(
                    numberOr(parameters.bend, 0),
                    numberOr(parameters.curl, 0),
                    length,
                    count,
                ),
            }

        case 'root':
            return {
                ...parameters,
                spine: buildRootSpine(
                    numberOr(parameters.drop, 0),
                    numberOr(parameters.curl, 0),
                    length,
                    count,
                ),
            }

        default:
            return parameters
    }
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
    const keys = Object.keys(patch)

    return {
        ...scene,
        assets: scene.assets.map((asset) =>
            mapComponent(asset, componentId, (component) => {
                const merged = {...component.parameters, ...patch}
                const reshapes = keys.some((key) => reshapesSpine(component.type, key))

                return {
                    ...component,
                    parameters: reshapes
                        ? respineAfterPatch(component, merged, keys)
                        : merged,
                    edited: true,
                }
            }),
        ),
    }
}

/** Moves a component along one axis, in metres. */
export function moveComponent(
    scene: Scene,
    componentId: string,
    axis: 'x' | 'y' | 'z',
    value: number,
): Scene {
    const index = {x: 0, y: 1, z: 2}[axis]

    return {
        ...scene,
        assets: scene.assets.map((asset) =>
            mapComponent(asset, componentId, (component) => {
                const position = [...component.transform.position] as [number, number, number]
                position[index] = value

                return {...component, transform: {...component.transform, position}}
            }),
        ),
    }
}

/** Moves a component to a position, in metres. */
export function setComponentPosition(
    scene: Scene,
    componentId: string,
    position: readonly [number, number, number],
): Scene {
    return {
        ...scene,
        assets: scene.assets.map((asset) =>
            mapComponent(asset, componentId, (component) => ({
                ...component,
                transform: {...component.transform, position},
            })),
        ),
    }
}

/** Replaces a component's list of surface pushes. */
export function setSurfacePushes(
    scene: Scene,
    componentId: string,
    pushes: readonly SurfacePush[],
): Scene {
    return updateComponentParameters(scene, componentId, {pushes: pushes.slice(-MAX_PUSHES)})
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
