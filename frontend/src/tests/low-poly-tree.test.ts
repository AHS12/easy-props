import {describe, expect, it} from 'vitest'
import * as THREE from 'three'
import {findComponentGenerator} from '../assets/component-generators'
import {generatePropComponents} from '../assets/prop-generators'
import {RIGID_ATTRIBUTE} from '../assets/shared/generator-types'
import {createSeededRandom} from '../assets/shared/random'
import {getStyleProfile} from '../assets/style/style-profiles'
import {controlsForTree, paintedTreeParameterSpecs, planPaintedTree, validatePaintedTreeParameters, type PaintedTreeParameters} from '../assets/trees/painted'
import {buildLowPolyWood, clumpField, crownShapes, lowPolyCrown} from '../assets/trees/painted/low-poly-surface'
import {edgeUse} from './mesh-checks'
import {findPreset} from '../assets/trees/presets'
import {useEditorStore} from '../store/editor-store'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {setComponentPosition, updateTreeParameters} from '../core/scene/scene-ops'
import {createComponentRenderer} from '../viewport/scene/component-renderer'
import {holdLowPolyCrown} from '../assets/trees/painted'

const STYLE = getStyleProfile('detailed')

function presetTree(id: string, build: 'painted' | 'low-poly'): {tree: PaintedTreeParameters; seed: number} {
    const preset = findPreset(id)!

    return {tree: validatePaintedTreeParameters({...preset.parameters, build}).parameters, seed: preset.seed}
}

function buildParts({tree, seed}: {tree: PaintedTreeParameters; seed: number}, detail = 1) {
    return generatePropComponents('painted-tree', tree as unknown as Record<string, unknown>, seed, STYLE).map((component) => {
        const generator = findComponentGenerator(component.generatorId)!

        return {
            component,
            part: generator.generate(generator.validate(component.parameters).parameters, {
                random: createSeededRandom(component.seed),
                seed: component.seed,
                style: STYLE,
                detail,
            }),
        }
    })
}

const shown = (parts: ReturnType<typeof buildParts>) => parts.filter(({part}) => !part.surface?.proxy)

const triangles = (parts: ReturnType<typeof buildParts>) =>
    shown(parts).reduce((sum, {part}) => sum + (part.geometry.index?.count ?? part.geometry.getAttribute('position').count) / 3, 0)

