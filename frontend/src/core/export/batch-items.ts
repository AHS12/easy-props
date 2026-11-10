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
                    if (choice.kind === 'versions') {
                        const style = context.style

                        return sceneExportSource(
                            versionScene(choice.scene, choice.versions[variation], style),
                            getStyleProfile(style),
                            context.appVersion,
                        )
                    }

                    if (choice.kind === 'preset') {
                        const style = context.style

                        return sceneExportSource(
                            reseeded(createSceneFromPreset(choice.id), variation, style),
                            getStyleProfile(style),
                            context.appVersion,
                        )
                    }

                    const project = parseProject(await context.readInSavedProp(choice.id))
                    const style = project.style as StyleProfileId

                    return sceneExportSource(
                        reseeded(project.scene, variation, style),
                        getStyleProfile(style),
                        context.appVersion,
                    )
                },
            })
        }
    }

    return items
}
