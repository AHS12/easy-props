/**
 * What goes into a batch: presets and saved props, each in several seeds.
 *
 * The first variation of anything is that thing exactly as it is. The rest are
 * the same settings on a new seed, the seed derived from the variation's number,
 * so running a batch twice makes the same props.
 */

import {hashSeed} from '../../assets/shared/random'
import {getStyleProfile, type StyleProfileId} from '../../assets/style/style-profiles'
import {findPreset} from '../../assets/trees/presets'
import {generatePropComponents} from '../../assets/prop-generators'
import {parseProject} from '../project/project-document'
import {createSceneFromPreset} from '../scene/initial-scene'
import type {Scene} from '../scene/scene-model'
import {updateTreeParameters} from '../scene/scene-ops'
import type {PropVersion} from '../scene/variations'
import {inSetColours, type SetColours} from './set-colours'
import type {BatchItem} from './pipeline/batch'
import {exportNameOf} from './pipeline/types'
import {sceneExportSource} from './scene-source'

export type BatchChoice =
    | {readonly kind: 'preset'; readonly id: string}
    | {readonly kind: 'saved'; readonly id: string; readonly name: string}
    /** The open prop, once in each of these versions, as picked from Show me more. */
    | {readonly kind: 'versions'; readonly name: string; readonly scene: Scene; readonly versions: readonly PropVersion[]}

/** How many props a choice makes: a list of versions makes one each, whatever the variations. */
export const propsOf = (choice: BatchChoice, variations: number) => (choice.kind === 'versions' ? choice.versions.length : variations)

export interface BatchItemContext {
    readonly style: StyleProfileId
    readonly appVersion: string
    readInSavedProp(id: string): Promise<string>
    /** A set's colours, which every prop is built in. Left out, each keeps its own. */
    readonly colours?: SetColours
}

/**
 * The first prop a choice makes, as a scene, and its style: what a set's colours and
 * previews are worked out from. A choice of versions gives each of them.
 */
export async function choiceScenes(choice: BatchChoice, context: Omit<BatchItemContext, 'appVersion'>): Promise<{scene: Scene; style: StyleProfileId}[]> {
    if (choice.kind === 'versions') {
        return choice.versions.map((version) => ({scene: versionScene(choice.scene, version, context.style), style: context.style}))
    }

    if (choice.kind === 'preset') {
        return [{scene: createSceneFromPreset(choice.id), style: context.style}]
    }

    const project = parseProject(await context.readInSavedProp(choice.id))

    return [{scene: project.scene, style: project.style as StyleProfileId}]
}

export const MAX_VARIATIONS = 50

/** The seed of a variation. The first is the prop's own. */
export const variationSeed = (seed: number, variation: number) =>
    variation === 0 ? seed : hashSeed(seed, variation)

/** The same prop on another seed. Hand edits go with it where its parts still exist. */
export function withSeed(scene: Scene, seed: (current: number) => number, style: StyleProfileId): Scene {
    return {
        ...scene,
        assets: scene.assets.map((asset) => {
            const next = seed(asset.seed)

            return next === asset.seed
                ? asset
                : {
                      ...asset,
                      seed: next,
                      components: generatePropComponents(asset.generatorId, asset.parameters, next, getStyleProfile(style)),
                  }
        }),
    }
}

/** The prop in one version from Show me more: on its seed, damaged as it says. */
export function versionScene(scene: Scene, version: PropVersion, style: StyleProfileId): Scene {
    const asset = scene.assets[0]

    if (!version.damage || !asset) {
        return withSeed(scene, () => version.seed, style)
    }

    return updateTreeParameters(withSeed(scene, () => version.seed, style), asset.id, version.damage, getStyleProfile(style))
}

const reseeded = (scene: Scene, variation: number, style: StyleProfileId) =>
    withSeed(scene, (seed) => variationSeed(seed, variation), style)

/** Every prop of a batch, numbered per name: `oak_01`, `oak_02`, and on. */
export function batchItems(
    choices: readonly BatchChoice[],
    variations: number,
    context: BatchItemContext,
): BatchItem[] {
    const used = new Map<string, number>()
    const items: BatchItem[] = []

    for (const choice of choices) {
        const label = choice.kind === 'preset' ? (findPreset(choice.id)?.name ?? choice.id) : choice.name
        const base = exportNameOf(label)

        for (let variation = 0; variation < propsOf(choice, variations); variation++) {
            const number = (used.get(base) ?? 0) + 1

            used.set(base, number)
            items.push({
                name: `${base}_${String(number).padStart(2, '0')}`,
                async load() {
                    // In a set, every prop is built again in the set's colours.
                    const source = (scene: Scene, style: StyleProfileId) =>
                        sceneExportSource(context.colours ? inSetColours(scene, context.colours, style) : scene, getStyleProfile(style), context.appVersion)

                    if (choice.kind === 'versions') {
                        return source(versionScene(choice.scene, choice.versions[variation], context.style), context.style)
                    }

                    if (choice.kind === 'preset') {
                        return source(reseeded(createSceneFromPreset(choice.id), variation, context.style), context.style)
                    }

                    const project = parseProject(await context.readInSavedProp(choice.id))
                    const style = project.style as StyleProfileId

                    return source(reseeded(project.scene, variation, style), style)
                },
            })
        }
    }

    return items
}
