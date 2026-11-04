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

/** Shadow, mid and lit, and where light moves from one to the next. */
const LEVELS = [0.42, 0.7, 1]
const STEPS = [0.3, 0.62]
/** How wide each soft step is, as a share of the whole range. Wider reads as painted, narrower as hard. */
const SOFTNESS = 0.09
const WIDTH = 128

let gradient: THREE.DataTexture | null = null

const smoothstep = (edge0: number, edge1: number, x: number) => {
    const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)

    return t * t * (3 - 2 * t)
}

/** How bright each amount of light is drawn: flat bands joined by short soft steps. */
export function cartoonLevel(light: number): number {
    let level = LEVELS[0]

    STEPS.forEach((step, index) => {
        level += (LEVELS[index + 1] - LEVELS[index]) * smoothstep(step - SOFTNESS / 2, step + SOFTNESS / 2, light)
    })

    return level
}

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
