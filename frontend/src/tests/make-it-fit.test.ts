import {describe, expect, it} from 'vitest'
import {getStyleProfile} from '../assets/style/style-profiles'
import {findPropGenerator} from '../assets/prop-generators'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {countFaces, describeChanges, makeItFit} from '../core/export/make-it-fit'
import {canUndo, EMPTY_HISTORY} from '../core/history/history'
import {updateTreeParameters} from '../core/scene/scene-ops'
import {useEditorStore} from '../store/editor-store'
import {createComponentRenderer} from '../viewport/scene/component-renderer'

const STYLE = getStyleProfile('low-poly')

describe('Make it fit', () => {
    it.each([
        ['oak', 9000],
        ['boulder', 600],
        ['round-bush', 1500],
        ['grass-tuft', 600],
    ])('brings %s under %i faces', async (presetId, budget) => {
        const scene = createSceneFromPreset(presetId)
        const result = await makeItFit(scene, STYLE, budget)

        expect(result.fits).toBe(true)
        expect(result.faces).toBeLessThanOrEqual(budget)
        expect((await countFaces(result.scene, STYLE)).wood + (await countFaces(result.scene, STYLE)).leaves).toBe(result.faces)
        expect(result.changes.length).toBeGreaterThan(0)
    }, 60000)

    it('changes only as much as it needs to', async () => {
        const scene = createSceneFromPreset('oak')
        const before = await countFaces(scene, STYLE)
        const result = await makeItFit(scene, STYLE, before.wood + before.leaves - 500)

        // Leaf density alone is enough, and it stays well above its limit.
        expect(result.changes.map(({key}) => key)).toEqual(['fullness'])
        expect(result.changes[0].to).toBeGreaterThan(0.5)
    }, 60000)

    it('never goes past a limit, and says when that is not enough', async () => {
        const result = await makeItFit(createSceneFromPreset('oak'), STYLE, 100)
        const limits = new Map(findPropGenerator('painted-tree')!.fitControls!.map(({key, limit}) => [key, limit]))

        expect(result.fits).toBe(false)

        for (const change of result.changes) {
            expect(change.to).toBeGreaterThanOrEqual(limits.get(change.key)!)
        }
    }, 60000)

    it('leaves a prop already under budget alone', async () => {
        const scene = createSceneFromPreset('boulder')
        const result = await makeItFit(scene, STYLE, 1e6)

        expect(result.scene).toBe(scene)
        expect(result.changes).toEqual([])
    })

    it('stops when it runs out of time', async () => {
        let clock = 0
        const result = await makeItFit(createSceneFromPreset('oak'), STYLE, 100, {deadline: 1, now: () => clock++})

        expect(result.stopped).toBe(true)
    }, 60000)

    it('counts faces as the view does', async () => {
        for (const presetId of ['boulder', 'round-bush', 'round-canopy']) {
            const scene = createSceneFromPreset(presetId)
            const renderer = createComponentRenderer()

            renderer.sync(scene, STYLE, 'lit')

            const shown = renderer.all().reduce((sum, {mesh}) => {
                const geometry = mesh.geometry

                return mesh.userData.isProxy ? sum : sum + (geometry.index?.count ?? geometry.getAttribute('position').count) / 3
            }, 0)
            const counted = await countFaces(scene, STYLE)

            expect(counted.wood + counted.leaves).toBe(shown)
        }
    })

    it('is one step to undo, and says what changed', async () => {
        const store = () => useEditorStore.getState()
        const scene = createSceneFromPreset('boulder')

        useEditorStore.setState({scene, style: 'low-poly', history: EMPTY_HISTORY, budgetTarget: 'mobile', toast: null})
        useEditorStore.setState({scene: updateTreeParameters(scene, scene.assets[0].id, {faces: 1, chunks: 30}, STYLE)})
        await store().makeItFit()

        expect(store().toast?.message).toMatch(/^Faces 1 → .*\. Now [\d,]+ of 2,000 faces\.$/)
        expect(store().toast?.undoable).toBe(true)

        store().undo()
        expect(store().scene.assets[0].parameters.faces).toBe(1)
        expect(canUndo(store().history)).toBe(false)
    }, 60000)

    it('says what it changed in the controls’ own words', () => {
        expect(describeChanges([
            {key: 'fullness', label: 'Leaf density', from: 0.75, to: 0.5},
            {key: 'clumpCount', label: 'Clumps', from: 14, to: 9},
        ])).toBe('Leaf density 0.75 → 0.5, Clumps 14 → 9')
    })
})
