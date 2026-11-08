import {beforeEach, describe, expect, it} from 'vitest'
import {findPropGenerator} from '../assets/prop-generators'
import type {PaintedTreeParameters} from '../assets/trees/painted/parameters'
import {planPaintedTree, type Limb, type Vec3} from '../assets/trees/painted/plan'
import {findCommand} from '../core/commands/commands'
import {canUndo, EMPTY_HISTORY} from '../core/history/history'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {canResize, resizedBy, resizePivotOf, sizeOf} from '../core/scene/resizing'
import {findComponent} from '../core/scene/scene-model'
import {hintFor} from '../panels/status-hint'
import {useEditorStore} from '../store/editor-store'

const store = () => useEditorStore.getState()
const resizeCommand = findCommand('tool-resize')!

beforeEach(() => {
    const scene = createSceneFromPreset('oak')

    useEditorStore.setState({scene, savedScene: scene, history: EMPTY_HISTORY, moveTool: false, turnTool: false, resizeTool: false})
    store().deselect()
})

const parts = () => store().scene.assets[0].components
const heavyLimb = () => parts().find((part) => part.generatorId === 'painted-limb' && /^l\d+$/.test(String(part.parameters.key)))!
const firstClump = () => parts().find((part) => part.generatorId === 'painted-clump')!

function plan() {
    const asset = store().scene.assets[0]
    const tree = findPropGenerator(asset.generatorId)!.validate(asset.parameters).parameters as PaintedTreeParameters

    return planPaintedTree(tree, asset.seed)
}

const limbOf = (key: string) => plan().limbs.find((limb) => limb.key === key)!
const lengthOf = (limb: Limb) => limb.points.slice(1).reduce((sum, point, index) => sum + distance(point, limb.points[index]), 0)
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('the Resize tool', () => {
    it('resizes branches, roots and leaf clumps, but not the trunk', () => {
        const scene = store().scene

        expect(canResize(scene, heavyLimb().id)).toBe(true)
        expect(canResize(scene, firstClump().id)).toBe(true)
        expect(canResize(scene, 'cmp-limb-t')).toBe(false)
    })

    it('says why it is unavailable', () => {
        expect(resizeCommand.unavailable?.(store())).toBe('Select a part first')

        store().select('cmp-limb-t')
        expect(resizeCommand.unavailable?.(store())).toBe('This part is the whole prop. Use Height to size it')

        store().select(heavyLimb().id)
        expect(resizeCommand.unavailable?.(store())).toBeNull()
    })

    it('is on S, and puts Move and Turn down when it is picked up', () => {
        expect(resizeCommand.shortcut).toBe('S')

        store().setTurnTool(true)
        store().setResizeTool(true)
        expect(store().turnTool).toBe(false)

        store().setMoveTool(true)
        expect(store().resizeTool).toBe(false)
    })

    it('makes one drag one step to undo', () => {
        const id = heavyLimb().id
        const before = store().scene

        store().previewSize(id, 1.2)
        store().previewSize(id, 1.4)
        store().commitSize(before, id, 1.5)

        expect(sizeOf(store().scene, id)).toBe(1.5)

        store().undo()
        expect(sizeOf(store().scene, id)).toBe(1)
        expect(canUndo(store().history)).toBe(false)
    })

    it('leaves the tree untouched once a part is set back to its own size', () => {
        const id = heavyLimb().id

        store().commitSize(store().scene, id, 2)
        store().commitSize(store().scene, id, 1)

        expect(JSON.parse(String(store().scene.assets[0].parameters.edits)).limbs).toEqual({})
    })

    it('says how to use it in the status bar', () => {
        store().select(heavyLimb().id)

        expect(hintFor({...store(), resizeTool: true}, 'easy-props')).toContain('Drag the ring out to grow')
    })
})

describe('resizing a branch', () => {
    it('keeps its base where it leaves the trunk', () => {
        const id = heavyLimb().id
        const key = String(heavyLimb().parameters.key)
        const pivot = resizePivotOf(store().scene, id)!

        store().commitSize(store().scene, id, 2)

        expect(distance(limbOf(key).points[0], pivot)).toBeLessThan(1e-6)
        expect(resizePivotOf(store().scene, id)).toEqual(pivot)
    })

    it('makes it longer and thicker by the same amount', () => {
        const key = String(heavyLimb().parameters.key)
        const before = limbOf(key)

        store().commitSize(store().scene, heavyLimb().id, 2)

        const after = limbOf(key)

        expect(lengthOf(after) / lengthOf(before)).toBeCloseTo(2, 1)
        expect(after.radii[0] / before.radii[0]).toBeCloseTo(2, 5)
    })

    it('resizes the branches and leaves that grow on it', () => {
        const key = String(heavyLimb().parameters.key)
        const children = (from: ReturnType<typeof plan>) => from.limbs.filter((limb) => limb.key.startsWith(`${key}b`) && limb.level === 2)
        const before = children(plan())
        const clumpsBefore = plan().clumps

        store().commitSize(store().scene, heavyLimb().id, 1.5)

        const after = children(plan())

        expect(after.length).toBe(before.length)
        after.forEach((child, index) => {
            expect(lengthOf(child)).toBeGreaterThan(lengthOf(before[index]) * 1.2)
            expect(child.size).toBe(1.5)
        })
        expect(plan().clumps.some((clump, index) => clump.radius > clumpsBefore[index].radius * 1.2)).toBe(true)
    })

    it('opens at the same size once saved', () => {
        const id = heavyLimb().id

        store().commitSize(store().scene, id, 0.6)

        const saved = JSON.parse(JSON.stringify(store().scene))

        expect(findComponent(saved, id)?.parameters.sizeScale).toBe(0.6)
    })
})

describe('resizing a leaf clump', () => {
    it('grows around its middle, from its own Size', () => {
        const id = firstClump().id

        expect(resizePivotOf(store().scene, id)).toEqual(firstClump().transform.position)

        store().commitSize(store().scene, id, 1.8)
        expect(findComponent(store().scene, id)?.parameters.sizeScale).toBe(1.8)
    })
})

describe('the size a drag asks for', () => {
    const limits = {min: 0.25, max: 3}

    it('follows how far the pointer moved out from the base', () => {
        expect(resizedBy(1, 2, limits, false)).toBe(2)
        expect(resizedBy(1.5, 0.5, limits, false)).toBe(0.75)
    })

    it('stays within the part’s limits', () => {
        expect(resizedBy(1, 10, limits, false)).toBe(3)
        expect(resizedBy(1, 0, limits, false)).toBe(0.25)
    })

    it('snaps to tenths with Shift', () => {
        expect(resizedBy(1, 1.234, limits, true)).toBe(1.2)
        expect(resizedBy(1, 1.234, limits, false)).toBe(1.23)
    })
})
