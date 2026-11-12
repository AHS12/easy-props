/**
 * The leaves a bush's cards are printed with, and its one kind of bloom.
 *
 * Generated like the brush dabs in `dab-texture.ts`, with less contrast and finer
 * marks, so a bush reads as a soft volume first and as leaves second. The first
 * three cells are leaves of the bush's style; the fourth is one bloom, so flowers
 * on a bush share the leaves' material. Pointed leaves with a five-petal bloom are
 * drawn exactly as they always were, so a bush from before the choice is unchanged.
 */

import * as THREE from 'three'
import {createSeededRandom, randomRange} from './random'

/** Pointed is today's leaf; the rest are for box, laurel, holly, juniper and rhododendron. */
export type BushLeafStyle = 'pointed' | 'tiny' | 'narrow' | 'spiky' | 'scales' | 'glossy'
export type BloomKind = 'five' | 'bell' | 'ball' | 'star' | 'berries'

const SIZE = 512
const CELLS = 2
const TEXTURE_SEED = 40417

export const LEAF_VARIANTS = CELLS * CELLS - 1
export const BLOOM_CELL = LEAF_VARIANTS
const BLOOM_PETALS = 5
const BLOOM_MIDDLE: readonly [number, number, number] = [250, 196, 60]

/** Leaves whose surface shines, as a laurel's, holly's or rhododendron's do. */
export const GLOSSY_BUSH_LEAVES: ReadonlySet<BushLeafStyle> = new Set(['narrow', 'spiky', 'glossy'])

/** A leaf's outline in its own space: `u` runs along it from -1 to 1, `v` across it. */
type Outline = (u: number, v: number) => boolean

/** Two curves that meet at both ends: today's leaf. */
const lens: Outline = (u, v) => Math.abs(v) <= 1 - u * u
const oval: Outline = (u, v) => u * u + v * v <= 1
/** A broad oval coming to a point at its tip. */
const pointedOval: Outline = (u, v) => Math.abs(v) <= Math.sqrt(Math.max(1 - u * u, 0)) * (1 - Math.max(u, 0) * 0.35)
/** A wavy edge of sharp spines, as on holly. */
const spiny: Outline = (u, v) => {
    const wave = Math.abs(((u * 2.2 + 10) % 1) - 0.5) * 2

    return Math.abs(v) <= Math.pow(Math.max(1 - u * u, 0), 0.7) * (0.62 + 0.38 * wave)
}
/** A small scale, round at its foot and pointed at its tip. */
const scale: Outline = (u, v) => Math.abs(v) <= Math.sqrt(Math.max((1 - u) * (1 + u), 0)) * (0.55 - u * 0.4)

interface LeafDrawing {
    readonly outline: Outline
    readonly count: number
    readonly long: readonly [number, number]
    readonly wide: readonly [number, number]
    /** Which way the leaves point, and how loosely. */
    readonly turn: number
    readonly turnSpread: number
    /** A darker line down the middle. */
    readonly midrib?: boolean
    /** A lighter half, for a shine. */
    readonly shine?: boolean
    /** Leaves come in sprigs of this many, end to end. */
    readonly sprig?: number
}

const DRAWINGS: Readonly<Record<BushLeafStyle, LeafDrawing>> = {
    pointed: {outline: lens, count: 64, long: [15, 25], wide: [0.38, 0.52], turn: Math.PI / 2, turnSpread: 0.8},
    tiny: {outline: oval, count: 230, long: [6, 9], wide: [0.62, 0.82], turn: 0, turnSpread: Math.PI},
    narrow: {outline: lens, count: 44, long: [28, 38], wide: [0.15, 0.2], turn: Math.PI / 2, turnSpread: 0.6, midrib: true, shine: true},
    spiky: {outline: spiny, count: 40, long: [18, 26], wide: [0.5, 0.6], turn: Math.PI / 2, turnSpread: 1.2, midrib: true, shine: true},
    scales: {outline: scale, count: 70, long: [6, 8], wide: [1, 1.2], turn: Math.PI / 2, turnSpread: 0.9, sprig: 8},
    glossy: {outline: pointedOval, count: 24, long: [30, 40], wide: [0.42, 0.5], turn: Math.PI / 2, turnSpread: 1.1, midrib: true, shine: true},
}

