/**
 * Real renders of the preset trees, for their cards.
 *
 * With this many presets a silhouette cannot tell one from the next, and drawing one
 * freezes the page while its tree is built. So the pictures ship with the app, drawn
 * by `draw-previews.html`. Drawing here is only for a preset with no picture yet: one
 * tree at a time while the app is idle, kept for next time.
 */

import {getStyleProfile} from '../assets/style/style-profiles'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {renderTreeThumbnail} from '../core/export/tree-thumbnail'
import shipped from './preset-thumbs.json'

/** Bump when trees change, so stale pictures are drawn again. */
const STORAGE_VERSION = 10
const SIZE = 180
const STORAGE_PREFIX = 'easy-props.preset-thumb.'

const pictures = new Map<string, string>()
const queue: {presetId: string; done: (url: string) => void}[] = []
const waiting: (() => void)[] = []
let drawing = false

const storageKey = (presetId: string) => `${STORAGE_PREFIX}${STORAGE_VERSION}.${presetId}`
const isShipped = (presetId: string) => Object.hasOwn(shipped, presetId)

/** Pictures saved by older versions, or that now ship with the app, only take up room. */
export function forgetUnneededPictures(): void {
    try {
        const current = `${STORAGE_PREFIX}${STORAGE_VERSION}.`

        for (const key of Object.keys(localStorage)) {
            if (key.startsWith(STORAGE_PREFIX) && (!key.startsWith(current) || isShipped(key.slice(current.length)))) {
                localStorage.removeItem(key)
            }
        }
    } catch {
        // Nothing to tidy.
    }
}

/** Draws a preset's picture, as a data URL. Blocks the page while its tree is built. */
export function drawPresetPicture(presetId: string): Promise<string | null> {
    return renderTreeThumbnail(createSceneFromPreset(presetId), {style: getStyleProfile('detailed'), size: SIZE})
}

function remembered(presetId: string): string | undefined {
    if (isShipped(presetId)) {
        return `${import.meta.env.BASE_URL}preset-thumbs/${presetId}.png`
    }

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

        for (const release of waiting.splice(0)) {
            release()
        }

        return
    }

    drawing = true

    whenIdle(async () => {
        try {
            const url = await drawPresetPicture(next.presetId)

            if (url) {
                pictures.set(next.presetId, url)

                try {
                    localStorage.setItem(storageKey(next.presetId), url)
                } catch {
                    // Out of room. It stays for this session.
                }

                next.done(url)
            }
        } catch (error) {
            // Its card keeps its icon. One bad tree must not stop the rest, or anything waiting on them.
            console.warn(`Could not draw the preview of ${next.presetId}.`, error)
        }

        drawNext()
    })
}

/** Settles once every picture asked for so far is drawn, at once if none are waiting. */
export function presetThumbnailsDrawn(): Promise<void> {
    return drawing || queue.length > 0 ? new Promise((resolve) => waiting.push(resolve)) : Promise.resolve()
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
