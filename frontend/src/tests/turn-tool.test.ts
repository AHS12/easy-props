import * as THREE from 'three'
import {beforeEach, describe, expect, it} from 'vitest'
import {findCommand} from '../core/commands/commands'
import {canUndo, EMPTY_HISTORY} from '../core/history/history'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {findComponent} from '../core/scene/scene-model'
import {canTurn, turnedAbout, turnOf, turnPivotOf} from '../core/scene/turning'
import {useEditorStore} from '../store/editor-store'
import {pointerAngle} from '../viewport/scene/turn-gizmo'

const store = () => useEditorStore.getState()
const turnCommand = findCommand('tool-turn')!

beforeEach(() => {
    const scene = createSceneFromPreset('oak')

    useEditorStore.setState({scene, savedScene: scene, history: EMPTY_HISTORY, moveTool: false, turnTool: false})
    store().deselect()
})

const firstBranch = () =>
    store().scene.assets[0].components.find((part) => part.generatorId === 'painted-limb' && part.parameters.key !== 't')!

describe('the Turn tool', () => {
    it('turns a branch or a root, but not the trunk or a leaf clump', () => {
        const scene = store().scene

        expect(canTurn(scene, firstBranch().id)).toBe(true)
        expect(canTurn(scene, 'cmp-limb-t')).toBe(false)
        expect(canTurn(scene, scene.assets[0].components.find((part) => part.generatorId === 'painted-clump')!.id)).toBe(false)
    })

    it('says why it is unavailable', () => {
        expect(turnCommand.unavailable?.(store())).toBe('Select a part first')

        store().select('cmp-limb-t')
        expect(turnCommand.unavailable?.(store())).toBe('This part is the whole prop. Use Lean to tip it')

        store().select(firstBranch().id)
        expect(turnCommand.unavailable?.(store())).toBeNull()
    })

    it('puts Move down when it is picked up, and the other way round', () => {
        store().setMoveTool(true)
        store().setTurnTool(true)
        expect(store().moveTool).toBe(false)

        store().setMoveTool(true)
        expect(store().turnTool).toBe(false)
    })

    it('makes one drag one step to undo', () => {
        const id = firstBranch().id
        const before = store().scene

        store().previewTurn(id, [0, 10, 0])
        store().previewTurn(id, [0, 20, 0])
        store().commitTurn(before, id, [0, 30, 0])

        expect(turnOf(store().scene, id)).toEqual([0, 30, 0])

        store().undo()
        expect(turnOf(store().scene, id)).toEqual([0, 0, 0])
        expect(canUndo(store().history)).toBe(false)
    })

    it('turns around where the branch leaves its parent, which a turn never moves', () => {
        const id = firstBranch().id
        const pivot = turnPivotOf(store().scene, id)!

        store().commitTurn(store().scene, id, [20, 45, 0])

        expect(turnPivotOf(store().scene, id)).toEqual(pivot)
        expect(findComponent(store().scene, id)).toBeDefined()
    })
})

describe('turning further about an axis', () => {
    it('adds to that axis alone when nothing else is turned', () => {
        expect(turnedAbout([0, 0, 0], [0, 1, 0], Math.PI / 4)).toEqual([0, 45, 0])
        expect(turnedAbout([0, 30, 0], [0, 1, 0], Math.PI / 6)).toEqual([0, 60, 0])
    })

    it('turns about the world axis, whatever the part was turned by before', () => {
        const tilted: [number, number, number] = [30, 0, 0]
        const turned = turnedAbout(tilted, [0, 1, 0], Math.PI / 2)
        const order = ([x, y, z]: readonly number[]) =>
            new THREE.Quaternion().setFromEuler(
                new THREE.Euler(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z), 'ZYX'),
            )
        const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).multiply(order(tilted))
        const point = new THREE.Vector3(1, 0.2, 0.3)

        expect(point.clone().applyQuaternion(order(turned)).distanceTo(point.clone().applyQuaternion(expected))).toBeLessThan(0.01)
    })

    it('comes back to nothing when turned back', () => {
        const there = turnedAbout([10, 20, 30], [1, 1, 0], 0.8)

        expect(turnedAbout(there, [1, 1, 0], -0.8).map((angle) => Math.round(angle))).toEqual([10, 20, 30])
    })
})

describe('dragging around a ring', () => {
    const origin = new THREE.Vector3()
    const centre = {x: 100, y: 100}
    const above = new THREE.PerspectiveCamera()

    above.position.set(0, 10, 0)

    it('counts anticlockwise as forward when the axis points at the camera', () => {
        const right = pointerAngle(150, 100, centre, new THREE.Vector3(0, 1, 0), origin, above)
        const top = pointerAngle(100, 50, centre, new THREE.Vector3(0, 1, 0), origin, above)

        expect(top - right).toBeCloseTo(Math.PI / 2)
    })

    it('counts the other way when the axis points away', () => {
        const right = pointerAngle(150, 100, centre, new THREE.Vector3(0, -1, 0), origin, above)
        const top = pointerAngle(100, 50, centre, new THREE.Vector3(0, -1, 0), origin, above)

        expect(top - right).toBeCloseTo(-Math.PI / 2)
    })
})
