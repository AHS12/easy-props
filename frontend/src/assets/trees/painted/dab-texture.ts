/**
 * The brush dabs a leaf card is printed with.
 *
 * Generated, so there is no art to license and no file to lose. Four variants
 * in a two by two atlas, each a loose disc of small strokes with a cut-out
 * edge, and with a little light and dark between strokes so a clump has grain.
 */

import * as THREE from 'three'
import {createSeededRandom, randomRange} from '../../shared/random'

const SIZE = 512
const CELLS = 2
const DABS_PER_CELL = 240
const TEXTURE_SEED = 90210
/** The solid middle of every variant, as a share of a cell. */
const SOLID_MIDDLE = 0.14

export const DAB_VARIANTS = CELLS * CELLS

/** Where variant `cell` sits in the atlas, as `[u, v, size]`. */
export function dabCell(cell: number): readonly [number, number, number] {
    const size = 1 / CELLS

    return [(cell % CELLS) * size, Math.floor(cell / CELLS) * size, size]
}

let cached: THREE.DataTexture | null = null

export function getDabTexture(): THREE.DataTexture {
    if (cached) {
        return cached
    }

    const data = new Uint8Array(SIZE * SIZE * 4)
    const random = createSeededRandom(TEXTURE_SEED)
    const cellSize = SIZE / CELLS

    // A mid value everywhere, including under the cut-out: filtering reads the
    // transparent neighbours, and black there would edge every stroke in dark.
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 240
        data[i + 1] = 240
        data[i + 2] = 240
    }

    const stamp = (
        originX: number,
        originY: number,
        cx: number,
        cy: number,
        long: number,
        wide: number,
        turn: number,
        value: number,
    ) => {
        const cos = Math.cos(turn)
        const sin = Math.sin(turn)
        const reach = Math.ceil(long)

        for (let y = -reach; y <= reach; y++) {
            for (let x = -reach; x <= reach; x++) {
                const u = (x * cos + y * sin) / long
                const v = (-x * sin + y * cos) / wide
                const px = Math.round(cx + x)
                const py = Math.round(cy + y)

                if (u * u + v * v > 1 || px < 1 || py < 1 || px >= cellSize - 1 || py >= cellSize - 1) {
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

    for (let cell = 0; cell < DAB_VARIANTS; cell++) {
        const originX = (cell % CELLS) * cellSize
        const originY = Math.floor(cell / CELLS) * cellSize
        const middle = cellSize / 2

        stamp(originX, originY, middle, middle, cellSize * SOLID_MIDDLE, cellSize * SOLID_MIDDLE, 0, 240)

        for (let dab = 0; dab < DABS_PER_CELL; dab++) {
            // Denser towards the middle, scattered at the edge.
            const distance = Math.pow(random(), 0.62) * middle * 0.92
            const angle = random() * Math.PI * 2
            const edge = distance / (middle * 0.92)
            const long = randomRange(random, 8, 15) * (1 - edge * 0.45)

            stamp(
                originX,
                originY,
                middle + Math.cos(angle) * distance,
                middle + Math.sin(angle) * distance,
                long,
                long * randomRange(random, 0.42, 0.68),
                random() * Math.PI,
                Math.round(randomRange(random, 205, 255)),
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
