/**
 * The grain stone is printed with: fine mottling and speckle, small pits, and a few
 * hairline cracks.
 *
 * Nearly white, so it multiplies the stone's own colours and one picture serves every
 * palette, moss and snow included. Everything wraps around the edges, so it tiles.
 * The relief comes from the same heights, so a pit that shows dark is also a hollow
 * light falls into.
 */

import * as THREE from 'three'
import {createSeededRandom, randomRange} from './random'

/** The picture's size in the app. An export can ask for it larger: the same grain, sharper. */
const PICTURE_SIZE = 512
const TEXTURE_SEED = 52813

/** How many cells across each layer of mottling has, coarse to fine, and how much each adds. */
const MOTTLES: readonly (readonly [number, number])[] = [
    [4, 0.5],
    [9, 0.28],
    [22, 0.15],
    [56, 0.07],
]
const SPECKS = 2600
const PITS = 80
const CRACKS = 6
/** How dark the mottling, specks, pits and cracks make the stone at full Grain, 0 to 1. */
const MOTTLE_DARK = 0.2
const SPECK_DARK = 0.16
const PIT_DARK = 0.17
const CRACK_DARK = 0.24
const PIT_DEPTH = 1.6
const CRACK_DEPTH = 0.6
const RELIEF_STEEPNESS = 1.6

interface Grain {
    /** How dark each pixel is, 0 to 1. */
    readonly darkness: Float32Array
    readonly heights: Float32Array
}

const grains = new Map<number, Grain>()
const textures = new Map<string, THREE.DataTexture>()
const reliefs = new Map<string, THREE.DataTexture>()

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Value noise on a lattice that wraps, so it tiles: 0 to 1. */
function mottle(cells: number, random: () => number, size: number): Float32Array {
    const lattice = Array.from({length: cells * cells}, () => random())
    const out = new Float32Array(size * size)
    const step = size / cells

    for (let y = 0; y < size; y++) {
        const gy = y / step
        const y0 = Math.floor(gy)
        const ty = smooth(gy - y0)

        for (let x = 0; x < size; x++) {
            const gx = x / step
            const x0 = Math.floor(gx)
            const tx = smooth(gx - x0)
            const at = (i: number, j: number) => lattice[((j % cells) * cells) + (i % cells)]
            const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx
            const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx

            out[y * size + x] = top + (bottom - top) * ty
        }
    }

    return out
}

/**
 * The grain at a size. The random numbers are drawn in the same order at every size and
 * everything measured in pixels grows with it, so a larger picture has the same marks.
 */
