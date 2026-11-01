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

const SIZE = 512
const BASE = 236
const STROKES = 700
const DARKEST = 205
const LIGHTEST = 255
const TEXTURE_SEED = 40417

let strokes: Uint8Array | null = null
/** One per slider stop. They are few, so they are all kept. */
const textures = new Map<number, THREE.DataTexture>()

function paintStrokes(): Uint8Array {
    const values = new Uint8Array(SIZE * SIZE).fill(BASE)
    const random = createSeededRandom(TEXTURE_SEED)

    const stroke = (value: number, long: number, wide: number) => {
        const cx = random() * SIZE
        const cy = random() * SIZE
        const turn = Math.PI / 2 + randomRange(random, -0.28, 0.28)
        const cos = Math.cos(turn)
        const sin = Math.sin(turn)
        const reach = Math.ceil(long)

        for (let y = -reach; y <= reach; y++) {
            for (let x = -reach; x <= reach; x++) {
                const u = (x * cos + y * sin) / long
                const v = (-x * sin + y * cos) / wide

                if (u * u + v * v <= 1) {
                    const px = (Math.round(cx + x) + SIZE) % SIZE
                    const py = (Math.round(cy + y) + SIZE) % SIZE

                    values[py * SIZE + px] = value
                }
            }
        }
    }

    // Every stroke is near the next in value and most overlap, so grain builds up
    // the way a leaf clump's does, and no single mark stands out as a spot.
    for (let index = 0; index < STROKES; index++) {
        stroke(Math.round(randomRange(random, DARKEST, LIGHTEST)), randomRange(random, 28, 80), randomRange(random, 6, 15))
    }

    return values
}

export function getBarkTexture(strength = 1): THREE.DataTexture {
    const cached = textures.get(strength)

    if (cached) {
        return cached
    }

    strokes ??= paintStrokes()

    const data = new Uint8Array(SIZE * SIZE * 4).fill(255)

    for (let index = 0; index < strokes.length; index++) {
        const value = Math.max(0, Math.round(255 - (255 - strokes[index]) * strength))

        data[index * 4] = value
        data[index * 4 + 1] = value
        data[index * 4 + 2] = value
    }

    const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)

    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = 4
    texture.needsUpdate = true
    textures.set(strength, texture)

    return texture
}
