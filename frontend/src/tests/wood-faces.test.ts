import {describe, expect, it} from 'vitest'
import * as THREE from 'three'
import {getStyleProfile} from '../assets/style/style-profiles'
import {treePresets} from '../assets/trees/presets'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {mergeParts} from '../core/export/pipeline/merge'
import {tidyWood} from '../core/export/pipeline/tidy'
import {LEVEL_SHARES} from '../core/export/pipeline/types'
import {sceneExportSource} from '../core/export/scene-source'

const STYLE = getStyleProfile('low-poly')

/** Faces an engine drawing one side would get wrong: no area, or turned to face inwards. */
function badFaces(geometry: THREE.BufferGeometry) {
    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')
    const index = geometry.index!.array
    const [a, b, c, corner, facing] = [0, 0, 0, 0, 0].map(() => new THREE.Vector3())
    const found = {flat: 0, inwards: 0}

    for (let at = 0; at < index.length; at += 3) {
        const corners = [index[at], index[at + 1], index[at + 2]]

        a.fromBufferAttribute(position, corners[0])
        b.fromBufferAttribute(position, corners[1])
        c.fromBufferAttribute(position, corners[2])
        facing.subVectors(c, b).cross(corner.subVectors(a, b))

        if (facing.length() < 1e-10) {
            found.flat++
        } else if (corners.every((vertex) => corner.fromBufferAttribute(normal, vertex).dot(facing) < 0)) {
            found.inwards++
        }
    }

    return found
}

describe('the wood in every preset', () => {
    it.each(treePresets.map((preset) => preset.id))('%s has no flat or inward faces at any level', async (id) => {
        const source = sceneExportSource(createSceneFromPreset(id), STYLE, 'test')

        for (const share of LEVEL_SHARES) {
            for (const mesh of mergeParts(await source.buildAtDetail(share), 'prop', source.pivot())) {
                if (!mesh.name.endsWith('_leaves')) {
                    expect({level: share, ...badFaces(mesh.geometry)}).toEqual({level: share, flat: 0, inwards: 0})
                }
            }
        }
    }, 60000)
})

describe('tidying wood', () => {
    // One triangle facing up, with corners that say up.
    const triangle = (corners: number[], up = 1) => {
        const geometry = new THREE.BufferGeometry()

        geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1], 3))
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Array(6).fill([0, up, 0]).flat(), 3))
        geometry.setIndex(corners)

        return geometry
    }

    it('turns round a face that points against its corners', () => {
        const geometry = triangle([0, 1, 2])

        tidyWood(geometry)

        expect(badFaces(geometry).inwards).toBe(0)
        expect(geometry.index!.count).toBe(3)
    })

    it('leaves a face that already points out', () => {
        const geometry = triangle([0, 2, 1])

        tidyWood(geometry)

        expect(Array.from(geometry.index!.array)).toEqual([0, 2, 1])
    })

    it('keeps two faces back to back, as a thin branch simplified flat still shows', () => {
        const geometry = triangle([0, 2, 1, 3, 4, 5])

        // The second face's corners say down, so it stays facing down, against the first.
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0], 3))
        tidyWood(geometry)

        expect(geometry.index!.count).toBe(6)
    })

    it('keeps one of two copies facing the same way', () => {
        const geometry = triangle([0, 2, 1, 3, 5, 4])

        tidyWood(geometry)

        expect(geometry.index!.count).toBe(3)
    })
})
