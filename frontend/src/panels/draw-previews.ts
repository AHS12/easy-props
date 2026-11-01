/**
 * Draws every preset's picture and saves it into the project. A developer's tool, run
 * by `make previews`: it needs a real browser for its graphics, and the dev server for
 * somewhere to save.
 */

import {treePresets} from '../assets/trees/presets'
import {drawPresetPicture} from './preset-thumbnails'
import {presetFingerprint} from './preset-fingerprint'

const status = document.getElementById('status')!

async function drawAll() {
    const manifest: Record<string, string> = {}

    for (const [index, preset] of treePresets.entries()) {
        status.textContent = `Drawing ${index + 1} of ${treePresets.length}: ${preset.name}`

        const url = await drawPresetPicture(preset.id)

        if (!url) {
            throw new Error(`${preset.id} did not draw.`)
        }

        const picture = await (await fetch(url)).blob()

        await fetch(`/__preset-thumbs/${preset.id}`, {method: 'POST', body: picture})
        manifest[preset.id] = presetFingerprint(preset.id)
    }

    await fetch('/__preset-thumbs/manifest', {method: 'POST', body: `${JSON.stringify(manifest, null, 4)}\n`})
    status.textContent = `Done: ${treePresets.length} pictures saved.`
    status.dataset.done = 'true'
}

drawAll().catch((error: unknown) => {
    status.textContent = `Stopped: ${String(error)}`
})
