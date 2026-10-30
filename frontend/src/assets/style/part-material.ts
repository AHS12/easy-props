/**
 * The material of a generated part.
 *
 * The viewport, the thumbnails and the export all build it here, so a part
 * cannot look one way on screen and another way in the file.
 */

import * as THREE from 'three'
import type {GeneratedPart} from '../shared/generator-types'

const ROUGHNESS = 0.85
const METALNESS = 0

export function createPartMaterial(
    part: GeneratedPart,
    color: THREE.ColorRepresentation,
    flatShading: boolean,
): THREE.MeshStandardMaterial {
    const surface = part.surface

    return new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: surface ? 1 : ROUGHNESS,
        metalness: METALNESS,
        // A painted part carries its own normals. Faceting them would throw
        // away the one thing that makes it read as a soft volume.
        flatShading: surface ? false : flatShading,
        vertexColors: surface?.vertexColors ?? false,
        map: surface?.map ?? null,
        alphaTest: surface?.alphaTest ?? 0,
    })
}