/** Where variant `cell` sits in the atlas, as `[u, v, size]`. */
export function leafCell(cell: number): readonly [number, number, number] {
    const size = 1 / CELLS

    return [(cell % CELLS) * size, Math.floor(cell / CELLS) * size, size]
}

const cache = new Map<string, THREE.DataTexture>()

export function getLeafTexture(style: BushLeafStyle = 'pointed', bloom: BloomKind = 'five'): THREE.DataTexture {
    const key = `${style}/${bloom}`
    const known = cache.get(key)

    if (known) {
        return known
    }

    const data = new Uint8Array(SIZE * SIZE * 4)
    const random = createSeededRandom(TEXTURE_SEED)
    const cellSize = SIZE / CELLS
    const drawing = DRAWINGS[style]

    // A mid value everywhere, including under the cut-out, so filtering never
    // edges a leaf in black.
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 235
        data[i + 1] = 235
        data[i + 2] = 235
    }

    const put = (originX: number, originY: number, px: number, py: number, value: number) => {
        if (px < 1 || py < 1 || px >= cellSize - 1 || py >= cellSize - 1) {
            return
        }

        const at = ((originY + py) * SIZE + originX + px) * 4
        const clamped = Math.max(0, Math.min(255, Math.round(value)))

        data[at] = clamped
        data[at + 1] = clamped
        data[at + 2] = clamped
        data[at + 3] = 255
    }

    /** One leaf of `outline`, at `cx, cy`, `long` from middle to tip. */
    const stamp = (
        originX: number,
        originY: number,
        cx: number,
        cy: number,
        long: number,
        wide: number,
        turn: number,
        value: number,
        outline: Outline = lens,
        midrib = false,
        shine = false,
    ) => {
        const cos = Math.cos(turn)
        const sin = Math.sin(turn)
        const reach = Math.ceil(long)

        for (let y = -reach; y <= reach; y++) {
            for (let x = -reach; x <= reach; x++) {
                const u = (x * cos + y * sin) / long
                const v = (-x * sin + y * cos) / wide

                if (Math.abs(u) > 1 || !outline(u, v)) {
                    continue
                }

                const rib = midrib && Math.abs(v) < 0.09 && u < 0.85 ? -34 : 0
                const gleam = shine && v > 0.15 ? 22 : 0

                put(originX, originY, Math.round(cx + x), Math.round(cy + y), value + rib + gleam)
            }
        }
    }

    const disc = (originX: number, originY: number, cx: number, cy: number, radius: number, value: (dx: number, dy: number) => number) => {
        for (let y = -Math.ceil(radius); y <= radius; y++) {
            for (let x = -Math.ceil(radius); x <= radius; x++) {
                if (x * x + y * y <= radius * radius) {
                    put(originX, originY, Math.round(cx + x), Math.round(cy + y), value(x / radius, y / radius))
                }
            }
        }
    }

    for (let cell = 0; cell < LEAF_VARIANTS; cell++) {
        const originX = (cell % CELLS) * cellSize
        const originY = Math.floor(cell / CELLS) * cellSize
        const middle = cellSize / 2

        for (let leaf = 0; leaf < drawing.count; leaf++) {
            // Denser towards the middle, scattered at the edge.
            const distance = Math.pow(random(), 0.6) * middle * 0.78
            const angle = random() * Math.PI * 2
            const long = randomRange(random, drawing.long[0], drawing.long[1])
            const cx = middle + Math.cos(angle) * distance
            const cy = middle + Math.sin(angle) * distance
            const wide = long * randomRange(random, drawing.wide[0], drawing.wide[1])
            const turn = drawing.turn + randomRange(random, -drawing.turnSpread, drawing.turnSpread)
            const value = Math.round(randomRange(random, 215, 255))

            if (drawing.sprig) {
                // A sprig of scales laid end to end, each overlapping the last.
                for (let step = 0; step < drawing.sprig; step++) {
                    const along = (step - drawing.sprig / 2) * long * 1.3

                    stamp(originX, originY, cx + Math.cos(turn) * along, cy + Math.sin(turn) * along, long, wide, turn, value - (step % 2) * 14, drawing.outline)
                }
            } else {
                stamp(originX, originY, cx, cy, long, wide, turn, value, drawing.outline, drawing.midrib, drawing.shine)
            }
        }
    }

    const bloomX = (BLOOM_CELL % CELLS) * cellSize
    const bloomY = Math.floor(BLOOM_CELL / CELLS) * cellSize
    const middle = cellSize / 2

    switch (bloom) {
        case 'bell': {
            // One bell hanging from the top of the cell, flaring to a scalloped lip.
            const height = middle * 1.5

            for (let y = 0; y <= height; y++) {
                const down = y / height
                const halfWidth = middle * (0.22 + 0.5 * Math.pow(down, 1.8))

                for (let x = -Math.ceil(halfWidth); x <= halfWidth; x++) {
                    const lip = height * (0.9 + 0.06 * Math.cos((x / halfWidth) * Math.PI * 2.5))

                    if (y <= lip) {
                        put(bloomX, bloomY, Math.round(middle + x), Math.round(middle * 0.25 + y), 205 + 50 * (1 - Math.abs(x) / halfWidth) - (down > 0.8 ? 30 : 0))
                    }
                }
            }

            break
        }
        case 'ball': {
            // A dome packed with tiny four-petalled flowers.
            const florets = createSeededRandom(TEXTURE_SEED + 7)

            // A solid dome under them, so the head has no holes.
            disc(bloomX, bloomY, middle, middle, middle * 0.62, (x, y) => 200 - Math.hypot(x, y) * 30)

            for (let floret = 0; floret < 120; floret++) {
                const reach = Math.sqrt(florets()) * middle * 0.78
                const angle = florets() * Math.PI * 2
                const cx = middle + Math.cos(angle) * reach
                const cy = middle + Math.sin(angle) * reach
                const value = 205 + florets() * 50
                const turn = florets() * Math.PI

                for (let petal = 0; petal < 4; petal++) {
                    const at = turn + (petal / 4) * Math.PI * 2

                    stamp(bloomX, bloomY, cx + Math.cos(at) * 7, cy + Math.sin(at) * 7, 8, 6, at, value, oval)
                }
            }

            break
        }
        case 'star': {
            // Five narrow pointed petals, with a small yellow eye.
            for (let petal = 0; petal < BLOOM_PETALS; petal++) {
                const turn = (petal / BLOOM_PETALS) * Math.PI * 2 - Math.PI / 2

                stamp(bloomX, bloomY, middle + Math.cos(turn) * middle * 0.46, middle + Math.sin(turn) * middle * 0.46, middle * 0.5, middle * 0.17, turn, 250)
            }

            for (let y = -11; y <= 11; y++) {
                for (let x = -11; x <= 11; x++) {
                    if (x * x + y * y <= 121) {
                        data.set([...BLOOM_MIDDLE, 255], ((bloomY + Math.round(middle) + y) * SIZE + bloomX + Math.round(middle) + x) * 4)
                    }
                }
            }

            break
        }
        case 'berries': {
            // A tight cluster of round berries, each with a shine.
            const spots: readonly (readonly [number, number])[] = [
                [0, 0],
                [-0.52, -0.3],
                [0.5, -0.34],
                [-0.3, 0.5],
                [0.36, 0.46],
            ]

            for (const [dx, dy] of spots) {
                disc(bloomX, bloomY, middle + dx * middle * 0.55, middle + dy * middle * 0.55, middle * 0.3, (x, y) => {
                    const lit = Math.hypot(x + 0.35, y + 0.35) < 0.28

                    return lit ? 255 : 215 - Math.hypot(x, y) * 45
                })
            }

            break
        }
        default: {
            for (let petal = 0; petal < BLOOM_PETALS; petal++) {
                const turn = (petal / BLOOM_PETALS) * Math.PI * 2

                stamp(bloomX, bloomY, middle + Math.cos(turn) * middle * 0.46, middle + Math.sin(turn) * middle * 0.46, middle * 0.48, middle * 0.42, turn, 250)
            }

            for (let y = -14; y <= 14; y++) {
                for (let x = -14; x <= 14; x++) {
                    if (x * x + y * y <= 196) {
                        const at = ((bloomY + Math.round(middle) + y) * SIZE + bloomX + Math.round(middle) + x) * 4

                        data.set([...BLOOM_MIDDLE, 255], at)
                    }
                }
            }
        }
    }

    const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)

    // Today's bush keeps no name, so its exports are named as they always were.
    if (style !== 'pointed' || bloom !== 'five') {
        texture.name = `bush_${style}_${bloom}`
    }

    texture.colorSpace = THREE.SRGBColorSpace
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = 4
    texture.needsUpdate = true
    cache.set(key, texture)

    return texture
}