function makeGrain(size: number): Grain {
    const scale = size / PICTURE_SIZE
    const wrap = (value: number) => ((value % size) + size) % size
    const indexOf = (x: number, y: number) => wrap(Math.round(y)) * size + wrap(Math.round(x))
    const random = createSeededRandom(TEXTURE_SEED)
    const darkness = new Float32Array(size * size)
    const heights = new Float32Array(size * size)

    for (const [cells, weight] of MOTTLES) {
        const layer = mottle(cells, random, size)

        for (let index = 0; index < layer.length; index++) {
            darkness[index] += (layer[index] - 0.5) * 2 * weight * MOTTLE_DARK
            heights[index] += (layer[index] - 0.5) * weight * 0.6
        }
    }

    // Specks: single grains a shade darker or lighter, as in granite.
    for (let speck = 0; speck < SPECKS; speck++) {
        const x = random() * size
        const y = random() * size
        const shade = randomRange(random, -0.6, 1) * SPECK_DARK
        const across = Math.max(1, Math.round((random() < 0.25 ? 2 : 1) * scale))

        for (let dy = 0; dy < across; dy++) {
            for (let dx = 0; dx < across; dx++) {
                darkness[indexOf(x + dx, y + dy)] += shade
            }
        }
    }

    // Pits: small round hollows, darker at the bottom.
    for (let pit = 0; pit < PITS; pit++) {
        const cx = random() * size
        const cy = random() * size
        const radius = randomRange(random, 1.5, 5.5) * scale
        const reach = Math.ceil(radius)

        for (let dy = -reach; dy <= reach; dy++) {
            for (let dx = -reach; dx <= reach; dx++) {
                const t = 1 - Math.hypot(dx, dy) / radius

                if (t > 0) {
                    const index = indexOf(cx + dx, cy + dy)
                    const deep = t * t * (3 - 2 * t)

                    darkness[index] += deep * PIT_DARK
                    heights[index] -= deep * PIT_DEPTH
                }
            }
        }
    }

    // Hairline cracks: thin wandering lines that sometimes fork.
    const crack = (x: number, y: number, heading: number, length: number, depth: number) => {
        for (let step = 0; step < length; step++) {
            heading += randomRange(random, -0.35, 0.35)

            const fade = depth * Math.min(1, (length - step) / 20)

            // One step of the walk is `scale` pixels, each marked.
            for (let sub = 0; sub < Math.max(1, Math.round(scale)); sub++) {
                x += Math.cos(heading) * (scale / Math.max(1, Math.round(scale)))
                y += Math.sin(heading) * (scale / Math.max(1, Math.round(scale)))
                darkness[indexOf(x, y)] += CRACK_DARK * fade
                heights[indexOf(x, y)] -= CRACK_DEPTH * fade
            }

            if (depth > 0.6 && random() < 0.012) {
                crack(x, y, heading + randomRange(random, -1.1, 1.1), length * 0.4, depth * 0.6)
            }
        }
    }

    for (let line = 0; line < CRACKS; line++) {
        crack(random() * size, random() * size, random() * Math.PI * 2, randomRange(random, 60, 220), randomRange(random, 0.6, 1))
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

function configured(texture: THREE.DataTexture): THREE.DataTexture {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = 4
    texture.needsUpdate = true

    return texture
}

/** Grain as a slider stop, so each stop is made once. */
const stopOf = (strength: number) => Math.round(Math.min(Math.max(strength, 0), 1) * 20) / 20

/** The stone picture at a Grain strength, 0 to 1. Nearly white, to multiply the stone's colours. */
export function getStoneTexture(strength: number, size = PICTURE_SIZE): THREE.DataTexture {
    const stop = stopOf(strength)
    const key = `${stop}:${size}`
    const cached = textures.get(key)

    if (cached) {
        return cached
    }

    const {darkness} = grainOf(size)
    const data = new Uint8Array(size * size * 4).fill(255)
    // Mottling darkens and lightens about a middle, so the stone keeps its own value overall.
    const middle = 0.06

    for (let index = 0; index < darkness.length; index++) {
        const value = Math.round(255 * Math.min(1, Math.max(0, 1 - middle * stop - darkness[index] * stop)))

        data[index * 4] = value
        data[index * 4 + 1] = value
        data[index * 4 + 2] = value
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)

    texture.colorSpace = THREE.SRGBColorSpace
    // What it shows, so files in a set that share it can share a material.
    texture.name = `stone_${Math.round(stop * 100)}`
    texture.userData.atSize = (larger: number) => getStoneTexture(strength, larger)
    configured(texture)
    textures.set(key, texture)

    return texture
}

/** The same grain as light sees it: pits and cracks are hollows, mottling a gentle rise and fall. */
export function getStoneRelief(strength: number, size = PICTURE_SIZE): THREE.DataTexture {
    const stop = stopOf(strength)
    const key = `${stop}:${size}`
    const cached = reliefs.get(key)

    if (cached) {
        return cached
    }

    const {heights} = grainOf(size)
    const data = new Uint8Array(size * size * 4).fill(255)
    const wrap = (value: number) => ((value % size) + size) % size
    const at = (x: number, y: number) => heights[wrap(y) * size + wrap(x)]
    // A height step across one pixel is that much smaller in a larger picture.
    const steepness = RELIEF_STEEPNESS * stop * (size / PICTURE_SIZE)

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

    relief.userData.atSize = (larger: number) => getStoneRelief(strength, larger)
    reliefs.set(key, relief)

    return relief
}