describe('a low-poly tree', {timeout: 60000}, () => {
    it('is the same tree, with the same parts in the same places', () => {
        const painted = buildParts(presetTree('spring-tree', 'painted'))
        const low = buildParts(presetTree('spring-tree', 'low-poly'))

        expect(low.map(({component}) => component.id)).toEqual(painted.map(({component}) => component.id))
        expect(low.map(({component}) => component.transform.position)).toEqual(painted.map(({component}) => component.transform.position))
    })

    it('costs far fewer faces than the painted one', () => {
        for (const id of ['spring-tree', 'oak', 'spruce', 'coconut-palm', 'willow']) {
            const painted = triangles(buildParts(presetTree(id, 'painted')))
            const low = triangles(buildParts(presetTree(id, 'low-poly')))

            expect(low, id).toBeLessThan(painted / 2)
        }
    })

    it('gives every face one colour and one facing, so its facets show', () => {
        for (const {part} of shown(buildParts(presetTree('apple', 'low-poly')))) {
            const position = part.geometry.getAttribute('position')
            const normal = part.geometry.getAttribute('normal')
            const colour = part.geometry.getAttribute('color')

            expect(part.geometry.index).toBeNull()

            for (let at = 0; at < position.count; at += 3) {
                for (let k = 1; k < 3; k++) {
                    expect(normal.getX(at + k)).toBeCloseTo(normal.getX(at), 5)
                    expect(normal.getY(at + k)).toBeCloseTo(normal.getY(at), 5)
                    expect(colour.getX(at + k)).toBeCloseTo(colour.getX(at), 5)
                }
            }
        }
    })

    it('draws nothing from a picture', () => {
        for (const {part} of shown(buildParts(presetTree('willow', 'low-poly')))) {
            expect(part.surface?.map).toBeUndefined()
            expect(part.surface?.alphaTest).toBeUndefined()
        }
    })

    it('sways its blocks of leaves whole, so the wind never splits their facets', () => {
        const clump = shown(buildParts(presetTree('spring-tree', 'low-poly'))).find(({part}) => part.role === 'foliage')!
        const rigid = clump.part.geometry.getAttribute(RIGID_ATTRIBUTE)

        expect(rigid).toBeDefined()
        expect(Array.from(rigid.array).every((value) => value === 1)).toBe(true)
    })

    it('comes out the same every time from the same settings', () => {
        const first = buildParts(presetTree('oak', 'low-poly'))
        const second = buildParts(presetTree('oak', 'low-poly'))

        shown(first).forEach(({part}, index) => {
            expect(Array.from(part.geometry.getAttribute('position').array)).toEqual(
                Array.from(shown(second)[index].part.geometry.getAttribute('position').array),
            )
        })
    })

    it('keeps fewer branches at a lighter detail level', () => {
        expect(triangles(buildParts(presetTree('oak', 'low-poly'), 0.2))).toBeLessThan(triangles(buildParts(presetTree('oak', 'low-poly'))))
    })

    it('keeps its fronds full at a lighter detail level, with fewer and wider leaflets', () => {
        const leafArea = (parts: ReturnType<typeof buildParts>) =>
            shown(parts)
                .filter(({component}) => !component.generatorId.includes('bark'))
                .reduce((sum, {part}) => {
                    const position = part.geometry.getAttribute('position')
                    const corner = (i: number) => new THREE.Vector3().fromBufferAttribute(position, i)

                    for (let at = 0; at < position.count; at += 3) {
                        sum += new THREE.Triangle(corner(at), corner(at + 1), corner(at + 2)).getArea()
                    }

                    return sum
                }, 0)

        for (const id of ['coconut-palm-painted', 'fan-palm', 'tree-fern']) {
            const full = buildParts(presetTree(id, 'low-poly'))
            const light = buildParts(presetTree(id, 'low-poly'), 0.12)

            expect(triangles(light), id).toBeLessThan(triangles(full))
            expect(leafArea(light) / leafArea(full), id).toBeGreaterThan(0.6)
        }
    })

    /** Flat faces welded where their corners meet, so edges can be counted. */
    const welded = (positions: ArrayLike<number>) => {
        const ids = new Map<string, number>()

        return Array.from({length: positions.length / 3}, (_, index) => {
            const key = [0, 1, 2].map((axis) => Math.round(positions[index * 3 + axis] * 1e4)).join()

            if (!ids.has(key)) {
                ids.set(key, ids.size)
            }

            return ids.get(key)!
        })
    }

    /**
     * No hole anywhere: every edge has faces on both sides. Where two pieces
     * almost touch inside one grid cell, an edge can be shared by four faces,
     * which is still closed and cannot be seen, so a few are allowed.
     */
    const closed = (use: readonly number[]) =>
        use.every((count) => count % 2 === 0) && use.filter((count) => count !== 2).length < use.length * 0.01

    it('makes its wood one closed surface, so no limb is pushed through another', () => {
        for (const id of ['oak', 'aspen', 'spruce']) {
            const {tree, seed} = presetTree(id, 'low-poly')
            const wood = buildLowPolyWood(planPaintedTree(tree, seed), tree, seed, 1)
            const use = [...edgeUse(welded(wood.getAttribute('position').array)).values()]

            expect(closed(use), id).toBe(true)
        }
    })

    it('melts its clumps into one closed crown, each clump owning its share', () => {
        for (const id of ['spring-tree', 'oak', 'willow']) {
            const {tree, seed} = presetTree(id, 'low-poly')
            const crown = lowPolyCrown(planPaintedTree(tree, seed), tree, seed, 1)
            const all = [...crown.faces.values()].flatMap((faces) => Array.from(faces))
            const use = [...edgeUse(welded(all)).values()]

            expect(crown.faces.size, id).toBeGreaterThan(5)
            expect([...crown.faces.values()].every((faces) => faces.length > 0), id).toBe(true)
            expect(closed(use), id).toBe(true)
        }
    })

    it('stacks a conifer into one closed crown, with no sky showing between its tiers', () => {
        for (const id of ['spruce', 'fir', 'cypress', 'christmas']) {
            const {tree, seed} = presetTree(id, 'low-poly')
            const plan = planPaintedTree(tree, seed)
            const crown = lowPolyCrown(plan, tree, seed, 1)
            const {shapes} = crownShapes(plan, tree)
            const leavesAt = (x: number, y: number, z: number) => Math.min(...shapes.map((shape) => shape.distance(x, y, z)))
            const tiers = plan.clumps.filter((clump) => clump.kind === 'mass').sort((a, b) => a.centre[1] - b.centre[1])
            const far = tiers[0].radius * 1.6
            const low = tiers[0].centre[1]
            const high = tiers[tiers.length - 1].centre[1]

            expect(closed([...edgeUse(welded([...crown.faces.values()].flatMap((faces) => Array.from(faces)))).values()]), id).toBe(true)

            // Looked at from the side, level, at every height from the lowest tier to the top one.
            for (let step = 0; step <= 40; step++) {
                const y = low + ((high - low) * step) / 40
                const [x, , z] = plan.limbs[0].points.reduce((best, point) => (Math.abs(point[1] - y) < Math.abs(best[1] - y) ? point : best))

                for (let turn = 0; turn < 12; turn++) {
                    const angle = (turn / 12) * Math.PI * 2
                    let blocked = false

                    for (let reach = far; reach >= 0 && !blocked; reach -= 0.04) {
                        blocked = leavesAt(x + Math.cos(angle) * reach, y, z + Math.sin(angle) * reach) < 0
                    }

                    expect(blocked, `${id} at ${y.toFixed(2)} m`).toBe(true)
                }
            }
        }
    })

    it('turns hardly any face of a conifer inside out', () => {
        for (const id of ['spruce', 'fir', 'snow-pine', 'christmas', 'larch']) {
            const {tree, seed} = presetTree(id, 'low-poly')
            const plan = planPaintedTree(tree, seed)
            const {shapes} = crownShapes(plan, tree)
            const leavesAt = (x: number, y: number, z: number) => Math.min(...shapes.map((shape) => shape.distance(x, y, z)))
            const faces = [...lowPolyCrown(plan, tree, seed, 1).faces.values()].flatMap((own) => Array.from(own))
            let inward = 0

            for (let at = 0; at < faces.length; at += 9) {
                const [a, b, c] = [0, 3, 6].map((k) => new THREE.Vector3(faces[at + k], faces[at + k + 1], faces[at + k + 2]))
                const facing = b.clone().sub(a).cross(c.clone().sub(a)).normalize()
                const middle = a.clone().add(b).add(c).divideScalar(3)
                const out = new THREE.Vector3(
                    leavesAt(middle.x + 0.01, middle.y, middle.z) - leavesAt(middle.x - 0.01, middle.y, middle.z),
                    leavesAt(middle.x, middle.y + 0.01, middle.z) - leavesAt(middle.x, middle.y - 0.01, middle.z),
                    leavesAt(middle.x, middle.y, middle.z + 0.01) - leavesAt(middle.x, middle.y, middle.z - 0.01),
                ).normalize()

                if (facing.dot(out) < -0.3) {
                    inward++
                }
            }

            expect(inward / (faces.length / 9), id).toBeLessThan(0.02)
        }
    })

    it('never sinks the leaves of one clump into another', () => {
        const {tree, seed} = presetTree('spring-tree', 'low-poly')
        const plan = planPaintedTree(tree, seed)
        const shapes = plan.clumps.map((clump) => clumpField(clump, tree))
        const typical = plan.clumps.reduce((sum, clump) => sum + clump.radius, 0) / plan.clumps.length

        for (const [key, faces] of lowPolyCrown(plan, tree, seed, 1).faces) {
            for (let at = 0; at < faces.length; at += 9) {
                const middle = [0, 1, 2].map((axis) => (faces[at + axis] + faces[at + 3 + axis] + faces[at + 6 + axis]) / 3)

                for (const shape of shapes.filter((other) => other.clump.key !== key)) {
                    expect(shape.distance(middle[0], middle[1], middle[2])).toBeGreaterThan(-typical * 0.15)
                }
            }
        }
    })

    it('moves a clump whole and quickly while a drag holds the crown, and melts the crown again after', () => {
        const renderer = createComponentRenderer()
        const start = createSceneFromPreset('spring-tree')
        let scene = updateTreeParameters(start, start.assets[0].id, {build: 'low-poly'}, STYLE)
        const clump = scene.assets[0].components.find((component) => component.generatorId === 'painted-clump')!
        const shapeOf = () => Array.from(renderer.all().find((part) => part.id === clump.id)!.mesh.geometry.getAttribute('position').array)
        const [x, y, z] = clump.transform.position

        renderer.sync(scene, STYLE, 'lit')

        const before = shapeOf()
        const steps: number[] = []

        holdLowPolyCrown(true)

        for (let step = 1; step <= 4; step++) {
            scene = setComponentPosition(scene, clump.id, [x + step * 0.2, y, z])

            const started = performance.now()

            renderer.sync(scene, STYLE, 'lit')
            steps.push(performance.now() - started)
        }

        // The first step builds the held wood once. The rest only move the clump.
        expect(Math.max(...steps.slice(1))).toBeLessThan(100)
        expect(shapeOf()).toEqual(before)

        holdLowPolyCrown(false)
        renderer.sync(scene, STYLE, 'lit')

        expect(shapeOf()).not.toEqual(before)
    })

    it('hides the controls that only shape leaf cards and carved bark', () => {
        const keys = (build: string) => controlsForTree(paintedTreeParameterSpecs, {build}).map((spec) => spec.key)

        expect(keys('painted')).toEqual(expect.arrayContaining(['fullness', 'leafSize', 'barkPattern', 'ridgeDepth']))
        expect(keys('low-poly')).not.toEqual(expect.arrayContaining(['fullness']))
        expect(keys('low-poly')).not.toContain('barkPattern')
        expect(keys('low-poly')).toContain('clumpCount')
        // Style itself is the switch over the view, not a control in the panel.
        expect(keys('painted')).not.toContain('build')
    })

    it('stays low-poly when another tree, a rock or a bush is picked, and not on a prop without it', () => {
        const store = useEditorStore.getState()

        store.applyPreset('spring-tree')
        useEditorStore.getState().updateTreeParameters({build: 'low-poly'}, 'change build')
        useEditorStore.getState().applyPreset('oak')

        expect(useEditorStore.getState().scene.assets[0].parameters.build).toBe('low-poly')

        useEditorStore.getState().applyPreset('boulder')

        expect(useEditorStore.getState().scene.assets[0].parameters.build).toBe('low-poly')

        useEditorStore.getState().applyPreset('round-bush')

        expect(useEditorStore.getState().scene.assets[0].parameters.build).toBe('low-poly')

        useEditorStore.getState().applyPreset('round-canopy')

        expect(useEditorStore.getState().scene.assets[0].parameters.build).toBeUndefined()

        useEditorStore.getState().applyPreset('spring-tree')

        expect(useEditorStore.getState().scene.assets[0].parameters.build).toBe('painted')
    })

    it('is painted unless a tree says otherwise, so saved trees open as they were', () => {
        expect(validatePaintedTreeParameters({}).parameters.build).toBe('painted')
    })
})
