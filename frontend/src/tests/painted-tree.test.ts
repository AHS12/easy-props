import * as THREE from 'three'
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
    type CrownShape,
    type PaintedTreeParameters,
} from '../assets/trees/painted'
import {presetGroups, treePresets} from '../assets/trees/presets'
import {generatePropComponents} from '../assets/prop-generators'

/** A preset may spend more than the default tree, within reason for a game. */
const PRESET_TRIANGLE_BUDGET = 25000
const DETAILED = getStyleProfile('detailed')
const CROWN_SHAPES: readonly CrownShape[] = ['natural', 'round', 'wide', 'umbrella', 'column', 'cone', 'teardrop']
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


/** How far each vertex in the plane across a limb at one of its points lies from that point. */
function ringAround(
    positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    points: readonly (readonly number[])[],
    at: number,
    within: number,
): number[] {
    const centre = points[at]
    const before = points[Math.max(at - 1, 0)]
    const after = points[Math.min(at + 1, points.length - 1)]
    const axis = new THREE.Vector3(after[0] - before[0], after[1] - before[1], after[2] - before[2]).normalize()
    const offset = new THREE.Vector3()
    const found: number[] = []

    for (let index = 0; index < positions.count; index++) {
        offset.set(positions.getX(index) - centre[0], positions.getY(index) - centre[1], positions.getZ(index) - centre[2])

        if (Math.abs(offset.dot(axis)) < 1e-4 && offset.length() < within) {
            found.push(offset.length())
        }
    }

    return found
}

