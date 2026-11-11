/**
 * Leaf shapes a tree's cards can be printed with, in place of brush dabs.
 *
 * Each style is its own generated picture, laid out as the dabs are: four
 * variants in a two by two atlas, each a loose disc of leaves with a cut-out
 * edge and a solid middle. Cards, their rounded shading, wind and detail levels
 * stay as they are; only what is printed on them changes. Fronds, fruit and
 * strands sample the solid middle of the first cell, so every style keeps one.
 */

import * as THREE from 'three'
import {createSeededRandom, randomRange} from './random'

export type PrintedLeafStyle = 'round' | 'lobed' | 'feathery' | 'needles'

const SIZE = 512
const CELLS = 2
const TEXTURE_SEED = 61733
/** The solid middle of every variant, as a share of a cell. */
const SOLID_MIDDLE = 0.14
const VARIANTS = CELLS * CELLS

/** A leaf's outline in its own space: `u` runs base (-1) to tip (1), `v` across it. */
type Outline = (u: number, v: number) => boolean

/** A plain oval leaf, a little pointed at the tip. */
const oval: Outline = (u, v) => Math.abs(v) <= Math.sqrt(Math.max(1 - u * u, 0)) * (1 - Math.max(u, 0) * 0.25)

/** Rounded lobes along each side, as an oak's. */
const lobed: Outline = (u, v) =>
    Math.abs(v) <= Math.pow(Math.max(1 - u * u, 0), 0.6) * (0.62 + 0.38 * Math.abs(Math.cos(u * Math.PI * 2.2)))

/** Pairs of small leaflets along one stalk, and one at its tip. */
const feathery: Outline = (u, v) => {
    if (Math.abs(v) < 0.05 && u < 0.9) {
        return true
    }

    for (let pair = 0; pair < 6; pair++) {
        const at = -0.75 + pair * 0.28
        const du = (u - at - Math.abs(v) * 0.25) / 0.13
        const dv = (Math.abs(v) - 0.33) / 0.3

        if (du * du + dv * dv <= 1) {
            return true
        }
    }

    const tip = (u - 0.88) / 0.14

    return tip * tip + (v / 0.22) ** 2 <= 1
}

/** One fine needle. */
const needle: Outline = (u, v) => Math.abs(v) <= 0.11 * (1 - Math.abs(u) * 0.7)

interface LeafStyleDrawing {
    readonly outline: Outline
    /** How many leaves, or tufts of needles, go in a cell. */
    readonly count: number
    /** A leaf's length in pixels, and its width against that. */
    readonly long: readonly [number, number]
    readonly wide: readonly [number, number]
    /** A darker line down the middle of each leaf. */
    readonly midrib: boolean
    /** Needles come in tufts, fanned out from one point. */
    readonly tuft?: number
}

const DRAWINGS: Readonly<Record<PrintedLeafStyle, LeafStyleDrawing>> = {
    round: {outline: oval, count: 230, long: [8, 12], wide: [0.62, 0.82], midrib: false},
    lobed: {outline: lobed, count: 95, long: [15, 23], wide: [0.5, 0.62], midrib: true},
    feathery: {outline: feathery, count: 42, long: [26, 36], wide: [0.55, 0.7], midrib: false},
    needles: {outline: needle, count: 120, long: [11, 17], wide: [1, 1], midrib: false, tuft: 9},
}

/** Where variant `cell` sits in the atlas, as `[u, v, size]`. The same cells as the dabs. */
export function leafStyleCell(cell: number): readonly [number, number, number] {
    const size = 1 / CELLS

    return [(cell % CELLS) * size, Math.floor(cell / CELLS) * size, size]
}

const cache = new Map<PrintedLeafStyle, THREE.DataTexture>()

export function getTreeLeafTexture(style: PrintedLeafStyle): THREE.DataTexture {
    const known = cache.get(style)

    if (known) {
        return known
    }

    const drawing = DRAWINGS[style]
    const data = new Uint8Array(SIZE * SIZE * 4)
    const random = createSeededRandom(TEXTURE_SEED + style.length * 97 + style.charCodeAt(0))
    const cellSize = SIZE / CELLS

    // A mid value everywhere, including under the cut-out: filtering reads the
    // transparent neighbours, and black there would edge every leaf in dark.
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 240
        data[i + 1] = 240
        data[i + 2] = 240
    }

    const put = (originX: number, originY: number, px: number, py: number, value: number) => {
        if (px < 1 || py < 1 || px >= cellSize - 1 || py >= cellSize - 1) {
            return
        }

        const at = ((originY + py) * SIZE + originX + px) * 4

        data[at] = value
        data[at + 1] = value
        data[at + 2] = value
        data[at + 3] = 255
    }

    const stamp = (originX: number, originY: number, cx: number, cy: number, long: number, wide: number, turn: number, value: number) => {
        const cos = Math.cos(turn)
        const sin = Math.sin(turn)
        const reach = Math.ceil(long)

        for (let y = -reach; y <= reach; y++) {
            for (let x = -reach; x <= reach; x++) {
                const u = (x * cos + y * sin) / long
                const v = (-x * sin + y * cos) / wide

                if (Math.abs(u) > 1 || !drawing.outline(u, v)) {
                    continue
                }

                const rib = drawing.midrib && Math.abs(v) < 0.08 && u < 0.85

                put(originX, originY, Math.round(cx + x), Math.round(cy + y), rib ? value - 32 : value)
            }
        }
    }

    for (let cell = 0; cell < VARIANTS; cell++) {
        const originX = (cell % CELLS) * cellSize
        const originY = Math.floor(cell / CELLS) * cellSize
        const middle = cellSize / 2
        const solid = cellSize * SOLID_MIDDLE

        for (let y = -Math.ceil(solid); y <= solid; y++) {
            for (let x = -Math.ceil(solid); x <= solid; x++) {
                if (x * x + y * y <= solid * solid) {
                    put(originX, originY, Math.round(middle + x), Math.round(middle + y), 228)
                }
            }
        }

        for (let leaf = 0; leaf < drawing.count; leaf++) {
            // Denser towards the middle, scattered at the edge.
            const distance = Math.pow(random(), 0.62) * middle * 0.84
            const angle = random() * Math.PI * 2
            const edge = distance / (middle * 0.84)
            const long = randomRange(random, drawing.long[0], drawing.long[1]) * (1 - edge * 0.3)
            const wide = long * randomRange(random, drawing.wide[0], drawing.wide[1])
            const value = Math.round(randomRange(random, 200, 255))
            const cx = middle + Math.cos(angle) * distance
            const cy = middle + Math.sin(angle) * distance
            // Leaves point out from the middle, loosely, as they grow out from a twig.
            const turn = angle + randomRange(random, -0.9, 0.9)

            if (drawing.tuft) {
                for (let spoke = 0; spoke < drawing.tuft; spoke++) {
                    const fan = turn + (spoke / drawing.tuft - 0.5) * 2.6 + randomRange(random, -0.12, 0.12)

                    stamp(originX, originY, cx + Math.cos(fan) * long * 0.9, cy + Math.sin(fan) * long * 0.9, long, wide, fan, value - spoke % 3 * 9)
                }
            } else {
                stamp(originX, originY, cx, cy, long, wide, turn, value)
            }
        }
    }

    const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)

    texture.name = `leaves_${style}`
    texture.colorSpace = THREE.SRGBColorSpace
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = 4
    texture.needsUpdate = true
    cache.set(style, texture)

    return texture
}
