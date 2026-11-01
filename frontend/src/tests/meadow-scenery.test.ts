import {describe, expect, it} from 'vitest'
import {findPreset} from '../assets/trees/presets'
import {SCENERY_BUSHES, SCENERY_ROCKS, SCENERY_TREES} from '../viewport/scene/meadow-scenery'

// The cliff is a far wall, so only what stands in the open is measured.
const footprints = [
    ...SCENERY_BUSHES.map(({x, z, width}) => ({x, z, radius: width / 2})),
    ...SCENERY_ROCKS.map(({x, z, rock}) => ({x, z, radius: Math.max(rock.width, rock.depth) / 2})),
].filter(({radius}) => radius < 10)

describe('the demo scenes', () => {
    it('stands no bush or rock inside another', () => {
        footprints.forEach((a, i) => {
            footprints.slice(i + 1).forEach((b) => {
                expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.radius + b.radius)
            })
        })
    })

    it('keeps the trunks out of the bushes and rocks', () => {
        for (const tree of SCENERY_TREES) {
            for (const other of footprints) {
                expect(Math.hypot(tree.x - other.x, tree.z - other.z)).toBeGreaterThan(other.radius)
            }
        }
    })

    it('only uses trees that exist', () => {
        for (const {preset} of SCENERY_TREES) {
            expect(findPreset(preset)).toBeDefined()
        }
    })
})
