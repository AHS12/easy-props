/**
 * Real renders of the preset trees, for their cards.
 *
 * With this many presets a silhouette cannot tell one from the next. Building a
 * tree takes a moment, so only cards on screen ask, one tree is drawn at a time
 * while the app is idle, and a finished picture is kept for next time.
 */

import {getStyleProfile} from '../assets/style/style-profiles'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {renderTreeThumbnail} from '../core/export/tree-thumbnail'

/** Bump when trees change, so stale pictures are drawn again. */
const STORAGE_VERSION = 7
const SIZE = 180

const pictures = new Map<string, string>()
const queue: {presetId: string; done: (url: string) => void}[] = []
let drawing = false

const storageKey = (presetId: string) => `easy-props.preset-thumb.${STORAGE_VERSION}.${presetId}`

function remembered(presetId: string): string | undefined {
    const known = pictures.get(presetId)

    if (known) {
        return known
    }

    try {
        const stored = localStorage.getItem(storageKey(presetId))

        if (stored) {
            pictures.set(presetId, stored)
            return stored
        }
    } catch {
        // Storage can be unavailable. The picture is simply drawn again.
    }

    return undefined
}

function whenIdle(work: () => void) {
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(work, {timeout: 1500})
    } else {
        setTimeout(work, 60)
    }
}

function drawNext() {
    const next = queue.shift()

    if (!next) {
        drawing = false
        return
    }

    drawing = true

    whenIdle(async () => {
        const url = await renderTreeThumbnail(createSceneFromPreset(next.presetId), {
            style: getStyleProfile('detailed'),
            size: SIZE,
        })

        if (url) {
            pictures.set(next.presetId, url)

            try {
                localStorage.setItem(storageKey(next.presetId), url)
            } catch {
                // Out of room. It stays for this session.
            }

            next.done(url)
        }

        drawNext()
    })
}

/** The picture if it already exists. */
export const presetThumbnail = (presetId: string) => remembered(presetId)

/** Asks for a picture. Returns a function that withdraws the request. */
export function requestPresetThumbnail(presetId: string, done: (url: string) => void): () => void {
    const request = {presetId, done}

    queue.push(request)

    if (!drawing) {
        drawNext()
    }

    return () => {
        const at = queue.indexOf(request)

        if (at >= 0) {
            queue.splice(at, 1)
        }
    }
}

/** Forgets every picture, so they are drawn again. */
export function clearPresetThumbnails(): void {
    pictures.clear()

    try {
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith('easy-props.preset-thumb.')) {
                localStorage.removeItem(key)
            }
        }
    } catch {
        // Nothing to clear.
    }
}
