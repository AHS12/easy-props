/**
 * The scene starts as a tree.
 *
 * The tree is a preset, so the app never opens on an empty viewport.
 */

import {findPreset, treePresets} from '../../assets/trees/presets'
import {generatePropComponents} from '../../assets/prop-generators'
import {getStyleProfile} from '../../assets/style/style-profiles'
import {DEFAULT_MATERIALS} from '../../assets/style/materials'
import type {Scene} from './scene-model'

export const DEFAULT_PRESET_ID = treePresets[0].id

/** What a new tree starts as: the best thing the tool can make. */
export const STARTER_PRESET_ID = 'blossom-tree'

/** Builds a scene from a preset. */
export function createSceneFromPreset(presetId: string): Scene {
    const preset = findPreset(presetId) ?? treePresets[0]

    const components = generatePropComponents(
        preset.generatorId,
        preset.parameters,
        preset.seed,
        getStyleProfile('low-poly'),
    )

    return {
        id: 'scene-1',
        assets: [
            {
                id: 'asset-1',
                kind: 'tree',
                generatorId: preset.generatorId,
                generatorVersion: 1,
                components,
                seed: preset.seed,
                parameters: preset.parameters,
                materials: DEFAULT_MATERIALS,
            },
        ],
    }
}

/**
 * The preset a prop goes back to on Restore.
 *
 * The one its file names, if that still makes the same kind of prop. Files from
 * before props remembered it get the preset of the same kind whose settings are
 * closest, so a saved cherry tree finds Cherry, and a rock never turns into a tree.
 */
export function presetOfScene(scene: Scene, saved: string | null): string {
    const asset = scene.assets[0]

    if (!asset) {
        return DEFAULT_PRESET_ID
    }

    if (saved && findPreset(saved)?.generatorId === asset.generatorId) {
        return saved
    }

    const differences = (parameters: Readonly<Record<string, unknown>>) =>
        Object.keys({...parameters, ...asset.parameters}).filter(
            (key) => JSON.stringify(parameters[key]) !== JSON.stringify(asset.parameters[key]),
        ).length

    const closest = treePresets
        .filter((preset) => preset.generatorId === asset.generatorId)
        .map((preset) => ({id: preset.id, score: differences(preset.parameters) - (preset.seed === asset.seed ? 0.5 : 0)}))
        .sort((a, b) => a.score - b.score)[0]

    return closest?.id ?? DEFAULT_PRESET_ID
}

export function createInitialScene(): Scene {
    return createSceneFromPreset(DEFAULT_PRESET_ID)
}
