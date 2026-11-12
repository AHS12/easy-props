/**
 * The end grain on a saw cut: growth rings round a dark pith, and a few drying
 * cracks running in from the bark.
 *
 * Nearly white, so it multiplies the cut's own colour, and snow or wet on the cut
 * still shows. It doesn't tile: the middle of the picture is the middle of the
 * wood, and its edge is the oldest ring. The relief comes from the same heights, so
 * each dark ring is also a little groove for light to catch.
 */

import * as THREE from 'three'
import {createSeededRandom, randomRange} from './random'

/** The picture's size in the app. An export can ask for it larger: the same rings, sharper. */
const PICTURE_SIZE = 512
const TEXTURE_SEED = 66173
/** How many rings run from the pith to the picture's edge. */
export const END_GRAIN_RINGS = 24
const RING_DARK = 0.32
/** How much of each ring is its dark late wood. */
const LATE_SHARE = 0.22
const PITH_RADIUS = 0.018
const CHECKS = 5
const CHECK_DARK = 0.55
const WOBBLE = 0.025
const RELIEF_STEEPNESS = 1.4

interface Grain {
    readonly darkness: Float32Array
    readonly heights: Float32Array
}

const grains = new Map<number, Grain>()
const textures = new Map<number, THREE.DataTexture>()
const reliefs = new Map<number, THREE.DataTexture>()

/** Drawn from where each pixel falls in the picture, so any size has the same rings. */
function makeGrain(size: number): Grain {
    const random = createSeededRandom(TEXTURE_SEED)
    const darkness = new Float32Array(size * size)
    const heights = new Float32Array(size * size)
    // Rings are never quite round: each wobbles a little, the same way all round the wood.
    const waves = Array.from({length: 4}, (_, index) => ({k: index + 2, phase: random() * Math.PI * 2, size: WOBBLE * random()}))
    // Rings are not evenly spaced: some years grow more.
    const widths = Array.from({length: END_GRAIN_RINGS}, () => randomRange(random, 0.7, 1.3))
    const total = widths.reduce((sum, width) => sum + width, 0)
    const edges: number[] = []
    let run = 0

    for (const width of widths) {
        run += width / total
        edges.push(run)
    }

    const ringAt = (r: number): number => {
        // Where in its ring a radius falls, 0 at the ring's inside to 1 at its outside.
        let inside = 0

        for (const edge of edges) {
            if (r <= edge) {
                return (r - inside) / Math.max(edge - inside, 1e-6)
            }

            inside = edge
        }

        return 1
    }

    const checks = Array.from({length: CHECKS}, () => ({
        angle: random() * Math.PI * 2,
        reach: randomRange(random, 0.25, 0.7),
        width: randomRange(random, 0.004, 0.01),
    }))

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (x + 0.5) / size - 0.5
            const dy = (y + 0.5) / size - 0.5
            const angle = Math.atan2(dy, dx)
            const wobble = waves.reduce((sum, wave) => sum + wave.size * Math.sin(wave.k * angle + wave.phase), 0)
            // 0 at the pith, 1 at the picture's edge.
            const r = Math.min(Math.hypot(dx, dy) * 2 * (1 + wobble), 1)
            const t = ringAt(r)
            // Late wood: a sharp darker band at the outside of each ring, early wood fading into it.
            const late = t > 1 - LATE_SHARE ? 1 : Math.max(0, (t - (1 - LATE_SHARE * 2.5)) / (LATE_SHARE * 1.5)) ** 2 * 0.5
            let dark = late * RING_DARK
            let height = -late * 0.6

            if (r < PITH_RADIUS * 2) {
                dark = Math.max(dark, 0.45 * (1 - r / (PITH_RADIUS * 2)))
            }

            // Drying cracks run in from the bark, widest there.
            for (const check of checks) {
                const off = Math.abs(Math.sin(angle - check.angle)) * r
                const ahead = Math.cos(angle - check.angle) > 0
                const from = 1 - check.reach

                if (ahead && r > from) {
                    const width = check.width * ((r - from) / check.reach)

                    if (off < width) {
                        dark = Math.max(dark, CHECK_DARK)
                        height -= 1.5
                    }
                }
            }

            const index = y * size + x

            darkness[index] = dark
            heights[index] = height
        }
    }

    return {darkness, heights}
}

function grainOf(size: number): Grain {
    let made = grains.get(size)

    if (!made) {
        made = makeGrain(size)
        grains.set(size, made)
    }

    return made
}

function configured(made: THREE.DataTexture): THREE.DataTexture {
    // The edge is the oldest ring, which carries on past it rather than starting again.
    made.wrapS = THREE.ClampToEdgeWrapping
    made.wrapT = THREE.ClampToEdgeWrapping
    made.magFilter = THREE.LinearFilter
    made.minFilter = THREE.LinearMipmapLinearFilter
    made.generateMipmaps = true
    made.anisotropy = 4
    made.needsUpdate = true

    return made
}

export function getEndGrainTexture(size = PICTURE_SIZE): THREE.DataTexture {
    const cached = textures.get(size)

    if (cached) {
        return cached
    }

    const {darkness} = grainOf(size)
    const data = new Uint8Array(size * size * 4).fill(255)

    for (let index = 0; index < darkness.length; index++) {
        const value = Math.round(255 * (1 - darkness[index]))

        data[index * 4] = value
        data[index * 4 + 1] = value
        data[index * 4 + 2] = value
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)

    texture.colorSpace = THREE.SRGBColorSpace
    texture.name = 'end_grain'
    texture.userData.atSize = (larger: number) => getEndGrainTexture(larger)
    textures.set(size, texture)

    return configured(texture)
}

export function getEndGrainRelief(size = PICTURE_SIZE): THREE.DataTexture {
    const cached = reliefs.get(size)

    if (cached) {
        return cached
    }

    const {heights} = grainOf(size)
    const data = new Uint8Array(size * size * 4).fill(255)
    const at = (x: number, y: number) => heights[Math.min(Math.max(y, 0), size - 1) * size + Math.min(Math.max(x, 0), size - 1)]
    const steepness = RELIEF_STEEPNESS * (size / PICTURE_SIZE)

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (at(x - 1, y) - at(x + 1, y)) * steepness
            const dy = (at(x, y - 1) - at(x, y + 1)) * steepness
            const scale = 1 / Math.hypot(dx, dy, 1)
            const pixel = (y * size + x) * 4

            data[pixel] = Math.round((dx * scale * 0.5 + 0.5) * 255)
            data[pixel + 1] = Math.round((dy * scale * 0.5 + 0.5) * 255)
            data[pixel + 2] = Math.round((scale * 0.5 + 0.5) * 255)
        }
    }

    const relief = configured(new THREE.DataTexture(data, size, size, THREE.RGBAFormat))

    relief.userData.atSize = (larger: number) => getEndGrainRelief(larger)
    reliefs.set(size, relief)

    return relief
}
