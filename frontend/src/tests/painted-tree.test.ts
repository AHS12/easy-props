import {describe, expect, it} from 'vitest'
import {createSeededRandom} from '../assets/shared/random'
import {getStyleProfile} from '../assets/style/style-profiles'
import {findComponentGenerator} from '../assets/trees/component-generators'
import {
    paintedTreeDefaults,
    planPaintedTree,
    validatePaintedTreeParameters,
    type PaintedTreeParameters,
} from '../assets/trees/painted'
import {generateTreeComponents} from '../assets/trees/tree-generators'

const DETAILED = getStyleProfile('detailed')
const LOW = getStyleProfile('low-poly')

function buildParts(parameters: PaintedTreeParameters, seed: number, style = DETAILED) {
    return generateTreeComponents('painted-tree', parameters, seed, style).map((component) => {
        const generator = findComponentGenerator(component.generatorId)!

        return generator.generate(generator.validate(component.parameters).parameters, {
            random: createSeededRandom(component.seed),
            seed: component.seed,
            style,
        })
    })
}

const triangles = (parts: ReturnType<typeof buildParts>) =>
    parts.reduce((sum, part) => sum + part.geometry.index!.count / 3, 0)

describe('painted tree', () => {
    it('stays inside its triangle budget, whatever the seed', () => {
        for (const seed of [1, 2, 3, 77123, 991]) {
            expect(triangles(buildParts(paintedTreeDefaults, seed))).toBeLessThan(11000)
            expect(triangles(buildParts(paintedTreeDefaults, seed, LOW))).toBeLessThan(8000)
        }
    })

    it('reproduces the same tree from the same seed', () => {
        const first = buildParts(paintedTreeDefaults, 42)
        const second = buildParts(paintedTreeDefaults, 42)

        expect(first.length).toBe(second.length)

        first.forEach((part, index) => {
            expect(part.geometry.getAttribute('position').array).toEqual(
                second[index].geometry.getAttribute('position').array,
            )
        })
    })

    it('gives different seeds a different crown', () => {
        const a = planPaintedTree(paintedTreeDefaults, 1).clumps[0].centre
        const b = planPaintedTree(paintedTreeDefaults, 2).clumps[0].centre

        expect(a).not.toEqual(b)
    })

    it('means what Height says', () => {
        for (const height of [5, 8, 12]) {
            const plan = planPaintedTree({...paintedTreeDefaults, height}, 7)
            const top = Math.max(...plan.clumps.map((c) => c.centre[1] + c.radius * c.flatten))

            expect(Math.abs(top - height) / height).toBeLessThan(0.05)
        }
    })

    it('starts every thin limb inside the wood it grows from', () => {
        const {limbs} = planPaintedTree(paintedTreeDefaults, 5)

        for (const limb of limbs.slice(1)) {
            const start = limb.points[0]
            const nearest = Math.min(
                ...limbs
                    .filter((other) => other.id !== limb.id && other.level < limb.level + 1)
                    .flatMap((other) =>
                        other.points.map((point, index) => {
                            return (
                                Math.hypot(point[0] - start[0], point[1] - start[1], point[2] - start[2]) -
                                other.radii[index]
                            )
                        }),
                    ),
            )

            // Measured to the parent's joints, not its surface, so allow a segment.
            expect(nearest).toBeLessThan(1.5)
        }
    })

    it('carries colour, its own normals, and a cut-out for leaves', () => {
        const [bark, clump] = buildParts(paintedTreeDefaults, 3)

        expect(bark.geometry.getAttribute('color')).toBeDefined()
        expect(bark.surface?.map).toBeUndefined()
        expect(clump.geometry.getAttribute('normal')).toBeDefined()
        expect(clump.surface?.alphaTest).toBeGreaterThan(0)
        expect(clump.surface?.map).toBeDefined()
    })

    it('never produces a broken number, across the whole range of every control', () => {
        const random = createSeededRandom(2024)

        for (let run = 0; run < 25; run++) {
            const {parameters} = validatePaintedTreeParameters({
                height: 3 + random() * 13,
                trunkRadius: 0.15 + random() * 1.05,
                spread: 2 + random() * 14,
                forkHeight: 0.2 + random() * 0.5,
                limbCount: 2 + random() * 6,
                gnarl: random(),
                clumpCount: 3 + random() * 15,
                clumpSize: 0.5 + random() * 1.1,
                fullness: 0.2 + random() * 0.8,
                palette: 'spring',
            })

            for (const part of buildParts(parameters, run, run % 2 ? LOW : DETAILED)) {
                const positions = part.geometry.getAttribute('position').array
                const normals = part.geometry.getAttribute('normal').array

                expect(positions.length).toBeGreaterThan(0)
                expect(positions.every(Number.isFinite)).toBe(true)
                expect(normals.every(Number.isFinite)).toBe(true)
            }
        }
    }, 60000)
})
