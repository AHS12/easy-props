/**
 * The Cartoon view: a soft, painterly stand-in for a game engine's toon lighting.
 *
 * Toon shading is something an engine does to whatever it draws, so none of
 * this reaches the file. Light falls in a few bands with soft steps between
 * them, and the prop keeps its painted grain. The Comic view, in `cel.ts`, is
 * the hard, flat-coloured one.
 */

import * as THREE from 'three'
import type {GeneratedPart} from '../../assets/shared/generator-types'
import {cartoonLevel} from '../../assets/style/toon-looks'

const WIDTH = 128

let gradient: THREE.DataTexture | null = null

/** Shared by every part, so it is made once and never disposed with one. */
function bandTexture(): THREE.DataTexture {
    if (!gradient) {
        const data = new Uint8Array(WIDTH)

        for (let index = 0; index < WIDTH; index++) {
            data[index] = Math.round(cartoonLevel(index / (WIDTH - 1)) * 255)
        }

        gradient = new THREE.DataTexture(data, WIDTH, 1, THREE.RedFormat)
        gradient.minFilter = THREE.LinearFilter
        gradient.magFilter = THREE.LinearFilter
        gradient.generateMipmaps = false
        gradient.needsUpdate = true
    }

    return gradient
}

export function createCartoonMaterial(
    part: GeneratedPart,
    color: THREE.ColorRepresentation,
    flatShading: boolean,
): THREE.MeshToonMaterial {
    const surface = part.surface
    const material = new THREE.MeshToonMaterial({
        color: new THREE.Color(color),
        gradientMap: bandTexture(),
        vertexColors: surface?.vertexColors ?? false,
        map: surface?.map ?? null,
        normalMap: surface?.normalMap ?? null,
        alphaTest: surface?.alphaTest ?? 0,
    })

    // The toon material has no setting for facets, but its shader honours the
    // flag, and a low-poly prop should keep its facets here too.
    Object.assign(material, {flatShading: surface ? false : flatShading})

    return material
}

/** The Cartoon version of a material the view already draws with, such as the scenery's. */
export function cartoonFromStandard(standard: THREE.MeshStandardMaterial): THREE.MeshToonMaterial {
    return new THREE.MeshToonMaterial({
        color: standard.color,
        gradientMap: bandTexture(),
        vertexColors: standard.vertexColors,
        map: standard.map,
        normalMap: standard.normalMap,
        alphaTest: standard.alphaTest,
        side: standard.side,
    })
}
