/**
 * The small pointed leaves a bush's cards are printed with.
 *
 * Generated like the brush dabs in `dab-texture.ts`, with less contrast and finer
 * marks, so a bush reads as a soft volume first and as leaves second. Every leaf
 * points the same rough way, down the card, so they overlap like roof tiles.
 */

import * as THREE from 'three'
import {createSeededRandom, randomRange} from './random'

const SIZE = 512
const CELLS = 2
const LEAVES_PER_CELL = 64
const TEXTURE_SEED = 40417

export const LEAF_VARIANTS = CELLS * CELLS

/** Where variant `cell` sits in the atlas, as `[u, v, size]`. */
export function leafCell(cell: number): readonly [number, number, number] {
    const size = 1 / CELLS

    return [(cell % CELLS) * size, Math.floor(cell / CELLS) * size, size]
}

let cached: THREE.DataTexture | null = null

export function getLeafTexture(): THREE.DataTexture {
    if (cached) {
        return cached
    }

    const data = new Uint8Array(SIZE * SIZE * 4)
    const random = createSeededRandom(TEXTURE_SEED)
    const cellSize = SIZE / CELLS

    // A mid value everywhere, including under the cut-out, so filtering never
    // edges a leaf in black.
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 235
        data[i + 1] = 235
        data[i + 2] = 235
    }

    /** One leaf: two curves that meet at both ends. */
    const stamp = (originX: number, originY: number, cx: number, cy: number, long: number, wide: number, turn: number, value: number) => {
        const cos = Math.cos(turn)
        const sin = Math.sin(turn)
        const reach = Math.ceil(long)

        for (let y = -reach; y <= reach; y++) {
            for (let x = -reach; x <= reach; x++) {
                const u = (x * cos + y * sin) / long
                const v = (-x * sin + y * cos) / wide
                const px = Math.round(cx + x)
                const py = Math.round(cy + y)

                if (Math.abs(u) > 1 || Math.abs(v) > 1 - u * u || px < 1 || py < 1 || px >= cellSize - 1 || py >= cellSize - 1) {
                    continue
                }

                const at = ((originY + py) * SIZE + originX + px) * 4

                data[at] = value
                data[at + 1] = value
                data[at + 2] = value
                data[at + 3] = 255
            }
        }
    }

    for (let cell = 0; cell < LEAF_VARIANTS; cell++) {
        const originX = (cell % CELLS) * cellSize
        const originY = Math.floor(cell / CELLS) * cellSize
        const middle = cellSize / 2

        for (let leaf = 0; leaf < LEAVES_PER_CELL; leaf++) {
            // Denser towards the middle, scattered at the edge.
            const distance = Math.pow(random(), 0.6) * middle * 0.78
            const angle = random() * Math.PI * 2
            const long = randomRange(random, 15, 25)

            stamp(
                originX,
                originY,
                middle + Math.cos(angle) * distance,
                middle + Math.sin(angle) * distance,
                long,
                long * randomRange(random, 0.38, 0.52),
                Math.PI / 2 + randomRange(random, -0.8, 0.8),
                Math.round(randomRange(random, 215, 255)),
            )
        }
    }

    const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)

    texture.colorSpace = THREE.SRGBColorSpace
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = 4
    texture.needsUpdate = true
    cached = texture

    return texture
}
