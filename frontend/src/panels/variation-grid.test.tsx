import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {batchItems} from '../core/export/batch-items'
import {canUndo, EMPTY_HISTORY} from '../core/history/history'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {damageSettings, OTHERS_PER_PAGE, pageDamages, pageSeeds} from '../core/scene/variations'
import {useEditorStore} from '../store/editor-store'
import {useUiStore} from '../store/ui-store'
import {VariationGrid} from './VariationGrid'

const drawn = vi.hoisted(() => ({seeds: [] as number[]}))

// Tests have no graphics card, so each picture is just its seed.
vi.mock('../core/export/tree-thumbnail', () => ({
    renderTreeThumbnail: async (scene: {assets: {seed: number}[]}) => {
        drawn.seeds.push(scene.assets[0].seed)

        return `data:image/png;base64,${scene.assets[0].seed}`
    },
}))

const store = () => useEditorStore.getState()

beforeEach(() => {
    const scene = createSceneFromPreset('boulder')

    drawn.seeds = []
    useEditorStore.setState({scene, savedScene: scene, history: EMPTY_HISTORY, style: 'low-poly', treeName: 'Boulder', batchPicked: null, batchOpen: false})
})

afterEach(() => {
    cleanup()
    useUiStore.setState({variationsOpen: false})
})

describe('the seeds Show me more offers', () => {
    it('are the same each time for the same prop', () => {
        expect(pageSeeds(301, 0)).toEqual(pageSeeds(301, 0))
        expect(pageSeeds(301, 0)).toHaveLength(OTHERS_PER_PAGE)
    })

    it('are new on each page, and never the prop as it is', () => {
        const first = pageSeeds(301, 0)
        const second = pageSeeds(301, 1)

        expect(new Set([...first, ...second]).size).toBe(OTHERS_PER_PAGE * 2)
        expect([...first, ...second]).not.toContain(301)
    })
})

describe('the damaged versions Show me more offers', () => {
    const rock = () => store().scene.assets[0]

    it('are the same each time, on the prop’s own seed, each with some damage', () => {
        const settings = damageSettings(rock().generatorId, rock().parameters)
        const versions = pageDamages(301, 0, settings)

        expect(settings.map(({key}) => key)).toEqual(['cracks', 'crumble'])
        expect(pageDamages(301, 0, settings)).toEqual(versions)
        expect(versions).toHaveLength(OTHERS_PER_PAGE)
        expect(versions.every((version) => version.seed === 301)).toBe(true)
        expect(versions.every((version) => Object.values(version.damage!).some((value) => value > 0))).toBe(true)
    })

    it('are only offered for a prop that can be damaged', () => {
        expect(damageSettings('grass', {})).toEqual([])
        expect(pageDamages(301, 0, [])).toEqual([])
    })
})

