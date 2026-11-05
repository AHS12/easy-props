/**
 * A part's painted colours cut to its few main colours, for the Comic look.
 *
 * The view does this as it shows a part, and a Comic export bakes it into the
 * file, so both come out the same.
 */

import * as THREE from 'three'
import {FLAT_COLOURS} from './toon-looks'

const {sameColour: SAME_COLOUR, brightnessWeight: BRIGHTNESS_WEIGHT, lean: LEAN, maxTones: MAX_TONES, rounds: ROUNDS} = FLAT_COLOURS

/**
 * How different two tones look as colours. Brightness counts for little: a
 * dark inner leaf and a sunny outer one are the same orange, and the Comic view
 * draws light and shade itself. A flower is a different hue and stays apart.
 */
function toneDistance(a: readonly number[], b: readonly number[]): number {
    const sumA = a[0] + a[1] + a[2] + 1e-4
    const sumB = b[0] + b[1] + b[2] + 1e-4
    const hue = Math.hypot(a[0] / sumA - b[0] / sumB, a[1] / sumA - b[1] / sumB, a[2] / sumA - b[2] / sumB)

    return Math.hypot(hue, ((sumA - sumB) / 3) * BRIGHTNESS_WEIGHT)
}

/**
 * A part's painted colours, each moved to the nearest of the part's few main
 * colours.
 *
 * The main colours are found by grouping, then groups closer than
 * `FLAT_COLOURS.sameColour` are joined. A clump of leaves with grain becomes one colour,
 * while a bush keeps its flowers apart from its leaves.
 *
 * A picture of a whole prop is not joined: the blended colours where leaves
 * meet the trunk would join tone to tone until the trunk was green.
 */
