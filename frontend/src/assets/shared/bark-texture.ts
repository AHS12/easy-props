/**
 * The brush strokes wood is printed with.
 *
 * Generated, like the leaf dabs, and with the same hard edges, so wood and leaves
 * read as one painting. It is nearly white and multiplies the wood's own colour,
 * and every stroke wraps around the edges, so it tiles.
 *
 * Strength only pushes each stroke further from white. The strokes stay where they
 * are and keep their edges, so a weak print is as crisp as a strong one.
 */

import * as THREE from 'three'
import {createSeededRandom, randomRange} from './random'

/** The picture's size in the app. An export can ask for it larger: the same strokes, sharper. */
export const PICTURE_SIZE = 512
const BASE = 236
const STROKES = 700
const DARKEST = 205
const LIGHTEST = 255
const TEXTURE_SEED = 40417

/** How steep the relief is, in height per pixel. */
const RELIEF_STEEPNESS = 2.2
const RELIEF_SOFTENING = 2
/** How high a stroke's rounding may rise, so a broad one stays a plate and not a dome. */
const MAX_DOME = 1.2
const PLATE_CELLS_ACROSS = 9
const PLATE_CELLS_DOWN = 6
const PLATE_CRACK = 7

export type BarkPrint = 'none' | 'ringed' | 'plated' | 'banded' | 'peeling' | 'fibrous'

interface StrokeRecipe {
    readonly count: number
    readonly values: readonly [number, number]
    readonly long: readonly [number, number]
    readonly wide: readonly [number, number]
    /** The way the strokes run, and how far each may stray from it, in radians. */
    readonly turn: number
    readonly stray: number
}

const UPRIGHT = Math.PI / 2

/** How each pattern is brushed. Plates are cracked rather than brushed, so are not here. */
const RECIPES: Readonly<Record<Exclude<BarkPrint, 'plated'>, StrokeRecipe>> = {
    none: {count: STROKES, values: [DARKEST, LIGHTEST], long: [28, 80], wide: [6, 15], turn: UPRIGHT, stray: 0.28},
    ringed: {count: 900, values: [DARKEST, LIGHTEST], long: [40, 110], wide: [3, 7], turn: 0, stray: 0.08},
    banded: {count: 120, values: [150, 200], long: [15, 55], wide: [2, 5], turn: 0, stray: 0.12},
    peeling: {count: 260, values: [195, LIGHTEST], long: [35, 95], wide: [9, 24], turn: 0, stray: 0.45},
    fibrous: {count: 1400, values: [DARKEST, LIGHTEST], long: [50, 140], wide: [2, 5], turn: UPRIGHT, stray: 0.1},
}

interface Strokes {
    readonly values: Uint8Array
    /** How far the wood stands up at each pixel: each stroke a raised, rounded plate. */
    readonly heights: Float32Array
}

const strokes = new Map<string, Strokes>()
/** One per pattern, slider stop and size. They are few and made when first asked for, so they are all kept. */
const textures = new Map<string, THREE.DataTexture>()
const reliefs = new Map<string, THREE.DataTexture>()

/** Plates of bark with cracks between, as cells around scattered points that wrap at the edges. */
function crackPlates(size: number): Strokes {
    // Everything measured in pixels grows with the picture, so a larger one is the same plates.
    const scale = size / PICTURE_SIZE
    const values = new Uint8Array(size * size)
    const heights = new Float32Array(size * size)
    const random = createSeededRandom(TEXTURE_SEED)
    const cellWide = size / PLATE_CELLS_ACROSS
    const cellTall = size / PLATE_CELLS_DOWN
    const plates = Array.from({length: PLATE_CELLS_ACROSS * PLATE_CELLS_DOWN}, (_, index) => ({
        x: ((index % PLATE_CELLS_ACROSS) + random()) * cellWide,
        y: (Math.floor(index / PLATE_CELLS_ACROSS) + random()) * cellTall,
        value: Math.round(randomRange(random, DARKEST, LIGHTEST)),
        level: random() * 0.7,
    }))

    for (let y = 0; y < size; y++) {
        const row = Math.floor(y / cellTall)

        for (let x = 0; x < size; x++) {
            const column = Math.floor(x / cellWide)
            let nearest = Infinity
            let second = Infinity
            let plate = plates[0]

            for (let down = -1; down <= 1; down++) {
                for (let across = -1; across <= 1; across++) {
                    const candidate =
                        plates[
                            ((row + down + PLATE_CELLS_DOWN) % PLATE_CELLS_DOWN) * PLATE_CELLS_ACROSS +
                                ((column + across + PLATE_CELLS_ACROSS) % PLATE_CELLS_ACROSS)
                        ]
                    const dx = Math.abs(candidate.x - x)
                    const dy = Math.abs(candidate.y - y)
                    // Stretched upright, the way plates of bark grow.
                    const distance = Math.hypot(Math.min(dx, size - dx), Math.min(dy, size - dy) * 0.6)

                    if (distance < nearest) {
                        second = nearest
                        nearest = distance
                        plate = candidate
                    } else if (distance < second) {
                        second = distance
                    }
                }
            }

            const inCrack = second - nearest < PLATE_CRACK * scale

            values[y * size + x] = inCrack ? 198 : plate.value
            heights[y * size + x] = inCrack ? -0.6 : plate.level + Math.min(1, (second - nearest) / (40 * scale)) * MAX_DOME
        }
    }

    return {values, heights}
}

