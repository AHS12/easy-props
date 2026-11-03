import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {getStyleProfile} from '../../assets/style/style-profiles'
import {createSceneFromPreset} from '../scene/initial-scene'
import {buildExport} from './pipeline/package'
import {windWeight} from './pipeline/wind'
import {sceneExportSource} from './scene-source'
import {engineKitFiles} from './engine-kits'
import {WIND_FRAGMENT} from '../../viewport/scene/wind-material'

interface Accessor {readonly bufferView: number; readonly byteOffset?: number; readonly count: number; readonly min?: number[]; readonly max?: number[]}
interface Gltf {
    readonly meshes: {primitives: {attributes: Record<string, number>}[]}[]
    readonly accessors: Accessor[]
    readonly bufferViews: {byteOffset?: number; byteLength: number}[]
}

function readGlb(bytes: Uint8Array): {json: Gltf; bin: Uint8Array} {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const jsonLength = view.getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Gltf

    return {json, bin: bytes.subarray(20 + jsonLength + 8)}
}

function floats({json, bin}: ReturnType<typeof readGlb>, index: number, size: number): Float32Array {
    const accessor = json.accessors[index]
    const start = (json.bufferViews[accessor.bufferView].byteOffset ?? 0) + (accessor.byteOffset ?? 0)

    return new Float32Array(bin.slice(start, start + accessor.count * size * 4).buffer)
}

const exportOak = async (wind: boolean, levels = 2) =>
    buildExport(sceneExportSource(createSceneFromPreset('oak'), getStyleProfile('low-poly'), 'test'), {
        name: 'oak',
        engine: 'plain',
        levels,
        collision: false,
        wind,
    })

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

describe('wind data', () => {
    it('is 0 at the base and on heavy wood, and rises with height', () => {
        const extent = {height: 10, reach: 5}

        expect(windWeight(0, 0, 0, 'solid', extent)).toEqual([0, 0])
        expect(windWeight(3, 0, 0, 'solid', extent)[0]).toBe(0)
        expect(windWeight(0, 9, 0, 'solid', extent)[0]).toBeGreaterThan(windWeight(0, 3, 0, 'solid', extent)[0])
        expect(windWeight(0, 3, 0, 'solid', extent)[1]).toBe(0)
        expect(windWeight(5, 9, 0, 'foliage', extent)[1]).toBe(1)
    })

    it('gives wood and leaves the same sway at the same point, so a leaf stays on its twig', () => {
        const extent = {height: 8, reach: 4}

        expect(windWeight(1, 5, 2, 'solid', extent)[0]).toBe(windWeight(1, 5, 2, 'foliage', extent)[0])
    })

    it('reaches the file finite and in range, on every level', async () => {
        const files = (await exportOak(true)).filter((file) => file.name.endsWith('.glb'))

        expect(files.length).toBe(2)

        for (const file of files) {
            const glb = readGlb(file.bytes)

            for (const mesh of glb.json.meshes) {
                for (const {attributes} of mesh.primitives) {
                    expect(attributes.TEXCOORD_1, file.name).toBeDefined()

                    for (const value of floats(glb, attributes.TEXCOORD_1, 2)) {
                        expect(Number.isFinite(value)).toBe(true)
                        expect(value).toBeGreaterThanOrEqual(0)
                        expect(value).toBeLessThanOrEqual(1)
                    }
                }
            }
        }
    }, 60_000)

    it('lets fruit sway whole, never fluttering, so it keeps its size', async () => {
        const unfluttered = async (preset: string) => {
            const files = await buildExport(sceneExportSource(createSceneFromPreset(preset), getStyleProfile('low-poly'), 'test'), {
                name: 'tree',
                engine: 'plain',
                levels: 1,
                collision: false,
                wind: true,
            })
            const glb = readGlb(files.find((file) => file.name.endsWith('.glb'))!.bytes)
            const leaves = glb.json.meshes.find((_, index) => index === glb.json.meshes.length - 1)!
            const values = floats(glb, leaves.primitives[0].attributes.TEXCOORD_1, 2)
            let still = 0

            for (let at = 1; at < values.length; at += 2) {
                still += values[at] === 0 ? 1 : 0
            }

            return still
        }

        // Leaves always flutter some, so only the fruit has none.
        expect(await unfluttered('apple')).toBeGreaterThan(0)
        expect(await unfluttered('spring-tree')).toBe(0)
    }, 60_000)

    it('stays out of the file when switched off', async () => {
        const [file] = (await exportOak(false, 1)).filter((candidate) => candidate.name.endsWith('.glb'))

        for (const mesh of readGlb(file.bytes).json.meshes) {
            expect(mesh.primitives[0].attributes.TEXCOORD_1).toBeUndefined()
        }
    }, 60_000)
})

describe('the Wind view', () => {
    it('draws the same numbers the export writes', () => {
        expect(WIND_FRAGMENT).toContain('pow(clamp(at.y / height, 0.0, 1.0), 1.5) * (0.6 + 0.4 * outward)')
        expect(WIND_FRAGMENT).toContain('foliage * (0.5 + 0.5 * outward)')
        expect(windWeight(3, 6, 4, 'solid', {height: 10, reach: 10})[0]).toBeCloseTo(0.6 ** 1.5 * (0.6 + 0.4 * 0.5))
        expect(windWeight(3, 6, 4, 'foliage', {height: 10, reach: 10})[1]).toBeCloseTo(0.5 + 0.5 * 0.5)
    })
})

describe('the engine kits', () => {
    it('read the channel the export writes', () => {
        const godot = engineKitFiles('godot').map((file) => new TextDecoder().decode(file.bytes))
        const shaders = godot.filter((text) => text.includes('shader_type'))

        expect(shaders).toHaveLength(2)

        for (const shader of shaders) {
            expect(shader).toContain('UV2.x')
            expect(shader).toContain('COLOR.rgb')
        }

        const unreal = engineKitFiles('unreal')
        const script = new TextDecoder().decode(unreal.find((file) => file.name === 'setup_props.py')!.bytes)

        expect(new TextDecoder().decode(unreal[0].bytes)).toContain('Coordinate Index 1')
        expect(script).toContain('coordinate_index=1')
    })
})
