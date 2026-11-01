/**
 * What a preset's shipped picture was drawn from.
 *
 * Its settings, and the version of every generator behind it: if any of those change
 * the picture is out of date, and a test says so. Nothing computed goes in, because the
 * last digit of a computed number can differ between a browser and the tests.
 */

import {findPropGenerator} from '../assets/prop-generators'
import {findPreset} from '../assets/trees/presets'
import {createSceneFromPreset} from '../core/scene/initial-scene'

/** Raise when the way pictures are drawn changes: the camera, the light, the backdrop. */
const DRAWING_VERSION = 1

export function presetFingerprint(presetId: string): string {
    const preset = findPreset(presetId)
    const parts = (createSceneFromPreset(presetId).assets[0]?.components ?? []).map(
        ({generatorId, generatorVersion}) => `${generatorId}@${generatorVersion}`,
    )
    const text = JSON.stringify([
        DRAWING_VERSION,
        preset,
        preset ? findPropGenerator(preset.generatorId)?.version : null,
        [...new Set(parts)].sort(),
    ])
    let hash = 0x811c9dc5

    for (let at = 0; at < text.length; at++) {
        hash = Math.imul(hash ^ text.charCodeAt(at), 0x01000193)
    }

    return (hash >>> 0).toString(16).padStart(8, '0')
}