describe('Show me more', () => {
    const open = async () => {
        render(<VariationGrid />)
        act(() => useUiStore.getState().setVariationsOpen(true))
        await waitFor(() => expect(document.querySelectorAll('.variation img')).toHaveLength(OTHERS_PER_PAGE + 1))
    }

    it('shows the prop as it is now in the middle of the others', async () => {
        const seed = store().scene.assets[0].seed

        await open()

        expect(screen.getByRole('button', {name: `Keep this one, seed ${seed}`})).toBeInTheDocument()
        expect(screen.getByText('Now')).toBeInTheDocument()
    })

    it('uses a picked version as one step to undo, and closes', async () => {
        const before = store().scene.assets[0].seed
        const [other] = pageSeeds(before, 0)

        await open()
        fireEvent.click(screen.getByRole('button', {name: `Use seed ${other}`}))

        expect(store().scene.assets[0].seed).toBe(other)
        expect(useUiStore.getState().variationsOpen).toBe(false)

        store().undo()
        expect(store().scene.assets[0].seed).toBe(before)
        expect(canUndo(store().history)).toBe(false)
    })

    it('shows new ones with More', async () => {
        const seed = store().scene.assets[0].seed

        await open()
        fireEvent.click(screen.getByRole('button', {name: 'More'}))

        await waitFor(() => expect(screen.getByRole('button', {name: `Use seed ${pageSeeds(seed, 1)[0]}`})).toBeInTheDocument())
    })

    it('shows how far the drawing has got, and hides the grid until it is done', async () => {
        render(<VariationGrid />)
        act(() => useUiStore.getState().setVariationsOpen(true))

        expect(screen.getByRole('status')).toHaveTextContent('Drawing versions of Boulder, 0 of 9')
        expect(screen.getByRole('button', {name: 'More'})).toBeDisabled()

        await waitFor(() => expect(screen.queryByText(/Drawing versions/)).toBeNull())
        expect(screen.getByRole('button', {name: 'More'})).toBeEnabled()
    })

    it('ticks every version on the page at once, and unticks them again', async () => {
        await open()
        fireEvent.click(screen.getByRole('button', {name: 'Tick all'}))

        expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(true)
        expect(screen.getByRole('button', {name: `Export these ${OTHERS_PER_PAGE + 1}`})).toBeEnabled()

        fireEvent.click(screen.getByRole('button', {name: 'Untick all'}))
        expect(screen.getAllByRole('checkbox').some((box) => (box as HTMLInputElement).checked)).toBe(false)
    })

    it('stays open on a click outside, so ticks are not lost', async () => {
        await open()
        fireEvent.click(screen.getAllByRole('checkbox')[0])

        const backdrop = document.querySelector('.dialog-backdrop')!

        fireEvent.pointerDown(backdrop)
        fireEvent.pointerUp(backdrop)
        fireEvent.click(backdrop)

        expect(useUiStore.getState().variationsOpen).toBe(true)

        fireEvent.keyDown(document.activeElement ?? document.body, {key: 'Escape'})
        await waitFor(() => expect(useUiStore.getState().variationsOpen).toBe(false))
    })

    it('stops drawing once closed', async () => {
        render(<VariationGrid />)
        act(() => useUiStore.getState().setVariationsOpen(true))
        act(() => useUiStore.getState().setVariationsOpen(false))

        await new Promise((resolve) => setTimeout(resolve, 100))

        expect(drawn.seeds.length).toBeLessThan(OTHERS_PER_PAGE + 1)
    })

    it('sends the ticked ones to Export many', async () => {
        const seed = store().scene.assets[0].seed
        const [first, second] = pageSeeds(seed, 0)

        await open()
        fireEvent.click(screen.getByRole('checkbox', {name: `Export seed ${first}`}))
        fireEvent.click(screen.getByRole('checkbox', {name: `Export seed ${second}`}))
        fireEvent.click(screen.getByRole('button', {name: 'Export these 2'}))

        const picked = store().batchPicked

        expect(store().batchOpen).toBe(true)
        expect(picked).toMatchObject({kind: 'versions', name: 'Boulder', versions: [{seed: first}, {seed: second}]})

        const items = batchItems([picked!], 1, {style: 'low-poly', appVersion: 'test', readInSavedProp: async () => ''})

        expect(items.map(({name}) => name)).toEqual(['boulder_01', 'boulder_02'])
        expect((await items[1].load()).describe().seed).toBe(second)
    })

    it('shows damaged versions of the prop, and uses the one picked', async () => {
        const seed = store().scene.assets[0].seed

        await open()
        fireEvent.click(screen.getByRole('radio', {name: 'Damaged'}))
        await waitFor(() => expect(screen.getAllByRole('button', {name: /^Use this damaged version/})).toHaveLength(OTHERS_PER_PAGE))
        await waitFor(() => expect(document.querySelectorAll('.variation img')).toHaveLength(OTHERS_PER_PAGE + 1))

        const [first] = pageDamages(seed, 0, damageSettings(store().scene.assets[0].generatorId, store().scene.assets[0].parameters))

        fireEvent.click(screen.getAllByRole('button', {name: /^Use this damaged version/})[0])

        expect(store().scene.assets[0].seed).toBe(seed)
        expect(store().scene.assets[0].parameters).toMatchObject(first.damage!)
        expect(canUndo(store().history)).toBe(true)
    })

    it('exports ticked damaged versions damaged', async () => {
        await open()
        fireEvent.click(screen.getByRole('radio', {name: 'Damaged'}))
        await waitFor(() => expect(screen.getAllByRole('checkbox', {name: /^Export this damaged version/})).toHaveLength(OTHERS_PER_PAGE))
        fireEvent.click(screen.getAllByRole('checkbox', {name: /^Export this damaged version/})[0])
        fireEvent.click(screen.getByRole('button', {name: 'Export these 1'}))

        const picked = store().batchPicked!
        const [item] = batchItems([picked], 1, {style: 'low-poly', appVersion: 'test', readInSavedProp: async () => ''})
        const damage = picked.kind === 'versions' ? picked.versions[0].damage! : {}

        expect(Object.values(damage).some((value) => value > 0)).toBe(true)
        expect((await item.load()).describe().parameters).toMatchObject(damage)
    })
})
