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

export function createInitialScene(): Scene {
    return createSceneFromPreset(DEFAULT_PRESET_ID)
}
