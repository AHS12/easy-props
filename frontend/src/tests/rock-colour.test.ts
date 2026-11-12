import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {cutRockDefaults, cutRockGenerator, type CutRockParameters} from '../assets/rocks/cut-rock-generator'
import {damageRock} from '../assets/rocks/rock-damage'
import {buildLowPolyRockMesh} from '../assets/rocks/low-poly-rock'
import {buildRockMesh} from '../assets/rocks/rock-mesh'
import {planRock} from '../assets/rocks/rock-plan'
import {findPreset} from '../assets/trees/presets'

function rockOf(id: string, changes: Partial<CutRockParameters> = {}) {
    const preset = findPreset(id)!
    const rock = {...(preset.parameters as unknown as CutRockParameters), ...changes}

    return buildRockMesh(damageRock(planRock(rock, preset.seed), rock, preset.seed), rock, preset.seed, 1)
}

/** How far apart in colour the points that sit in one place on two faces are, on average. */
function jumpAtEdges(geometry: THREE.BufferGeometry): number {
    const position = geometry.getAttribute('position')
    const colour = geometry.getAttribute('color')
    const places = new Map<string, number[]>()

    for (let index = 0; index < position.count; index++) {
        const key = [position.getX(index), position.getY(index), position.getZ(index)].map((value) => Math.round(value * 1000)).join()

        places.set(key, [...(places.get(key) ?? []), index])
    }

    let sum = 0
    let count = 0

    for (const indices of places.values()) {
        for (let a = 1; a < indices.length; a++) {
            const [i, j] = [indices[0], indices[a]]

            sum += Math.abs(colour.getX(i) - colour.getX(j)) + Math.abs(colour.getY(i) - colour.getY(j)) + Math.abs(colour.getZ(i) - colour.getZ(j))
            count++
        }
    }

    return sum / Math.max(count, 1)
}

describe('colour across a rock', () => {
    it('runs on over an edge, where before each face had its own', () => {
        for (const id of ['boulder', 'mossy-boulder', 'cliff-face', 'damp-stone']) {
            expect(jumpAtEdges(rockOf(id)), id).toBeLessThan(jumpAtEdges(rockOf(id, {rounded: 0})) * 0.5)
        }
    })

    it('brings moss in softly, so moss and stone blend where they meet', () => {
        const colour = rockOf('mossy-boulder').getAttribute('color')
        let between = 0

        for (let index = 0; index < colour.count; index++) {
            const green = colour.getY(index) - Math.max(colour.getX(index), colour.getZ(index))

            between += green > 0.02 && green < 0.08 ? 1 : 0
        }

        expect(between).toBeGreaterThan(colour.count * 0.03)
    })

    it('starts new rocks in a warm grey, and keeps Lavender as a choice', () => {
        expect(cutRockDefaults.palette).toBe('greystone')

        const stone = cutRockGenerator.parameters.find((spec) => spec.key === 'palette')
        const values = stone?.kind === 'choice' ? stone.options.map((option) => option.value) : []

        expect(values).toContain('lavender')
        expect(values).toContain('greystone')
    })

    it('leaves a low-poly rock painted as it always was', () => {
        const preset = findPreset('boulder')!
        const lowPoly = (rounded: number) => {
            const rock = {...(preset.parameters as unknown as CutRockParameters), build: 'low-poly' as const, rounded}

            return Array.from(buildLowPolyRockMesh(damageRock(planRock(rock, preset.seed), rock, preset.seed), rock, 1).getAttribute('color').array)
        }

        expect(lowPoly(0.5)).toEqual(lowPoly(0))
    })
})
