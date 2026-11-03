/**
 * Pure operations on the scene graph.
 *
 * Every operation returns a new scene and never mutates its input, so undo
 * can hold on to before and after states without copying meshes.
 */

import {applyPartAction, isPaintedPart, type PartAction} from '../../assets/trees/painted'
import {getStyleProfile} from '../../assets/style/style-profiles'
import type {SceneComponent} from '../../assets/shared/component-types'
import type {StyleProfile} from '../../assets/style/style-profiles'
import {resampleSpine, reshapesSpine, spineKindOf, spineLengthKey, type SpineLike} from '../../assets/shared/spines'
import {buildBranchSpine} from '../../assets/trees/components/branch'
import {buildFrondSpine, type FrondArch} from '../../assets/trees/components/palm-frond'
import {buildRootSpine} from '../../assets/trees/components/root'
import {respineForBend, SPINE_POINT_COUNT, type BendAmount} from '../../assets/trees/components/trunk'
import {findPropGenerator, generatePropComponents} from '../../assets/prop-generators'
import {startOwnColours} from '../../assets/style/own-colours'
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
        const placed = previous?.moved ? movedBy(fresh, previous.moved) : fresh

        if (previous && previous.edited) {
            if (fresh.type === 'trunk') {
                return mergeShapedTrunk(placed, previous)
            }

            return {...placed, id: previous.id, parameters: previous.parameters, edited: true}
        }

        return placed
    })

    const manual = existing.filter((component) => component.slot === null)

    return [...merged, ...manual]
}

/** A fresh part, put where the user moved it. */
function movedBy(fresh: SceneComponent, moved: readonly [number, number, number]): SceneComponent {
    const [x, y, z] = fresh.transform.position

    return {...fresh, transform: {...fresh.transform, position: [x + moved[0], y + moved[1], z + moved[2]]}, moved}
}

/** A part at a new position, remembering how far that is from where its generator put it. */
function placedAt(component: SceneComponent, position: readonly [number, number, number]): SceneComponent {
    const [x, y, z] = component.transform.position
    const [mx, my, mz] = component.moved ?? [0, 0, 0]
    // Where the generator put it: where it is, less how far it had been moved.
    const moved: [number, number, number] = [position[0] - (x - mx), position[1] - (y - my), position[2] - (z - mz)]

    return {...component, transform: {...component.transform, position: [...position] as [number, number, number]}, moved}
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

        case 'palm-frond':
            // A frond has no point count of its own, so the builder's own
            // count is the one that keeps its handles steady.
            return {
                ...parameters,
                spine: buildFrondSpine(
                    parameters.arch as FrondArch,
                    numberOr(parameters.archAmount, 0.55),
                    length,
                ),
            }

        default:
            return parameters
    }
}

function findPaintedPart(
    scene: Scene,
    componentId: string,
): {asset: Scene['assets'][number]; component: SceneComponent} | null {
    for (const asset of scene.assets) {
        const component = asset.components.find((candidate) => candidate.id === componentId)

        if (component) {
            return isPaintedPart(component.generatorId) ? {asset, component} : null
        }
    }

    return null
}

/**
 * Applies an edit to a part of a painted tree.
 *
 * Its shape comes from the tree's plan, so the edit goes to the plan and the
 * tree is rebuilt: the wood re-blends and children follow their parent. Null
 * when the part is not a painted one, or the edit does not apply to it.
 */
function editPaintedPart(scene: Scene, componentId: string, action: PartAction): Scene | null {
    const found = findPaintedPart(scene, componentId)

    if (!found) {
        return null
    }

    const current = found.asset.parameters.edits
    const edits = applyPartAction(typeof current === 'string' ? current : '', found.component, action)

    // The tree's structure does not depend on the style.
    return edits === null
        ? scene
        : updateTreeParameters(scene, found.asset.id, {edits}, getStyleProfile('detailed'))
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

    const painted = editPaintedPart(scene, componentId, {kind: 'patch', patch})

    if (painted) {
        return painted
    }

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
    const source = findPaintedPart(scene, componentId)

    if (source) {
        const position = [...source.component.transform.position] as [number, number, number]
        position[index] = value

        return editPaintedPart(scene, componentId, {kind: 'move', position}) ?? scene
    }

    return {
        ...scene,
        assets: scene.assets.map((asset) =>
            mapComponent(asset, componentId, (component) => {
                const position = [...component.transform.position] as [number, number, number]
                position[index] = value

                return placedAt(component, position)
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
    if (findPaintedPart(scene, componentId)) {
        return editPaintedPart(scene, componentId, {kind: 'move', position}) ?? scene
    }

    return {
        ...scene,
        assets: scene.assets.map((asset) =>
            mapComponent(asset, componentId, (component) => placedAt(component, position)),
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

            const specs = findPropGenerator(asset.generatorId)?.parameters ?? []
            const parameters = {...asset.parameters, ...startOwnColours(specs, asset.parameters, patch), ...patch}
            const generated = generatePropComponents(
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

            const generated = generatePropComponents(
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
    if (findPaintedPart(scene, componentId)) {
        return editPaintedPart(scene, componentId, {kind: 'remove'}) ?? scene
    }

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
    // Its shape comes from the tree's plan, so there is nothing to copy.
    if (findPaintedPart(scene, componentId)) {
        return scene
    }

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
    if (findPaintedPart(scene, componentId)) {
        return editPaintedPart(scene, componentId, {kind: 'restore'}) ?? scene
    }

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