const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('painted tree', () => {
    it('stays inside its triangle budget, whatever the seed', () => {
        for (const seed of [1, 2, 3, 77123, 991]) {
            expect(triangles(buildParts(paintedTreeDefaults, seed))).toBeLessThan(14000)
            expect(triangles(buildParts(paintedTreeDefaults, seed, LOW))).toBeLessThan(10000)
        }
    }, 60000)

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

    it('carries colour, its own normals, printed bark, and a cut-out for leaves', () => {
        const [bark, clump] = buildParts(paintedTreeDefaults, 3)

        expect(bark.geometry.getAttribute('color')).toBeDefined()
        expect(bark.geometry.getAttribute('uv').count).toBe(bark.geometry.getAttribute('position').count)
        expect(bark.surface?.map).toBeDefined()
        expect(bark.surface?.alphaTest).toBeUndefined()
        expect(clump.geometry.getAttribute('normal')).toBeDefined()
        expect(clump.surface?.alphaTest).toBeGreaterThan(0)
        expect(clump.surface?.map).toBeDefined()
    })

    it('prints brush strokes as strongly as asked, and keeps its relief with none at all', () => {
        const stroked = (brushStrokes: number) => buildParts({...paintedTreeDefaults, brushStrokes}, 3)[0].surface?.map
        const darkest = (brushStrokes: number) => {
            const {image} = stroked(brushStrokes) as unknown as {image: {data: Uint8Array}}

            return image.data.reduce((least, value) => Math.min(least, value), 255)
        }

        expect(darkest(0)).toBe(255)
        expect(buildParts({...paintedTreeDefaults, brushStrokes: 0}, 3)[0].surface?.normalMap).toBeDefined()
        expect(stroked(1)).toBe(stroked(1))
        expect(darkest(2)).toBeLessThan(darkest(1))
        expect(darkest(1)).toBeLessThan(darkest(0.25))
    })

    it('keeps relief edges smooth, so light does not pick out their pixels as dots', () => {
        const relief = buildParts(paintedTreeDefaults, 3)[0].surface!.normalMap as unknown as {
            image: {data: Uint8Array; width: number}
        }
        const {data, width} = relief.image
        let sharpest = 0

        for (let at = 4; at < data.length - 4; at += 4) {
            if ((at / 4) % width !== 0) {
                sharpest = Math.max(sharpest, Math.abs(data[at] - data[at - 4]))
            }
        }

        expect(sharpest).toBeLessThan(150)
    })

    it('faces all of its wood outwards, so a branch is never drawn inside out', () => {
        const geometry = buildBark(planPaintedTree(paintedTreeDefaults, 9), paintedTreeDefaults, 9, 0.68)
        const position = geometry.getAttribute('position')
        const normal = geometry.getAttribute('normal')
        const index = geometry.index!
        const point = new THREE.Vector3()
        const u = new THREE.Vector3()
        const v = new THREE.Vector3()
        const out = new THREE.Vector3()
        let inward = 0

        for (let at = 0; at < index.count; at += 3) {
            const [a, b, c] = [index.getX(at), index.getX(at + 1), index.getX(at + 2)]

            point.fromBufferAttribute(position, a)
            u.fromBufferAttribute(position, b).sub(point)
            v.fromBufferAttribute(position, c).sub(point)
            out.fromBufferAttribute(normal, a).add(point.fromBufferAttribute(normal, b)).add(point.fromBufferAttribute(normal, c))

            if (u.cross(v).dot(out) < 0) {
                inward++
            }
        }

        // A sliver at a joint can lean the wrong way. A whole limb cannot.
        expect(inward / (index.count / 3)).toBeLessThan(0.02)
    })

    it('gives every bark pattern its own relief and paint', () => {
        const patterns = ['none', 'ringed', 'plated', 'banded', 'peeling', 'fibrous'] as const
        const surfaces = patterns.map((barkPattern) => buildParts({...paintedTreeDefaults, barkPattern}, 3)[0].surface!)

        expect(new Set(surfaces.map((surface) => surface.normalMap)).size).toBe(patterns.length)
        expect(new Set(surfaces.map((surface) => surface.map)).size).toBe(patterns.length)
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

    it('ends a thick root rounded, with no spike out to its thin tip', () => {
        const tree: PaintedTreeParameters = {...paintedTreeDefaults, trunkRadius: 0.85, rootCount: 6}
        const plan = planPaintedTree(tree, 301)
        const position = buildBark(plan, tree, 301, 1).getAttribute('position')
        const roots = plan.limbs.filter((limb) => limb.key.startsWith('r'))

        expect(roots).toHaveLength(6)

        for (const root of roots) {
            const tip = root.points[root.points.length - 1]
            let nearest = Infinity

            for (let index = 0; index < position.count; index++) {
                nearest = Math.min(nearest, Math.hypot(position.getX(index) - tip[0], position.getY(index) - tip[1], position.getZ(index) - tip[2]))
            }

            expect(nearest).toBeGreaterThan(0.01)
        }
    })

    it.each([1, 0.4, 0.12])('sinks a root into the ground, with no end left to see, at detail %s', (detail) => {
        const tree: PaintedTreeParameters = {...paintedTreeDefaults, trunkRadius: 0.85, rootCount: 6}
        const plan = planPaintedTree(tree, 301)
        const position = buildBark(plan, tree, 301, detail).getAttribute('position')
        const roots = plan.limbs.filter((limb) => limb.key.startsWith('r'))

        for (const root of roots) {
            const tip = root.points[root.points.length - 1]

            expect(tip[1]).toBeLessThan(0)

            for (let index = 0; index < position.count; index++) {
                if (Math.hypot(position.getX(index) - tip[0], position.getZ(index) - tip[2]) < 0.05) {
                    expect(position.getY(index)).toBeLessThan(0.1)
                }
            }
        }
    })

    it.each([1, 0.4, 0.12])('closes the bottom of the wood, at detail %s, so a prop placed high shows no open edge', (detail) => {
        const tree: PaintedTreeParameters = {...paintedTreeDefaults, trunkRadius: 0.85, rootCount: 6}
        const bark = buildBark(planPaintedTree(tree, 301), tree, 301, detail)
        const position = bark.getAttribute('position')
        const index = bark.index!
        const welded = new Map<string, number>()
        const heights: number[] = []
        const weld = (vertex: number) => {
            const key = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)].map((value) => value.toFixed(4)).join()

            if (!welded.has(key)) {
                welded.set(key, heights.length)
                heights.push(position.getY(vertex))
            }

            return welded.get(key)!
        }
        const edges = new Map<string, number>()

        for (let at = 0; at < index.count; at += 3) {
            const corners = [weld(index.getX(at)), weld(index.getX(at + 1)), weld(index.getX(at + 2))]

            corners.forEach((corner, side) => {
                const next = corners[(side + 1) % 3]
                const key = corner < next ? `${corner}-${next}` : `${next}-${corner}`

                edges.set(key, (edges.get(key) ?? 0) + 1)
            })
        }

        for (const [key, uses] of edges) {
            if (uses === 1) {
                const top = Math.max(...key.split('-').map((corner) => heights[Number(corner)]))

                expect(top).toBeGreaterThan(0.05)
            }
        }
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

    it.each(['plated', 'ringed', 'banded', 'peeling', 'fibrous'] as const)('faces every bit of wood outwards, even with the %s pattern at its finest and deepest', (barkPattern) => {
        const tree: PaintedTreeParameters = {...paintedTreeDefaults, barkPattern, patternScale: 0.6, patternDepth: 1}
        const bark = buildBark(planPaintedTree(tree, 301), tree, 301, 0.68)
        const position = bark.getAttribute('position')
        const normal = bark.getAttribute('normal')
        const index = bark.index!
        const [a, b, c, face, corners, corner] = Array.from({length: 6}, () => new THREE.Vector3())
        let inward = 0

        for (let at = 0; at < index.count; at += 3) {
            const [ia, ib, ic] = [index.getX(at), index.getX(at + 1), index.getX(at + 2)]

            a.fromBufferAttribute(position, ia)
            b.fromBufferAttribute(position, ib)
            c.fromBufferAttribute(position, ic)
            face.crossVectors(b.sub(a), c.sub(a))
            corners.fromBufferAttribute(normal, ia).add(corner.fromBufferAttribute(normal, ib)).add(corner.fromBufferAttribute(normal, ic))

            if (face.dot(corners) < -1e-9) {
                inward++
            }
        }

        expect(inward).toBe(0)
    })

    describe('the bark texture', () => {
        const tree: PaintedTreeParameters = {...paintedTreeDefaults, barkPattern: 'plated', patternDepth: 0}

        /** How many texture repeats a metre of wood takes, among the faces a test picks. */
        function repeatsPerMetre(bark: THREE.BufferGeometry, wanted: (y: number) => boolean): number {
            const position = bark.getAttribute('position')
            const uv = bark.getAttribute('uv')
            const index = bark.index!
            let metres = 0
            let repeats = 0

            for (let at = 0; at < index.count; at += 3) {
                const a = index.getX(at)
                const b = index.getX(at + 1)

                if (wanted(position.getY(a))) {
                    metres += Math.hypot(position.getX(a) - position.getX(b), position.getY(a) - position.getY(b), position.getZ(a) - position.getZ(b))
                    repeats += Math.hypot(uv.getX(a) - uv.getX(b), uv.getY(a) - uv.getY(b))
                }
            }

            return repeats / metres
        }

        it('makes its marks smaller on thin limbs than on the trunk', () => {
            const plan = planPaintedTree(tree, 7)
            const bark = buildBark(plan, tree, 7, 1)
            const fork = plan.limbs[0].points[plan.limbs[0].points.length - 1][1]

            expect(repeatsPerMetre(bark, (y) => y > fork * 1.3)).toBeGreaterThan(repeatsPerMetre(bark, (y) => y < fork * 0.5))
        })

        it('closes around the wood, with almost no face stretched across the texture', () => {
            const bark = buildBark(planPaintedTree(tree, 7), tree, 7, 1)
            const index = bark.index!
            const us = bark.getAttribute('uv')
            let stretched = 0

            for (let at = 0; at < index.count; at += 3) {
                const corners = [us.getX(index.getX(at)), us.getX(index.getX(at + 1)), us.getX(index.getX(at + 2))]

                if (Math.max(...corners) - Math.min(...corners) > 1.5) {
                    stretched++
                }
            }

            // A rounded end has a point the texture gathers at, and only that may stretch.
            expect(stretched / (index.count / 3)).toBeLessThan(0.02)
            expect(us.array.every(Number.isFinite)).toBe(true)
        })

        it('does not smear where the wood flares out past the start of a limb', () => {
            const bark = buildBark(planPaintedTree(tree, 7), tree, 7, 1)
            const position = bark.getAttribute('position')
            const us = bark.getAttribute('uv')
            const along = new Set<number>()

            for (let at = 0; at < position.count; at++) {
                if (position.getY(at) < 0.1) {
                    along.add(Math.round(us.getY(at) * 100))
                }
            }

            expect(along.size).toBeGreaterThan(10)
        })

        it('makes marks bigger as Bark size rises, without changing the wood', () => {
            const plan = planPaintedTree(tree, 7)
            const normal = buildBark(plan, {...tree, patternScale: 1}, 7, 1)
            const large = buildBark(plan, {...tree, patternScale: 2}, 7, 1)
            const low = (y: number) => y < 1

            expect(repeatsPerMetre(large, low)).toBeLessThan(repeatsPerMetre(normal, low))
            expect(large.index!.count).toBe(normal.index!.count)
        })
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
            // All but the old-style tree, which stays only for the props made from it.
            expect(presetGroups.flatMap((group) => group.presets).map((preset) => preset.id).sort()).toEqual(
                treePresets.map((preset) => preset.id).filter((id) => id !== 'round-canopy').sort(),
            )
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

    it('starts a tube inside the sculpted wood it carries on from, so the two never lie on top of each other', () => {
        const tree = {...treePresets.find((preset) => preset.id === 'aspen')!.parameters, trunkRadius: 0.45} as PaintedTreeParameters
        const plan = planPaintedTree(tree, 304)
        const context = prepareBark(plan, tree, 304, 1)
        const positions = buildBark(plan, tree, 304, 1).getAttribute('position')
        let joins = 0

        for (const limb of plan.limbs) {
            let start = 0

            while (start < limb.points.length - 1 && context.isSculpted(limb, start)) {
                start++
            }

            if (start === 0 || start >= limb.points.length - 1) {
                continue
            }

            joins++

            const radius = limb.radii[start - 1]
            const ring = ringAround(positions, limb.points, start - 1, radius * 1.2)

            expect(ring.some((out) => Math.abs(out - radius * 0.8) < 1e-5), limb.key).toBe(true)
            expect(ring.some((out) => Math.abs(out - radius) < 1e-5), limb.key).toBe(false)
        }

        expect(joins).toBeGreaterThan(3)
    })

    it('never lets a thin branch start thicker than the wood it grows out of', () => {
        for (const preset of treePresets.filter((preset) => ['aspen', 'birch', 'oak'].includes(preset.id))) {
            const tree = preset.parameters as unknown as PaintedTreeParameters
            const plan = planPaintedTree(tree, preset.seed)
            const context = prepareBark(plan, tree, preset.seed, 1)
            const positions = buildBark(plan, tree, preset.seed, 1).getAttribute('position')

            for (const limb of plan.limbs.filter((limb) => limb.level > 1 && !context.isSculpted(limb, 0))) {
                const host = Math.min(
                    ...plan.limbs
                        .filter((other) => other.level < limb.level)
                        .flatMap((other) => other.points.map((point, index) => ({point, radius: other.radii[index]})))
                        .sort((a, b) => distance(a.point, limb.points[0]) - distance(b.point, limb.points[0]))
                        .slice(0, 1)
                        .map(({radius}) => radius),
                )
                const ring = ringAround(positions, limb.points, 0, limb.radii[0] * 1.2)

                expect(ring.some((out) => Math.abs(out - Math.min(limb.radii[0], host * 0.5)) < 1e-5), `${preset.id} ${limb.key}`).toBe(true)

                if (limb.radii[0] > host * 0.5) {
                    expect(ring.some((out) => Math.abs(out - limb.radii[0]) < 1e-5), `${preset.id} ${limb.key}`).toBe(false)
                }
            }
        }
    })

    it('means what Height says, whatever the crown shape', () => {
        for (const crownShape of CROWN_SHAPES) {
            for (const seed of [1, 7, 12]) {
                const plan = planPaintedTree({...paintedTreeDefaults, crownShape}, seed)
                const top = Math.max(...plan.clumps.map((c) => c.centre[1] + c.radius * c.flatten))

                expect(Math.abs(top - 8) / 8, `${crownShape}, seed ${seed}`).toBeLessThan(0.05)
            }
        }
    })

    it('grows each crown shape into the outline its name says', () => {
        const measure = (crownShape: CrownShape) => {
            let width = 0
            let height = 0
            let low = 0
            let high = 0

            for (let seed = 1; seed <= 12; seed++) {
                const clumps = planPaintedTree({...paintedTreeDefaults, crownShape}, seed).clumps
                const bottom = Math.min(...clumps.map((c) => c.centre[1] - c.radius * c.flatten))
                const top = Math.max(...clumps.map((c) => c.centre[1] + c.radius * c.flatten))
                const reach = (keep: (y: number) => boolean) =>
                    Math.max(0, ...clumps.filter((c) => keep(c.centre[1])).map((c) => Math.hypot(c.centre[0], c.centre[2]) + c.radius))

                width += reach(() => true)
                height += top - bottom
                low += reach((y) => y < (bottom + top) / 2)
                high += reach((y) => y >= (bottom + top) / 2)
            }

            return {width, height, taper: low / high}
        }
        const natural = measure('natural')

        expect(measure('column').width).toBeLessThan(natural.width * 0.65)
        expect(measure('column').height).toBeGreaterThan(natural.height)
        expect(measure('wide').width).toBeGreaterThan(natural.width * 1.15)
        expect(measure('umbrella').height).toBeLessThan(natural.height * 0.8)
        expect(measure('umbrella').taper).toBeLessThan(natural.taper)
        expect(measure('cone').taper).toBeGreaterThan(natural.taper * 1.3)
        expect(measure('teardrop').taper).toBeGreaterThan(natural.taper * 1.1)
    })

    it('starts every limb on the one it grows from, whatever the crown shape', () => {
        const parentOf = (key: string) => (key.match(/^(l\d+(?:b\d+)?)[bt]\d+$/)?.[1] ?? 't')
        const distanceToPath = (point: readonly number[], path: readonly (readonly number[])[]) =>
            Math.min(
                ...path.slice(1).map((b, index) => {
                    const a = path[index]
                    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
                    const t = Math.min(Math.max(((point[0] - a[0]) * ab[0] + (point[1] - a[1]) * ab[1] + (point[2] - a[2]) * ab[2]) / Math.max(ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2, 1e-12), 0), 1)

                    return Math.hypot(point[0] - a[0] - ab[0] * t, point[1] - a[1] - ab[1] * t, point[2] - a[2] - ab[2] * t)
                }),
            )

        for (const crownShape of CROWN_SHAPES) {
            const {limbs} = planPaintedTree({...paintedTreeDefaults, crownShape}, 5)
            const byKey = new Map(limbs.map((limb) => [limb.key, limb]))

            for (const limb of limbs.filter((limb) => limb.key.startsWith('l'))) {
                const parent = byKey.get(parentOf(limb.key))!

                expect(distanceToPath(limb.points[0], parent.points), `${crownShape}: ${limb.key}`).toBeLessThan(1e-6)
            }
        }
    })

    it('opens a tree saved before Crown shape existed as a natural crown', () => {
        const older: Record<string, unknown> = {...paintedTreeDefaults}

        delete older.crownShape

        expect(validatePaintedTreeParameters(older).parameters.crownShape).toBe('natural')
    })

    it('leaves palms and conifers alone, whatever crown shape is set', () => {
        for (const form of ['palm', 'conifer'] as const) {
            const natural = planPaintedTree({...paintedTreeDefaults, form}, 4)
            const column = planPaintedTree({...paintedTreeDefaults, form, crownShape: 'column'}, 4)

            expect(column.limbs.map((limb) => limb.points)).toEqual(natural.limbs.map((limb) => limb.points))
            expect(column.clumps.map((clump) => clump.centre)).toEqual(natural.clumps.map((clump) => clump.centre))
            expect(controlsForTree(paintedTreeParameterSpecs, {form}).map((spec) => spec.key)).not.toContain('crownShape')
        }
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
