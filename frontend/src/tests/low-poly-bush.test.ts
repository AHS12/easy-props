import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {bushGenerator} from '../assets/bushes/bush-generator'
import type {BushParameters} from '../assets/bushes/bush-mesh'
import {findComponentGenerator} from '../assets/component-generators'
import {generatePropComponents} from '../assets/prop-generators'
import {createSeededRandom} from '../assets/shared/random'
import {getStyleProfile} from '../assets/style/style-profiles'
import {findPreset} from '../assets/trees/presets'

const STYLE = getStyleProfile('detailed')
const BUSHES = ['round-bush', 'small-bush', 'spreading-bush', 'tall-shrub', 'open-bush', 'wild-shrub', 'young-bush', 'wild-rose', 'flower-bush', 'white-bush', 'gold-bush', 'autumn-bush', 'low-hedge']

function presetBush(id: string, build: 'painted' | 'low-poly', changes: Partial<BushParameters> = {}) {
    const preset = findPreset(id)!

    return {bush: bushGenerator.validate({...preset.parameters, ...changes, build}).parameters, seed: preset.seed}
}

/** The body, then the leaves or flowers. */
function buildBush({bush, seed}: {bush: BushParameters; seed: number}, detail = 1): THREE.BufferGeometry[] {
    return generatePropComponents('bush', bush as unknown as Record<string, unknown>, seed, STYLE).map((component) => {
        const generator = findComponentGenerator(component.generatorId)!

        return generator.generate(generator.validate(component.parameters).parameters, {random: createSeededRandom(seed), seed, style: STYLE, detail}).geometry
    })
}

const faces = (geometry: THREE.BufferGeometry) => (geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3

const total = (parts: THREE.BufferGeometry[]) => parts.reduce((sum, part) => sum + faces(part), 0)

/** How many faces meet along each edge, with corners matched by where they are. */
function edgeUses(geometry: THREE.BufferGeometry): Map<string, number> {
    const position = geometry.getAttribute('position')
    const key = (i: number) => [position.getX(i), position.getY(i), position.getZ(i)].map((value) => value.toFixed(5)).join()
    const uses = new Map<string, number>()

    for (let at = 0; at < position.count; at += 3) {
        for (let k = 0; k < 3; k++) {
            const edge = [key(at + k), key(at + ((k + 1) % 3))].sort().join('|')

            uses.set(edge, (uses.get(edge) ?? 0) + 1)
        }
    }

    return uses
}

describe('a low-poly bush', {timeout: 120000}, () => {
    it('costs far fewer faces than the normal bush', () => {
        for (const id of BUSHES) {
            expect(total(buildBush(presetBush(id, 'low-poly'))), id).toBeLessThan(total(buildBush(presetBush(id, 'painted'))) / 2)
        }
    })

    it('is one sealed shell, with every edge shared by exactly two faces', () => {
        for (const id of BUSHES) {
            const [body] = buildBush(presetBush(id, 'low-poly'))
            const open = [...edgeUses(body).values()].filter((count) => count !== 2)

            expect(open.length, id).toBe(0)
        }
    })

    it('gives every face one colour and one facing', () => {
        for (const id of ['round-bush', 'flower-bush']) {
            for (const part of buildBush(presetBush(id, 'low-poly'))) {
                const normal = part.getAttribute('normal')
                const colour = part.getAttribute('color')

                expect(part.index, id).toBeNull()

                for (let at = 0; at < normal.count; at += 3) {
                    for (let k = 1; k < 3; k++) {
                        expect(normal.getY(at + k)).toBeCloseTo(normal.getY(at), 6)
                        expect(colour.getX(at + k)).toBeCloseTo(colour.getX(at), 6)
                    }
                }
            }
        }
    })

    it('stays within a tenth of the size asked for', () => {
        for (const id of BUSHES) {
            const {bush, seed} = presetBush(id, 'low-poly')
            const [body] = buildBush({bush, seed})

            body.computeBoundingBox()
            const size = body.boundingBox!.getSize(new THREE.Vector3())

            for (const [built, asked] of [[size.x, bush.width], [size.y, bush.height], [size.z, bush.depth]]) {
                expect(Math.abs(built / asked - 1), id).toBeLessThan(0.1)
            }
        }
    })

    it('has flowers only when asked for, and fewer at a lighter detail level', () => {
        const flowering = presetBush('flower-bush', 'low-poly')

        expect(faces(buildBush(presetBush('round-bush', 'low-poly'))[1])).toBe(0)
        expect(faces(buildBush(flowering)[1])).toBeGreaterThan(0)
        expect(faces(buildBush(flowering, 0.4)[1])).toBeLessThan(faces(buildBush(flowering)[1]))
    })

    it('gives every lighter detail level fewer faces', () => {
        const bush = presetBush('spreading-bush', 'low-poly')
        const counts = [1, 0.4, 0.12].map((detail) => faces(buildBush(bush, detail)[0]))

        expect(counts[1]).toBeLessThan(counts[0])
        expect(counts[2]).toBeLessThan(counts[1])
    })

    it('hides the controls that only shape leaf cards', () => {
        const keys = (build: string) => bushGenerator.shownControls!({...presetBush('round-bush', 'painted').bush, build}).map((spec) => spec.key)

        expect(keys('painted')).toEqual(expect.arrayContaining(['inside', 'fullness', 'leafSize']))
        expect(keys('low-poly')).not.toContain('inside')
        expect(keys('low-poly')).not.toContain('fullness')
        expect(keys('low-poly')).not.toContain('leafSize')
        expect(keys('low-poly')).not.toContain('build')
    })
})
