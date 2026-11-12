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

/** How rough a part is: a painted part is matt unless it says otherwise, as a wet one does. */
export const partRoughness = (part: Pick<GeneratedPart, 'surface'> | undefined): number =>
    part?.surface ? (part.surface.roughness ?? 1) : ROUGHNESS

export function createPartMaterial(
    part: GeneratedPart,
    color: THREE.ColorRepresentation,
    flatShading: boolean,
): THREE.MeshStandardMaterial {
    const surface = part.surface

    return new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: partRoughness(part),
        metalness: METALNESS,
        // A painted part carries its own normals. Faceting them would throw
        // away the one thing that makes it read as a soft volume.
        flatShading: surface ? false : flatShading,
        vertexColors: surface?.vertexColors ?? false,
        map: surface?.map ?? null,
        normalMap: surface?.normalMap ?? null,
        alphaTest: surface?.alphaTest ?? 0,
    })
}
