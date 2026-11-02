import {describe, expect, it} from 'vitest'
import {getStyleProfile} from '../assets/style/style-profiles'
import {findPropGenerator} from '../assets/prop-generators'
import {planPaintedTree, type Limb} from '../assets/trees/painted/plan'
import type {PaintedTreeParameters} from '../assets/trees/painted/parameters'
import {parseProject, serializeProject} from '../core/project/project-document'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {findComponent, type Scene} from '../core/scene/scene-model'
import {setComponentPosition, updateComponentParameters, updateTreeParameters} from '../core/scene/scene-ops'

const STYLE = getStyleProfile('detailed')

const treeOf = (scene: Scene) =>
    findPropGenerator('painted-tree')!.validate(scene.assets[0].parameters).parameters as PaintedTreeParameters

const planOf = (scene: Scene) => planPaintedTree(treeOf(scene), scene.assets[0].seed)

/** A big branch with branches of its own. */
function branchWithChildren(scene: Scene): Limb {
    const {limbs} = planOf(scene)

    return limbs.find((limb) => limb.level === 1 && limbs.some((other) => other.key.startsWith(`${limb.key}b`)))!
}

const near = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('turning a branch of a painted tree', () => {
    const scene = createSceneFromPreset('oak')
    const branch = branchWithChildren(scene)
    const turned = updateComponentParameters(scene, `cmp-limb-${branch.key}`, {turn: [0, 40, 0]})

    it('turns it around its base', () => {
        const after = planOf(turned).limbs.find((limb) => limb.key === branch.key)!

        expect(near(after.points[0], branch.points[0])).toBeLessThan(1e-9)
        expect(near(after.points.at(-1)!, branch.points.at(-1)!)).toBeGreaterThan(0.5)
        // A turn about the vertical keeps every point at its height.
        expect(after.points.at(-1)![1]).toBeCloseTo(branch.points.at(-1)![1], 6)
    })

    it('takes its branches and leaves with it', () => {
        const before = planOf(scene)
        const after = planOf(turned)
        const child = before.limbs.find((limb) => limb.key.startsWith(`${branch.key}b`))!
        const movedChild = after.limbs.find((limb) => limb.key === child.key)!
        const elsewhere = before.limbs.find((limb) => limb.level === 1 && limb.key !== branch.key)!

        expect(near(movedChild.points[0], child.points[0])).toBeGreaterThan(0.1)
        expect(near(after.limbs.find((limb) => limb.key === elsewhere.key)!.points[0], elsewhere.points[0])).toBeLessThan(1e-9)
    })

    it('shows the turn in Details, and keeps it when a slider moves', () => {
        expect(findComponent(turned, `cmp-limb-${branch.key}`)!.parameters.turn).toEqual([0, 40, 0])

        const taller = updateTreeParameters(turned, turned.assets[0].id, {height: 10}, STYLE)

        expect(findComponent(taller, `cmp-limb-${branch.key}`)!.parameters.turn).toEqual([0, 40, 0])
    })

    it('goes back to how the tree grew it at 0, 0, 0', () => {
        const back = updateComponentParameters(turned, `cmp-limb-${branch.key}`, {turn: [0, 0, 0]})

        expect(back.assets[0].parameters.edits).toBe('{"limbs":{},"clumps":{}}')
    })

    it('never turns the trunk, which Lean already does', () => {
        expect(updateComponentParameters(scene, 'cmp-limb-t', {turn: [10, 0, 0]})).toBe(scene)
    })

    it('is kept in a saved prop', () => {
        const text = serializeProject({scene: turned, name: 'Oak', style: 'detailed'})

        expect(findComponent(parseProject(text).scene, `cmp-limb-${branch.key}`)!.parameters.turn).toEqual([0, 40, 0])
    })
})

describe('moving a part of an older tree', () => {
    const scene = createSceneFromPreset('round-canopy')
    const part = scene.assets[0].components.find((component) => component.type === 'foliage-cluster')!
    const [x, y, z] = part.transform.position
    const moved = setComponentPosition(scene, part.id, [x + 1, y, z - 0.5])

    it('keeps its place when a slider changes the tree', () => {
        const taller = updateTreeParameters(moved, moved.assets[0].id, {height: 9}, STYLE)
        const fresh = updateTreeParameters(scene, scene.assets[0].id, {height: 9}, STYLE)
        const where = findComponent(taller, part.id)!.transform.position
        const generated = findComponent(fresh, part.id)!.transform.position

        expect(where[0]).toBeCloseTo(generated[0] + 1, 9)
        expect(where[1]).toBeCloseTo(generated[1], 9)
        expect(where[2]).toBeCloseTo(generated[2] - 0.5, 9)
    })

    it('adds up two moves', () => {
        const twice = setComponentPosition(moved, part.id, [x + 3, y, z - 0.5])

        expect(findComponent(twice, part.id)!.moved).toEqual([3, 0, -0.5])
    })

    it('is kept in a saved prop', () => {
        const text = serializeProject({scene: moved, name: 'Canopy', style: 'detailed'})

        expect(findComponent(parseProject(text).scene, part.id)!.moved).toEqual([1, 0, -0.5])
    })
})