function brushStrokes(recipe: StrokeRecipe, size: number): Strokes {
    const scale = size / PICTURE_SIZE
    const values = new Uint8Array(size * size).fill(BASE)
    const heights = new Float32Array(size * size)
    const random = createSeededRandom(TEXTURE_SEED)

    const stroke = (value: number, longAt512: number, wideAt512: number) => {
        const long = longAt512 * scale
        const wide = wideAt512 * scale
        const level = random() * 0.7
        const cx = random() * size
        const cy = random() * size
        const turn = recipe.turn + randomRange(random, -recipe.stray, recipe.stray)
        const cos = Math.cos(turn)
        const sin = Math.sin(turn)
        const reach = Math.ceil(long)

        for (let y = -reach; y <= reach; y++) {
            for (let x = -reach; x <= reach; x++) {
                const u = (x * cos + y * sin) / long
                const v = (-x * sin + y * cos) / wide

                if (u * u + v * v <= 1) {
                    const px = (Math.round(cx + x) + size) % size
                    const py = (Math.round(cy + y) + size) % size

                    values[py * size + px] = value
                    heights[py * size + px] = level + Math.sqrt(1 - u * u - v * v) * Math.min(wideAt512 * 0.12, MAX_DOME)
                }
            }
        }
    }

    // Every stroke is near the next in value and most overlap, so grain builds up
    // the way a leaf clump's does, and no single mark stands out as a spot.
    for (let index = 0; index < recipe.count; index++) {
        stroke(
            Math.round(randomRange(random, ...recipe.values)),
            randomRange(random, ...recipe.long),
            randomRange(random, ...recipe.wide),
        )
    }

    return {values, heights}
}

function strokesOf(print: BarkPrint, size: number): Strokes {
    const key = `${print}:${size}`
    let made = strokes.get(key)

    if (!made) {
        made = print === 'plated' ? crackPlates(size) : brushStrokes(RECIPES[print], size)
        strokes.set(key, made)
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

/**
 * Rounds off a stroke's cliff by a pixel or two. Left sharp, its edge is a staircase of
 * whole pixels, and light picks out every step as a row of dots.
 */
function softened(heights: Float32Array, size: number): Float32Array {
    let from = heights

    for (let pass = 0; pass < Math.round(RELIEF_SOFTENING * (size / PICTURE_SIZE)); pass++) {
        const to = new Float32Array(from.length)

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let sum = 0

                for (let down = -1; down <= 1; down++) {
                    for (let across = -1; across <= 1; across++) {
                        sum += from[((y + down + size) % size) * size + (x + across + size) % size]
                    }
                }

                to[y * size + x] = sum / 9
            }
        }

        from = to
    }

    return from
}

/**
 * The same strokes as light sees them: where one plate ends on another there is a
 * small cliff, so the edges catch the sun whatever the colour strength is.
 */
export function getBarkRelief(print: BarkPrint = 'none', size = PICTURE_SIZE): THREE.DataTexture {
    const key = `${print}:${size}`
    const cached = reliefs.get(key)

    if (cached) {
        return cached
    }

    // A height step across one pixel is that much smaller in a larger picture, so it's steeper per pixel.
    const steepness = RELIEF_STEEPNESS * (size / PICTURE_SIZE)
    const heights = softened(strokesOf(print, size).heights, size)
    const data = new Uint8Array(size * size * 4).fill(255)
    const at = (x: number, y: number) => heights[((y + size) % size) * size + (x + size) % size]

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

    relief.userData.atSize = (larger: number) => getBarkRelief(print, larger)
    reliefs.set(key, relief)

    return relief
}

export function getBarkTexture(strength = 1, print: BarkPrint = 'none', size = PICTURE_SIZE): THREE.DataTexture {
    const key = `${print}:${strength}:${size}`
    const cached = textures.get(key)

    if (cached) {
        return cached
    }

    const {values} = strokesOf(print, size)
    const data = new Uint8Array(size * size * 4).fill(255)

    for (let index = 0; index < values.length; index++) {
        const value = Math.max(0, Math.round(255 - (255 - values[index]) * strength))

        data[index * 4] = value
        data[index * 4 + 1] = value
        data[index * 4 + 2] = value
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)

    texture.colorSpace = THREE.SRGBColorSpace
    // What it shows, so files in a set that share it can share a material.
    texture.name = `bark_${print}_${Math.round(strength * 100)}`
    texture.userData.atSize = (larger: number) => getBarkTexture(strength, print, larger)
    configured(texture)
    textures.set(key, texture)

    return texture
}