export function flattenColours(colours: ArrayLike<number>, join = true): Float32Array {
    const count = Math.floor(colours.length / 3)
    const flat = new Float32Array(count * 3)

    if (count === 0) {
        return flat
    }

    // Grouped by colour, with brightness counting for little, as tones are
    // joined. Grouped by plain distance, a dark brown trunk and a dark green
    // leaf would share a group and come out olive.
    const features = new Float32Array(count * 4)
    for (let index = 0; index < count; index++) {
        const r = colours[index * 3]
        const g = colours[index * 3 + 1]
        const b = colours[index * 3 + 2]
        const sum = r + g + b + 1e-4
        features.set([r / sum, g / sum, b / sum, (sum / 3) * BRIGHTNESS_WEIGHT], index * 4)
    }

    const featureGap = (index: number, centre: ArrayLike<number>) =>
        (features[index * 4] - centre[0]) ** 2 +
        (features[index * 4 + 1] - centre[1]) ** 2 +
        (features[index * 4 + 2] - centre[2]) ** 2 +
        (features[index * 4 + 3] - centre[3]) ** 2

    // Start from the colours most unlike each other, so a few flowers among
    // many leaves still get a tone of their own.
    let centres: Float32Array[] = [features.slice(0, 4)]
    const gap = new Float32Array(count).fill(Infinity)

    while (centres.length < MAX_TONES) {
        const latest = centres[centres.length - 1]
        let farthest = -1
        let farthestGap = 1e-6

        for (let index = 0; index < count; index++) {
            gap[index] = Math.min(gap[index], featureGap(index, latest))
            if (gap[index] > farthestGap) {
                farthestGap = gap[index]
                farthest = index
            }
        }

        if (farthest < 0) {
            break
        }

        centres.push(features.slice(farthest * 4, farthest * 4 + 4))
    }

    const nearestCentre = (index: number) => {
        let best = 0
        let bestDistance = Infinity

        for (let centre = 0; centre < centres.length; centre++) {
            const d = featureGap(index, centres[centre])
            if (d < bestDistance) {
                bestDistance = d
                best = centre
            }
        }

        return best
    }

    let tones: number[][] = []

    for (let round = 0; round < ROUNDS; round++) {
        // Each group's colour, its place in the grouping, and how much of the part it covers.
        const sums = centres.map(() => new Float64Array(8))

        for (let index = 0; index < count; index++) {
            const sum = sums[nearestCentre(index)]
            for (let k = 0; k < 3; k++) {
                sum[k] += colours[index * 3 + k]
            }
            for (let k = 0; k < 4; k++) {
                sum[3 + k] += features[index * 4 + k]
            }
            sum[7] += 1
        }

        const used = sums.filter((sum) => sum[7] > 0)
        centres = used.map((sum) => Float32Array.from([sum[3], sum[4], sum[5], sum[6]], (value) => value / sum[7]))
        tones = used.map((sum) => [sum[0] / sum[7], sum[1] / sum[7], sum[2] / sum[7], sum[7]])
    }

    // Join tones that are really one colour with grain, weighted by how much of the part each covers.
    let joined = join
    while (joined && tones.length > 1) {
        joined = false

        for (let a = 0; a < tones.length && !joined; a++) {
            for (let b = a + 1; b < tones.length && !joined; b++) {
                if (toneDistance(tones[a], tones[b]) < SAME_COLOUR) {
                    const wa = tones[a][3]
                    const wb = tones[b][3]
                    const w = wa + wb
                    const sumA = tones[a][0] + tones[a][1] + tones[a][2]
                    const sumB = tones[b][0] + tones[b][1] + tones[b][2]
                    const lighter = sumA >= sumB ? tones[a] : tones[b]
                    // The darker half is shade painted in for the lit view, and the Comic
                    // view draws shade itself, so the joined tone keeps the lighter half's
                    // brightness, and leans to its colour. Stone is painted deep blue in
                    // shade and pale on top, and an even mix lifted to the top's
                    // brightness is a vivid blue that the rock never shows.
                    const mixed = [0, 1, 2].map((k) => ((tones[a][k] * wa + tones[b][k] * wb) / w) * (1 - LEAN) + lighter[k] * LEAN)
                    const lift = Math.max(sumA, sumB) / Math.max(mixed[0] + mixed[1] + mixed[2], 1e-4)
                    tones[a] = [...mixed.map((value) => Math.min(value * lift, 1)), w]
                    tones.splice(b, 1)
                    joined = true
                }
            }
        }
    }

    // Matched by colour as the joining was, not by plain distance, or a dark
    // green leaf would land on the brown of the trunk.
    const nearestColour = (index: number) => {
        const colour = [colours[index * 3], colours[index * 3 + 1], colours[index * 3 + 2]]
        let best = tones[0]
        let bestDistance = Infinity

        for (const tone of tones) {
            const d = toneDistance(colour, tone)
            if (d < bestDistance) {
                bestDistance = d
                best = tone
            }
        }

        return best
    }

    for (let index = 0; index < count; index++) {
        const tone = nearestColour(index)
        flat[index * 3] = tone[0]
        flat[index * 3 + 1] = tone[1]
        flat[index * 3 + 2] = tone[2]
    }

    return flat
}

const toLinear = (byte: number) => {
    const value = byte / 255

    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

const toByte = (linear: number) => {
    const value = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055

    return Math.round(Math.min(Math.max(value, 0), 1) * 255)
}

/**
 * A copy of a picture with each shown pixel moved to one of its few main
 * colours, found as for a part's painted colours. The cut-away pixels keep
 * theirs, so the edge of the shape blends as it did.
 */
export function flattenPicture(picture: THREE.DataTexture, cutoff: number): THREE.DataTexture {
    const {data, width, height} = picture.image as {data: Uint8Array; width: number; height: number}
    const shown: number[] = []
    const colours: number[] = []

    for (let index = 0; index < width * height; index++) {
        if (data[index * 4 + 3] >= cutoff * 255) {
            shown.push(index)
            colours.push(toLinear(data[index * 4]), toLinear(data[index * 4 + 1]), toLinear(data[index * 4 + 2]))
        }
    }

    const flat = flattenColours(colours, false)
    const pixels = new Uint8Array(data)

    shown.forEach((index, at) => {
        pixels[index * 4] = toByte(flat[at * 3])
        pixels[index * 4 + 1] = toByte(flat[at * 3 + 1])
        pixels[index * 4 + 2] = toByte(flat[at * 3 + 2])
    })

    const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat)
    texture.colorSpace = picture.colorSpace
    texture.wrapS = picture.wrapS
    texture.wrapT = picture.wrapT
    texture.magFilter = picture.magFilter
    texture.minFilter = picture.minFilter
    texture.generateMipmaps = picture.generateMipmaps
    texture.flipY = picture.flipY
    texture.needsUpdate = true

    return texture
}
