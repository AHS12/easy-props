import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {getStyleProfile} from '../../assets/style/style-profiles'
import {serializeProject} from '../project/project-document'
import {createSceneFromPreset} from '../scene/initial-scene'
import {batchItems, variationSeed, type BatchChoice} from './batch-items'
import {runBatch, type BatchItem} from './pipeline/batch'
import type {ExportFile} from './pipeline/types'
import {sceneExportSource} from './scene-source'

const SETTINGS = {engine: 'godot', levels: 3, collision: true, wind: true} as const
const CONTEXT = {
    style: 'low-poly',
    appVersion: 'test',
    readInSavedProp: () => Promise.reject(new Error('No such prop')),
} as const

async function run(items: readonly BatchItem[], signal?: AbortSignal) {
    const written: ExportFile[] = []
    const summary = await runBatch(items, {
        settings: SETTINGS,
        budget: 'mobile',
        signal,
        write: async (files) => {
            written.push(...files)
        },
    })

    return {summary, written}
}

// As in the export tests: jsdom has no canvas to write the leaf texture with.
beforeAll(() => {
    vi.stubGlobal('ImageData', class {
        constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {}
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
        () => ({putImageData() {}, drawImage() {}, scale() {}, translate() {}}) as never,
    )
    HTMLCanvasElement.prototype.toBlob = function (callback) {
        callback(new Blob([new Uint8Array([137, 80, 78, 71])], {type: 'image/png'}))
    }
})

afterAll(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('batch export', () => {
    it('numbers variations per name, carrying on across choices of that name', () => {
        const choices: BatchChoice[] = [
            {kind: 'preset', id: 'oak'},
            {kind: 'saved', id: 'a', name: 'Oak'},
            {kind: 'preset', id: 'birch'},
        ]

        expect(batchItems(choices, 2, CONTEXT).map((item) => item.name)).toEqual([
            'old_oak_01',
            'old_oak_02',
            'oak_01',
            'oak_02',
            'silver_birch_01',
            'silver_birch_02',
        ])
    })

    it('gives every variation its own seed, and the first the prop itself', async () => {
        expect(variationSeed(7, 0)).toBe(7)
        expect(new Set([0, 1, 2, 3].map((n) => variationSeed(7, n))).size).toBe(4)

        const [first, second] = batchItems([{kind: 'preset', id: 'birch'}], 2, CONTEXT)
        const seedOf = async (item: BatchItem) => (await item.load()).describe().seed

        expect(await seedOf(first)).toBe(createSceneFromPreset('birch').assets[0].seed)
        expect(await seedOf(second)).not.toBe(await seedOf(first))
    })

    it('exports a saved prop as saved, then on new seeds', async () => {
        const scene = createSceneFromPreset('sapling')
        const text = serializeProject({scene, style: 'low-poly', name: 'My sapling', extras: {}})
        const items = batchItems([{kind: 'saved', id: 'a', name: 'My sapling'}], 2, {
            ...CONTEXT,
            readInSavedProp: async () => text,
        })
        const {summary, written} = await run(items)

        expect(summary.failures).toEqual([])
        expect(summary.exported).toBe(2)
        expect(written.some((file) => file.name === 'my_sapling_02_LOD0.glb')).toBe(true)
        expect((await items[0].load()).describe().seed).toBe(scene.assets[0].seed)
        expect((await items[1].load()).describe().seed).not.toBe(scene.assets[0].seed)
    }, 60000)

    it('makes identical files when run twice', async () => {
        const items = () => batchItems([{kind: 'preset', id: 'birch'}, {kind: 'preset', id: 'date-palm'}], 3, CONTEXT)
        const first = await run(items())
        const second = await run(items())

        expect(first.written.length).toBe(30)
        expect(second.written.map((file) => file.name)).toEqual(first.written.map((file) => file.name))

        first.written.forEach((file, index) => {
            expect(Buffer.compare(file.bytes, second.written[index].bytes), file.name).toBe(0)
        })
    }, 120000)

    it('carries on past a prop that fails, and says which', async () => {
        const good = batchItems([{kind: 'preset', id: 'sapling'}], 2, CONTEXT)
        const bad = batchItems([{kind: 'saved', id: 'gone', name: 'Gone'}], 1, CONTEXT)
        const {summary} = await run([good[0], ...bad, good[1]])

        expect(summary.exported).toBe(2)
        expect(summary.failures).toEqual([{name: 'gone_01', message: 'No such prop'}])
        expect(summary.cancelled).toBe(false)
    }, 60000)

    it('stops when cancelled, and counts only what it finished', async () => {
        const controller = new AbortController()
        const items = batchItems([{kind: 'preset', id: 'sapling'}], 3, CONTEXT)
        const summary = await runBatch(items, {
            settings: SETTINGS,
            budget: 'hero',
            signal: controller.signal,
            write: async () => controller.abort(),
        })

        expect(summary.exported).toBe(1)
        expect(summary.total).toBe(3)
        expect(summary.cancelled).toBe(true)
    }, 60000)

    it('stops partway through a prop when cancelled', async () => {
        const controller = new AbortController()
        const source = sceneExportSource(createSceneFromPreset('sapling'), getStyleProfile('low-poly'), 'test')
        const item: BatchItem = {
            name: 'sapling_01',
            load: () => ({
                ...source,
                buildAtDetail: (detail) => {
                    controller.abort()

                    return source.buildAtDetail(detail)
                },
            }),
        }
        const {summary, written} = await run([item], controller.signal)

        expect(summary.cancelled).toBe(true)
        expect(written).toEqual([])
    }, 60000)

    it('lists what went over budget, and totals the size', async () => {
        const {summary, written} = await run(batchItems([{kind: 'preset', id: 'birch'}], 1, CONTEXT))

        expect(summary.overBudget.map((entry) => entry.name)).toEqual(['silver_birch_01'])
        expect(summary.overBudget[0].faces).toBeGreaterThan(2000)
        expect(summary.bytes).toBe(written.reduce((sum, file) => sum + file.bytes.length, 0))
    }, 60000)
})
