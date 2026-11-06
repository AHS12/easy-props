import {describe, expect, it} from 'vitest'
import {findComponentGenerator} from '../assets/component-generators'
import {generatePropComponents} from '../assets/prop-generators'
import {cutRockGenerator, type CutRockParameters} from '../assets/rocks/cut-rock-generator'
import {distanceToChunk, planRock} from '../assets/rocks/rock-plan'
import {createSeededRandom} from '../assets/shared/random'
import {getStyleProfile} from '../assets/style/style-profiles'
import {findPreset} from '../assets/trees/presets'

const STYLE = getStyleProfile('detailed')
const ROCKS = ['boulder', 'mossy-boulder', 'split-boulder', 'grassy-outcrop', 'low-ledge', 'field-stone', 'river-stone', 'step-stone', 'standing-stone', 'cliff-face', 'sea-stack', 'red-mesa']

function presetRock(id: string, build: 'painted' | 'low-poly') {
    const preset = findPreset(id)!

    return {rock: cutRockGenerator.validate({...preset.parameters, build}).parameters, seed: preset.seed}
}

function buildRock({rock, seed}: {rock: CutRockParameters; seed: number}, detail = 1) {
    const [component] = generatePropComponents('cut-rock', rock as unknown as Record<string, unknown>, seed, STYLE)
    const generator = findComponentGenerator(component.generatorId)!

    return generator.generate(generator.validate(component.parameters).parameters, {random: createSeededRandom(seed), seed, style: STYLE, detail}).geometry
}

const faces = (geometry: ReturnType<typeof buildRock>) => (geometry.index?.count ?? geometry.getAttribute('position').count) / 3

/** How many of the rock's faces a ray straight up from a point passes through. */
function crossingsAbove(positions: ArrayLike<number>, x: number, y: number, z: number): number {
    let count = 0

    for (let at = 0; at < positions.length; at += 9) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from({length: 9}, (_, k) => positions[at + k])
        // Where the upright line through the point meets the face, seen from above.
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)

        if (Math.abs(d) < 1e-12) {
            continue
        }

        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d
        const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d
        const w = 1 - u - v

        if (u < 0 || v < 0 || w < 0) {
            continue
        }

        if (u * ay + v * by + w * cy > y) {
            count++
        }
    }

    return count
}

describe('a low-poly rock', {timeout: 60000}, () => {
    it('costs fewer faces than the normal rock', () => {
        for (const id of ROCKS) {
            expect(faces(buildRock(presetRock(id, 'low-poly'))), id).toBeLessThan(faces(buildRock(presetRock(id, 'painted'))))
        }
    })

    it('gives every face one colour and one facing', () => {
        for (const id of ROCKS) {
            const geometry = buildRock(presetRock(id, 'low-poly'))
            const normal = geometry.getAttribute('normal')
            const colour = geometry.getAttribute('color')

            expect(geometry.index, id).toBeNull()

            for (let at = 0; at < normal.count; at += 3) {
                for (let k = 1; k < 3; k++) {
                    expect(normal.getY(at + k)).toBeCloseTo(normal.getY(at), 6)
                    expect(colour.getX(at + k)).toBeCloseTo(colour.getX(at), 6)
                }
            }
        }
    })

    it('is one shell, open only at the ground, with nothing buried inside', () => {
        for (const id of ROCKS) {
            const {rock, seed} = presetRock(id, 'low-poly')
            const plan = planRock(rock, seed)
            const positions = buildRock({rock, seed}).getAttribute('position').array
            const random = createSeededRandom(7)
            let wrong = 0
            const tries = 400

            for (let n = 0; n < tries; n++) {
                // A point somewhere in the rock's box, above the ground.
                const p = [
                    (random() - 0.5) * plan.width * 1.2,
                    random() * plan.height * 1.1 + plan.height * 0.01,
                    (random() - 0.5) * plan.depth * 1.2,
                ] as const
                const inside = plan.chunks.some((chunk) => distanceToChunk(chunk, p) < 0)
                const margin = Math.min(...plan.chunks.map((chunk) => Math.abs(distanceToChunk(chunk, p))))

                // Too near a face to say which side it is on.
                if (margin < plan.height * 0.002) {
                    continue
                }

                if ((crossingsAbove(positions, p[0], p[1], p[2]) % 2 === 1) !== inside) {
                    wrong++
                }
            }

            expect(wrong, id).toBe(0)
        }
    })

    it('stays the same size at a lighter detail level, with fewer faces', () => {
        const low = presetRock('cliff-face', 'low-poly')
        const full = buildRock(low)
        const light = buildRock(low, 0.2)

        full.computeBoundingBox()
        light.computeBoundingBox()

        expect(faces(light)).toBeLessThan(faces(full))
        expect(light.boundingBox!.max.y).toBeCloseTo(full.boundingBox!.max.y, 1)
    })

    it('hides the controls that only shape soft edges', () => {
        const keys = (build: string) => cutRockGenerator.shownControls!({...presetRock('boulder', 'painted').rock, build}).map((spec) => spec.key)

        expect(keys('painted')).toContain('edges')
        expect(keys('low-poly')).not.toContain('edges')
        expect(keys('low-poly')).not.toContain('bend')
        expect(keys('low-poly')).not.toContain('build')
    })
})
