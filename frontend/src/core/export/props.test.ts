import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {familyOfPreset, presetGroups, treePresets} from '../../assets/trees/presets'
import {getStyleProfile} from '../../assets/style/style-profiles'
import {createSceneFromPreset} from '../scene/initial-scene'
import {findBudgetTarget} from './pipeline/budget'
import {runBatch} from './pipeline/batch'
import {buildExport} from './pipeline/package'
import type {ExportFile} from './pipeline/types'
import {sceneExportSource} from './scene-source'

const STYLE = getStyleProfile('low-poly')
const presetsOf = (family: string) => presetGroups.filter((group) => group.family === family).flatMap((group) => group.presets)
const sourceOf = (id: string) => sceneExportSource(createSceneFromPreset(id), STYLE, 'test')

interface Gltf {
    readonly nodes?: {name: string}[]
    readonly meshes?: {primitives: {attributes: Record<string, number>; indices: number}[]}[]
    readonly accessors: {count: number; min?: number[]; max?: number[]}[]
}

function readGLB(bytes: Uint8Array): Gltf {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true)))) as Gltf
}

const byName = (files: readonly ExportFile[], name: string) => {
    const file = files.find((candidate) => candidate.name === name)

    expect(file, name).toBeDefined()

    return readGLB(file!.bytes)
}

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

describe('rocks go through the same pipeline', () => {
    it('lists every kind of prop under its own tab', () => {
        expect(presetsOf('rock').length).toBeGreaterThanOrEqual(9)
        expect(presetsOf('bush').length).toBeGreaterThanOrEqual(9)
        expect(familyOfPreset('boulder')).toBe('rock')
        expect(familyOfPreset('forest-fern')).toBe('bush')
        expect(familyOfPreset('oak')).toBe('tree')
        expect(familyOfPreset('no-such-preset')).toBe('tree')
    })

    it.each(presetsOf('rock').map((preset) => preset.id))('exports %s as one mesh, with levels and collision, and no wind', async (id) => {
        const files = await buildExport(sourceOf(id), {name: 'rock', engine: 'godot', levels: 3, collision: true, wind: true})
        const levels = [0, 1, 2].map((level) => byName(files, `rock_LOD${level}.glb`))
        const faces = levels.map((json) => json.accessors[json.meshes![0].primitives[0].indices].count / 3)

        for (const json of levels) {
            expect(json.meshes).toHaveLength(1)
            expect(json.meshes![0].primitives[0].attributes.TEXCOORD_1).toBeUndefined()
        }

        expect(faces[1]).toBeLessThan(faces[0] * 0.55)
        expect(faces[2]).toBeLessThan(faces[0] * 0.2)
        expect(byName(files, 'rock_collision.glb').nodes!.length).toBe(1)
    }, 60000)

    it('stays within its size, resting on the ground', async () => {
        const preset = treePresets.find((candidate) => candidate.id === 'boulder')!
        const files = await buildExport(sourceOf('boulder'), {name: 'rock', engine: 'plain', levels: 1, collision: false, wind: false})
        const json = byName(files, 'rock.glb')
        const position = json.accessors[json.meshes![0].primitives[0].attributes.POSITION]
        const {width, height} = preset.parameters as {width: number; height: number}

        expect(position.max![1]).toBeGreaterThan(Number(height) * 0.7)
        expect(position.max![1]).toBeLessThan(Number(height) * 1.2)
        expect(position.max![0] - position.min![0]).toBeLessThan(Number(width) * 1.3)
        expect(position.min![1]).toBeLessThan(0.1)
    }, 60000)

    it('runs in a batch, the same twice', async () => {
        const run = async () => {
            const written: ExportFile[] = []
            const summary = await runBatch(
                [{name: 'stone_01', load: () => sourceOf('field-stone')}],
                {
                    settings: {engine: 'unreal', levels: 2, collision: true, wind: true},
                    budget: 'mobile',
                    write: async (files) => {
                        written.push(...files)
                    },
                },
            )

            expect(summary.exported).toBe(1)

            return written
        }
        const [first, second] = [await run(), await run()]

        expect(first.map((file) => [file.name, [...file.bytes]])).toEqual(second.map((file) => [file.name, [...file.bytes]]))
    }, 60000)
})

describe('foliage props', () => {
    const SMALL = presetsOf('bush').map((preset) => preset.id)

    it.each(SMALL)('%s has low detail levels that fit Mobile, and full detail that fits Background', async (id) => {
        const files = await buildExport(sourceOf(id), {name: 'plant', engine: 'plain', levels: 3, collision: false, wind: true})
        const faces = (name: string) => files.find((file) => file.name === name)!.faces!

        expect(faces('plant_LOD0.glb')).toBeLessThanOrEqual(findBudgetTarget('background').faces)
        expect(faces('plant_LOD2.glb')).toBeLessThanOrEqual(findBudgetTarget('mobile').faces)
    }, 60000)
})
