import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import type {GrassParameters} from '../assets/grass/blade-mesh'
import {grassGenerator} from '../assets/grass/grass-generator'
import {findComponentGenerator} from '../assets/component-generators'
import {generatePropComponents} from '../assets/prop-generators'
import {createSeededRandom} from '../assets/shared/random'
import {getStyleProfile} from '../assets/style/style-profiles'
import {findPreset} from '../assets/trees/presets'

const STYLE = getStyleProfile('detailed')
const PATCHES = ['grass-tuft', 'meadow-patch', 'short-lawn', 'long-grass', 'broad-tuft', 'dry-tuft', 'reeds', 'flower-meadow', 'far-meadow']

function presetGrass(id: string, build: 'painted' | 'low-poly', changes: Partial<GrassParameters> = {}) {
    const preset = findPreset(id)!

    return {grass: grassGenerator.validate({...preset.parameters, ...changes, build}).parameters, seed: preset.seed}
}

function buildGrass({grass, seed}: {grass: GrassParameters; seed: number}, detail = 1): THREE.BufferGeometry {
    const [component] = generatePropComponents('grass', grass as unknown as Record<string, unknown>, seed, STYLE)
    const generator = findComponentGenerator(component.generatorId)!

    return generator.generate(generator.validate(component.parameters).parameters, {random: createSeededRandom(seed), seed, style: STYLE, detail}).geometry
}

const faces = (geometry: THREE.BufferGeometry) => (geometry.index?.count ?? geometry.getAttribute('position').count) / 3

const sizeOf = (geometry: THREE.BufferGeometry) => {
    geometry.computeBoundingBox()

    return geometry.boundingBox!.getSize(new THREE.Vector3())
}

/** How much the blades cover. Both kinds draw every face from both sides, so each is counted once. */
const area = (geometry: THREE.BufferGeometry) => {
    const position = geometry.getAttribute('position')
    const index = geometry.index
    const corner = (i: number) => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(i) : i)
    let sum = 0

    for (let at = 0; at < (index ? index.count : position.count); at += 3) {
        sum += new THREE.Triangle(corner(at), corner(at + 1), corner(at + 2)).getArea()
    }

    return sum / 2
}

describe('low-poly grass', () => {
    it('costs far fewer faces than normal grass', () => {
        for (const id of PATCHES) {
            expect(faces(buildGrass(presetGrass(id, 'low-poly'))), id).toBeLessThan(faces(buildGrass(presetGrass(id, 'painted'))) / 2)
        }
    })

    it('gives every face one colour and one facing', () => {
        for (const id of ['meadow-patch', 'flower-meadow']) {
            const geometry = buildGrass(presetGrass(id, 'low-poly'))
            const normal = geometry.getAttribute('normal')
            const colour = geometry.getAttribute('color')

            expect(geometry.index, id).toBeNull()

            for (let at = 0; at < normal.count; at += 3) {
                for (let k = 1; k < 3; k++) {
                    expect(normal.getZ(at + k)).toBeCloseTo(normal.getZ(at), 6)
                    expect(colour.getX(at + k)).toBeCloseTo(colour.getX(at), 6)
                }
            }
        }
    })

    it('covers the patch about as fully as normal grass, with fewer, wider blades', () => {
        for (const id of PATCHES) {
            const ratio = area(buildGrass(presetGrass(id, 'low-poly'))) / area(buildGrass(presetGrass(id, 'painted')))

            expect(ratio, id).toBeGreaterThan(0.6)
            expect(ratio, id).toBeLessThan(1.6)
        }
    })

    it('stands as wide and tall as normal grass', () => {
        for (const id of PATCHES) {
            const low = sizeOf(buildGrass(presetGrass(id, 'low-poly')))
            const normal = sizeOf(buildGrass(presetGrass(id, 'painted')))

            for (const axis of ['x', 'y', 'z'] as const) {
                expect(Math.abs(low[axis] / normal[axis] - 1), `${id} ${axis}`).toBeLessThan(0.15)
            }
        }
    })

    it('has flowers only when asked for, and fewer faces at a lighter detail level', () => {
        const meadow = presetGrass('flower-meadow', 'low-poly')

        expect(faces(buildGrass(meadow))).toBeGreaterThan(faces(buildGrass(presetGrass('flower-meadow', 'low-poly', {flowers: 0}))))
        expect(faces(buildGrass(meadow, 0.4))).toBeLessThan(faces(buildGrass(meadow)))
        expect(faces(buildGrass(meadow, 0.12))).toBeLessThan(faces(buildGrass(meadow, 0.4)))
    })

    it('is the same for the same seed, and stays finite at the extremes', () => {
        const meadow = presetGrass('meadow-patch', 'low-poly')

        expect([...buildGrass(meadow).getAttribute('position').array]).toEqual([...buildGrass(meadow).getAttribute('position').array])

        for (const changes of [{blades: 5, clumps: 1, width: 0.1, height: 0.05, lean: 0, bladeWidth: 0.004, flowers: 120}, {blades: 1500, clumps: 40, width: 10, height: 3, lean: 1.2, scatter: 1, bladeWidth: 0.12}]) {
            const position = buildGrass(presetGrass('meadow-patch', 'low-poly', changes)).getAttribute('position')

            expect([...position.array].every(Number.isFinite)).toBe(true)
        }
    })

    it('hides Smoothness, which only shapes the normal blades', () => {
        const keys = (build: string) => grassGenerator.shownControls!({...presetGrass('meadow-patch', 'painted').grass, build} as unknown as Record<string, unknown>).map((spec) => spec.key)

        expect(keys('painted')).toContain('smoothness')
        expect(keys('low-poly')).not.toContain('smoothness')
        expect(keys('low-poly')).not.toContain('build')
    })
})
