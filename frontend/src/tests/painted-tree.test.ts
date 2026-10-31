import {describe, expect, it} from 'vitest'
import {createSeededRandom} from '../assets/shared/random'
import {getStyleProfile} from '../assets/style/style-profiles'
import {findComponentGenerator} from '../assets/component-generators'
import {
    applyPartAction,
    assembleBark,
    barkGeometry,
    buildBark,
    buildClump,
    controlsForTree,
    listBarkCells,
    prepareBark,
    sculptBarkCells,
    paintedTreeDefaults,
    paintedTreeParameterSpecs,
    parseEdits,
    planPaintedTree,
    sectionsForPart,
    validatePaintedTreeParameters,
    type PaintedTreeParameters,
} from '../assets/trees/painted'
import {presetGroups, treePresets} from '../assets/trees/presets'
import {generatePropComponents} from '../assets/prop-generators'

/** A preset may spend more than the default tree, within reason for a game. */
const PRESET_TRIANGLE_BUDGET = 25000
const DETAILED = getStyleProfile('detailed')
const LOW = getStyleProfile('low-poly')

function buildParts(parameters: PaintedTreeParameters, seed: number, style = DETAILED) {
    return generatePropComponents('painted-tree', parameters as unknown as Record<string, unknown>, seed, style).map((component) => {
        const generator = findComponentGenerator(component.generatorId)!

        return generator.generate(generator.validate(component.parameters).parameters, {
            random: createSeededRandom(component.seed),
            seed: component.seed,
            style,
        })
    })
}

// The tubes that catch clicks are never drawn or exported, so they cost nothing.
const triangles = (parts: ReturnType<typeof buildParts>) =>
    parts
        .filter((part) => !part.surface?.proxy)
        .reduce((sum, part) => sum + part.geometry.index!.count / 3, 0)

