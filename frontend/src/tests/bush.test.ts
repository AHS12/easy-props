import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {buildBushCore, buildBushLeaves, type BushParameters} from '../assets/bushes/bush-mesh'
import {bushDefaults, bushGenerator} from '../assets/bushes/bush-generator'
import {findPreset, presetGroups} from '../assets/trees/presets'

const SEEDS = [1, 2, 3, 7, 11, 361, 90210]
const facesOf = (geometry: THREE.BufferGeometry) => geometry.index!.count / 3
const bushPresets = presetGroups.flatMap((group) => group.presets).filter((preset) => preset.generatorId === 'bush')
const small: BushParameters = {...bushDefaults, width: 1.4, height: 1, depth: 1.2, lobes: 4, leafSize: 0.12}

const boundsOf = (geometry: THREE.BufferGeometry) => {
    geometry.computeBoundingBox()

    return geometry.boundingBox!
}

describe('bushes', () => {
    it('is the same bush for the same seed, and another for another', () => {
        const positions = (seed: number) => [...buildBushLeaves(small, seed, 1).getAttribute('position').array]

        expect(positions(5)).toEqual(positions(5))
        expect(positions(5)).not.toEqual(positions(6))
    })

    it('stands on the ground, as big as it was asked to be', () => {
        for (const kind of ['round', 'spreading', 'tall', 'hedge'] as const) {
            const box = boundsOf(buildBushLeaves({...bushDefaults, kind, width: 4, height: 2, depth: 2}, 5, 1))

            expect(box.max.x - box.min.x).toBeGreaterThan(4 * 0.9)
            expect(box.max.x - box.min.x).toBeLessThan(4 * 1.25)
            expect(box.max.y).toBeGreaterThan(2 * 0.9)
            expect(box.max.y).toBeLessThan(2 * 1.25)
        }
    })

    it('keeps its core inside its leaves', () => {
        const core = boundsOf(buildBushCore(small, 5, 1))
        const leaves = boundsOf(buildBushLeaves(small, 5, 1))

        expect(core.max.y).toBeLessThan(leaves.max.y)
        expect(core.max.x).toBeLessThan(leaves.max.x)
        expect(core.min.x).toBeGreaterThan(leaves.min.x)
    })

    it('has a core that reaches the ground, so nothing shows under it', () => {
        expect(boundsOf(buildBushCore(bushDefaults, 5, 1)).min.y).toBeLessThanOrEqual(0)
    })

    it('spreads its cards evenly, with no bare side', () => {
        const position = buildBushLeaves(bushDefaults, 5, 1).getAttribute('position')
        const quarters = [0, 0, 0, 0]

        for (let i = 0; i < position.count; i += 4) {
            quarters[(position.getX(i) > 0 ? 1 : 0) + (position.getZ(i) > 0 ? 2 : 0)]++
        }

        for (const quarter of quarters) {
            expect(quarter).toBeGreaterThan((position.count / 4 / 4) * 0.7)
        }
    })

    it('is lighter on top than at its base', () => {
        const core = buildBushCore({...bushDefaults, variation: 0}, 5, 1)
        const position = core.getAttribute('position')
        const color = core.getAttribute('color')
        let top = 0
        let bottom = 0

        for (let i = 1; i < position.count; i++) {
            if (position.getY(i) > position.getY(top)) {
                top = i
            }

            if (position.getY(i) < position.getY(bottom)) {
                bottom = i
            }
        }

        expect(color.getY(top)).toBeGreaterThan(color.getY(bottom))
    })

    it('needs more cards for smaller leaves', () => {
        expect(facesOf(buildBushLeaves({...small, leafSize: 0.1}, 5, 1))).toBeGreaterThan(facesOf(buildBushLeaves({...small, leafSize: 0.2}, 5, 1)))
    })

    it('holds its outline at lighter levels', () => {
        const full = boundsOf(buildBushLeaves(bushDefaults, 5, 1))

        for (const detail of [0.4, 0.12]) {
            const light = boundsOf(buildBushLeaves(bushDefaults, 5, detail))

            expect(Math.abs(light.max.y - full.max.y)).toBeLessThan(full.max.y * 0.1)
            expect(Math.abs(light.max.x - light.min.x - (full.max.x - full.min.x))).toBeLessThan((full.max.x - full.min.x) * 0.1)
        }
    })

    it('offers a sound collision shape', () => {
        const [shape] = bushGenerator.collision!(bushDefaults, 5)

        expect(shape.end[1]).toBeGreaterThan(shape.start[1])
        expect(shape.startRadius).toBeGreaterThan(shape.endRadius)
    })

    it.each(bushPresets.map((preset) => preset.id))('builds %s within a Background budget, at every seed', (id) => {
        const bush = findPreset(id)!.parameters as unknown as BushParameters

        for (const seed of SEEDS) {
            const core = buildBushCore(bush, seed, 1)
            const leaves = buildBushLeaves(bush, seed, 1)

            expect(facesOf(core) + facesOf(leaves)).toBeLessThanOrEqual(5000)
            expect([...core.getAttribute('position').array, ...leaves.getAttribute('position').array].every(Number.isFinite)).toBe(true)
        }
    })
})

describe('open bushes', () => {
    const open: BushParameters = {...bushDefaults, inside: 'open', fullness: 1.3, leafSize: 0.16}

    it('has twigs in place of a solid core, far lighter than one', () => {
        expect(facesOf(buildBushCore(open, 5, 1))).toBeLessThan(facesOf(buildBushCore(bushDefaults, 5, 1)) * 0.8)
    })

    it('has fewer cards than a solid one, so it can be seen through', () => {
        expect(facesOf(buildBushLeaves(open, 5, 1))).toBeLessThan(facesOf(buildBushLeaves({...bushDefaults, leafSize: 0.16}, 5, 1)))
    })

    it('has brown twigs', () => {
        const color = buildBushCore(open, 5, 1).getAttribute('color')

        expect(color.getX(0)).toBeGreaterThan(color.getZ(0))
    })

    it('holds its share at every level, and its twigs reach the ground', () => {
        expect(boundsOf(buildBushCore(open, 5, 1)).min.y).toBeLessThanOrEqual(0)

        const faces = (detail: number) => facesOf(buildBushCore(open, 5, detail)) + facesOf(buildBushLeaves(open, 5, detail))

        expect(faces(0.12)).toBeLessThan(faces(1) * 0.3)
    })
})