describe('painted tree', () => {
    it('stays inside its triangle budget, whatever the seed', () => {
        for (const seed of [1, 2, 3, 77123, 991]) {
            expect(triangles(buildParts(paintedTreeDefaults, seed))).toBeLessThan(14000)
            expect(triangles(buildParts(paintedTreeDefaults, seed, LOW))).toBeLessThan(10000)
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

    it('adding a branch leaves the other branches where they were', () => {
        const before = planPaintedTree({...paintedTreeDefaults, branchCount: 3}, 9)
        const pick = (plan: typeof before, key: string) =>
            plan.limbs.find((limb) => limb.key === key)!.points
        const heavyBefore = pick(before, 'l1')
        const after = planPaintedTree({...paintedTreeDefaults, branchCount: 4}, 9)

        // Height may rescale the crown a little, but only vertically.
        pick(after, 'l1').forEach((point, index) => {
            expect(point[0]).toBeCloseTo(heavyBefore[index][0], 6)
            expect(point[2]).toBeCloseTo(heavyBefore[index][2], 6)
        })
    })

    it('moves a limb and takes its children with it, and nothing else', () => {
        const tree = paintedTreeDefaults
        const plain = planPaintedTree(tree, 4)
        const limb = plain.limbs.find((candidate) => candidate.key === 'l0')!
        const moved = limb.controls.map((point) => ({t: 0, x: point[0] + 1, y: point[1], z: point[2]}))
        const edits = applyPartAction(
            '',
            {generatorId: 'painted-limb', parameters: {key: 'l0', base: limb.controlBase}},
            {kind: 'patch', patch: {spine: moved}},
        )!
        const edited = planPaintedTree({...tree, edits}, 4)
        const find = (plan: typeof plain, key: string) => plan.limbs.find((candidate) => candidate.key === key)!

        expect(find(edited, 'l0').points[9][0]).toBeCloseTo(find(plain, 'l0').points[9][0] + 1, 5)
        expect(find(edited, 'l0b0').points[0][0]).not.toBeCloseTo(find(plain, 'l0b0').points[0][0], 3)
        expect(find(edited, 'l1').points).toEqual(find(plain, 'l1').points)
    })

    it('keeps a hand edit when a slider changes afterwards', () => {
        const key = planPaintedTree(paintedTreeDefaults, 6).clumps[0].key
        const edits = applyPartAction(
            '',
            {generatorId: 'painted-clump', parameters: {key}},
            {kind: 'remove'},
        )!
        const taller = planPaintedTree({...paintedTreeDefaults, height: 10, edits}, 6)

        expect(taller.clumps.some((clump) => clump.key === key)).toBe(false)
        expect(parseEdits(edits).clumps[key].removed).toBe(true)
    })

    it('cannot remove the trunk', () => {
        expect(
            applyPartAction('', {generatorId: 'painted-limb', parameters: {key: 't'}}, {kind: 'remove'}),
        ).toBeNull()
    })

    it('offers the controls that belong with the part you clicked', () => {
        const keysFor = (generatorId: string, type: string) =>
            sectionsForPart(generatorId, type).flatMap((section) => [
                ...section.specs.map((spec) => spec.key),
                ...section.colours,
            ])

        expect(keysFor('painted-limb', 'trunk')).toEqual(expect.arrayContaining(['corkscrew', 'moss', 'barkDeep']))
        expect(keysFor('painted-limb', 'trunk')).not.toContain('rootCount')
        expect(keysFor('painted-bark', 'bark')).toEqual(keysFor('painted-limb', 'trunk'))
    })

    it('never offers a control that could delete the selected part', () => {
        expect(sectionsForPart('painted-clump', 'foliage-cluster')).toEqual([])
        expect(sectionsForPart('painted-limb', 'branch')).toEqual([])
        expect(sectionsForPart('painted-limb', 'root')).toEqual([])
    })

    it('changes the leaves of one clump and leaves the others alone', () => {
        const plan = planPaintedTree(paintedTreeDefaults, 8)
        const [first, second] = plan.clumps
        const edits = applyPartAction(
            '',
            {generatorId: 'painted-clump', parameters: {key: first.key}},
            {kind: 'patch', patch: {fullnessScale: 2}},
        )!
        const edited = planPaintedTree({...paintedTreeDefaults, edits}, 8)
        const cards = (tree: PaintedTreeParameters, source: typeof plan, index: number) =>
            buildClump(source, source.clumps[index], tree, 1).index!.count

        expect(cards({...paintedTreeDefaults, edits}, edited, 0)).toBeGreaterThan(cards(paintedTreeDefaults, plan, 0))
        expect(cards({...paintedTreeDefaults, edits}, edited, 1)).toBe(cards(paintedTreeDefaults, plan, 1))
        expect(edited.clumps[1].key).toBe(second.key)
    })

    it('builds the same bark however the work is sliced', () => {
        const tree: PaintedTreeParameters = {...paintedTreeDefaults, burls: 3, moss: 0.5, barkPattern: 'plated', form: 'conifer'}
        const plan = planPaintedTree(tree, 11)
        const whole = buildBark(plan, tree, 11, 1)
        const context = prepareBark(plan, tree, 11, 1)
        const cells = listBarkCells(context)
        const cellCount = cells.length / 3
        const cuts = [0, 7, Math.floor(cellCount / 3), Math.floor(cellCount / 2), cellCount - 1, cellCount]
        const chunks = cuts.slice(1).map((end, index) =>
            sculptBarkCells(context, cells.slice(cuts[index] * 3, end * 3)),
        )
        const sliced = barkGeometry(assembleBark(context, cells, chunks))

        for (const name of ['position', 'normal', 'color']) {
            expect(sliced.getAttribute(name).array).toEqual(whole.getAttribute(name).array)
        }

        expect(sliced.index!.array).toEqual(whole.index!.array)
    })

    describe('every preset', () => {
        const presets = treePresets.filter((preset) => preset.generatorId === 'painted-tree')
        const validated = (preset: (typeof presets)[number]) => {
            const result = validatePaintedTreeParameters(preset.parameters)

            expect(result.issues).toEqual([])

            return result.parameters
        }

        it('has a unique id and a heading', () => {
            expect(new Set(treePresets.map((preset) => preset.id)).size).toBe(treePresets.length)
            expect(presetGroups.flatMap((group) => group.presets).length).toBe(treePresets.length)
        })

        it.each(presets.map((preset) => [preset.id, preset] as const))('%s builds within budget', (_, preset) => {
            const parts = buildParts(validated(preset), preset.seed)

            expect(triangles(parts)).toBeLessThan(PRESET_TRIANGLE_BUDGET)

            for (const part of parts) {
                expect(part.geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true)
            }
        })

        it.each(presets.map((preset) => [preset.id, preset] as const))('%s is as tall as it says', (_, preset) => {
            const tree = validated(preset)
            const plan = planPaintedTree(tree, preset.seed)
            const top = Math.max(
                ...plan.limbs.map((limb) => limb.points[limb.points.length - 1][1]),
                ...plan.clumps.map((clump) =>
                    clump.kind === 'frond' ? clump.centre[1] + clump.radius * 0.5 : clump.centre[1] + clump.radius * clump.flatten,
                ),
            )

            expect(Math.abs(top - tree.height) / tree.height).toBeLessThan(0.3)
        })
    })

    it('hides the controls a form has no use for, and renames the ones it reuses', () => {
        const palm = controlsForTree(paintedTreeParameterSpecs, {form: 'palm'})

        expect(palm.map((spec) => spec.key)).not.toContain('limbCount')
        expect(palm.find((spec) => spec.key === 'clumpCount')?.label).toBe('Fronds')
        expect(controlsForTree(paintedTreeParameterSpecs, {form: 'crown'}).map((spec) => spec.key)).toContain('limbCount')
    })

    it('leaves a default tree as it was', () => {
        expect(planPaintedTree(paintedTreeDefaults, 3).clumps.every((clump) => clump.sag === 0 && clump.kind === 'mass')).toBe(true)
    })

    it('can leave the crown bare', () => {
        const parts = buildParts({...paintedTreeDefaults, clumpCount: 0}, 3)

        expect(planPaintedTree({...paintedTreeDefaults, clumpCount: 0}, 3).clumps).toEqual([])
        expect(triangles(parts)).toBeGreaterThan(0)
    })

    it('keeps a palm frond and its coconut share independent of its neighbours', () => {
        const tree = {...paintedTreeDefaults, form: 'palm', clumpCount: 10, fruitCount: 5} as PaintedTreeParameters
        const plan = planPaintedTree(tree, 2)
        const edits = applyPartAction('', {generatorId: 'painted-clump', parameters: {key: 'f3'}}, {kind: 'remove'})!

        expect(plan.clumps).toHaveLength(10)
        expect(planPaintedTree({...tree, edits}, 2).clumps.map((clump) => clump.key)).not.toContain('f3')
        expect(planPaintedTree({...tree, edits}, 2).clumps.find((clump) => clump.key === 'f0')?.azimuth).toBe(plan.clumps[0].azimuth)
    })

    it('survives a damaged edit list', () => {
        expect(() => planPaintedTree({...paintedTreeDefaults, edits: '{broken'}, 2)).not.toThrow()
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
                fullness: 0.2 + random() * 1.3,
                corkscrew: random(),
                ridgeTwist: random() * 6 - 3,
                ridgeCount: 2 + random() * 7,
                rootCount: random() * 12,
                burls: random() * 8,
                hollow: random(),
                moss: random(),
                roughness: random(),
                droop: random(),
                branchCount: 1 + random() * 5,
                twigCount: random() * 4,
                barkDetail: 0.5 + random(),
                palette: run % 2 ? 'spring' : 'custom',
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
