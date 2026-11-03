import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import * as THREE from 'three'
import {getStyleProfile} from '../../assets/style/style-profiles'
import {offersFarAway} from '../../assets/prop-generators'
import {createSceneFromPreset} from '../scene/initial-scene'
import {loadExportPreferences} from './export-preferences'
import {FAR_FACES, FAR_VIEWS, farCardGeometry, fillGaps, setFarPainter, type FarPainter} from './pipeline/far'
import {buildExport} from './pipeline/package'
import {windWeight} from './pipeline/wind'
import type {ExportFile} from './pipeline/types'
import {sceneExportSource} from './scene-source'

const STYLE = getStyleProfile('low-poly')

interface Gltf {
    readonly meshes?: {primitives: {attributes: Record<string, number>; indices: number; material: number}[]}[]
    readonly materials?: {alphaMode?: string; normalTexture?: unknown; pbrMetallicRoughness?: {baseColorTexture?: unknown}}[]
    readonly accessors: {count: number; min?: number[]; max?: number[]}[]
}

function readGLB(bytes: Uint8Array): Gltf {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true)))) as Gltf
}

/** Plain blocks of colour, one per view, as tests have no WebGL. */
const BLOCKS: FarPainter = {
    async paint(_meshes, _frame, viewSize) {
        const size = viewSize * 2
        const colour = new Uint8Array(size * size * 4).fill(255)
        const relief = new Uint8Array(size * size * 4).fill(255)

        return {size, colour, relief}
    },
}

async function exportPreset(presetId: string, far = true): Promise<ExportFile[]> {
    return buildExport(sceneExportSource(createSceneFromPreset(presetId), STYLE, 'test'), {
        name: 'prop',
        engine: 'plain',
        levels: 1,
        collision: false,
        wind: true,
        far,
    })
}

const named = (files: readonly ExportFile[], name: string) => files.find((file) => file.name === name)

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

beforeEach(() => setFarPainter(BLOCKS))
afterEach(() => setFarPainter(null))

describe('the far-away card', () => {
    const frame = {reach: 2, bottom: 0, top: 6}

    it('has 8 faces, stands on the pivot, and is as tall and wide as the prop', () => {
        const geometry = farCardGeometry(frame)
        const box = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute)

        expect(geometry.index!.count / 3).toBe(FAR_FACES)
        expect(box.min.toArray()).toEqual([-2, 0, -2])
        expect(box.max.toArray()).toEqual([2, 6, 2])
    })

    it('shows each side the picture taken from that side', () => {
        const geometry = farCardGeometry(frame)
        const position = geometry.getAttribute('position')
        const uv = geometry.getAttribute('uv')
        const index = geometry.index!

        FAR_VIEWS.forEach((view, side) => {
            const [a, b, c] = [0, 1, 2].map((corner) => new THREE.Vector3().fromBufferAttribute(position, index.getX(side * 6 + corner)))
            const out = b.clone().sub(a).cross(c.clone().sub(a)).normalize()

            // It faces the camera that drew its picture, so it's seen from that side.
            expect(out.toArray().map((value) => Math.round(value))).toEqual([...view.facing].map((value) => value + 0))

            const corners = [0, 1, 2, 3].map((corner) => side * 4 + corner)
            const middle = (read: (at: number) => number) => corners.reduce((sum, at) => sum + read(at), 0) / 4

            expect(Math.floor(middle((at) => uv.getX(at)) * 2)).toBe(view.cell[0])
            expect(Math.floor(middle((at) => uv.getY(at)) * 2)).toBe(view.cell[1])

            for (const at of corners) {
                // The left of the picture is on the left as seen from that side.
                const across = new THREE.Vector3().fromBufferAttribute(position, at).dot(new THREE.Vector3(...view.right))

                expect(Math.sign(across)).toBe(uv.getX(at) * 2 - view.cell[0] > 0.5 ? 1 : -1)
            }
        })
    })

    it('sways as much as the prop does at the same point, and never flutters', () => {
        const extent = {height: 6, reach: 2}
        const geometry = farCardGeometry(frame, extent)
        const position = geometry.getAttribute('position')
        const wind = geometry.getAttribute('uv1')

        for (let at = 0; at < position.count; at++) {
            const [sway] = windWeight(position.getX(at), position.getY(at), position.getZ(at), 'solid', extent)

            expect(wind.getX(at)).toBeCloseTo(sway)
            expect(wind.getY(at)).toBe(0)
        }

        expect(Math.max(...Array.from({length: position.count}, (_, at) => wind.getX(at)))).toBeGreaterThan(0.5)
    })
})

describe('filling the gaps', () => {
    it('spreads edge colours into see-through pixels and leaves solid ones alone', () => {
        const size = 8
        const pixels = new Uint8Array(size * size * 4)
        const solid = (3 * size + 3) * 4

        pixels.set([200, 100, 50, 255], solid)
        fillGaps(pixels, size)

        expect([...pixels.subarray(solid, solid + 4)]).toEqual([200, 100, 50, 255])
        // A neighbour in the same cell takes the colour, and stays see-through.
        expect([...pixels.subarray(solid - 4, solid)]).toEqual([200, 100, 50, 0])
        // Another cell has nothing solid, so it's left a plain grey.
        expect([...pixels.subarray((7 * size + 7) * 4, (7 * size + 7) * 4 + 3)]).toEqual([128, 128, 128])
    })
})

describe('exporting a far-away card', () => {
    it('writes one beside the levels when asked, and lists its faces', async () => {
        const files = await exportPreset('blossom-tree')
        const card = named(files, 'prop_far.glb')
        const asset = JSON.parse(new TextDecoder().decode(named(files, 'prop.asset.json')!.bytes))

        expect(card?.faces).toBe(FAR_FACES)
        expect(asset.faces.far).toBe(FAR_FACES)
        expect(asset.far.pictureSize).toBe(512)
        expect(asset.far.height).toBeGreaterThan(1)
    })

    it('writes one material, cut out, with a colour and a relief picture', async () => {
        const json = readGLB(named(await exportPreset('blossom-tree'), 'prop_far.glb')!.bytes)

        expect(json.meshes).toHaveLength(1)
        expect(json.materials).toHaveLength(1)
        expect(json.materials![0].alphaMode).toBe('MASK')
        expect(json.materials![0].pbrMetallicRoughness?.baseColorTexture).toBeDefined()
        expect(json.materials![0].normalTexture).toBeDefined()
        expect(json.meshes![0].primitives[0].attributes.TEXCOORD_1).toBeDefined()
    })

    it('writes none when the choice is off', async () => {
        expect(named(await exportPreset('blossom-tree', false), 'prop_far.glb')).toBeUndefined()
    })

    it('never gives rocks, grass or short cacti one, even with the choice on', async () => {
        for (const preset of ['boulder', 'grass-tuft', 'golden-barrel']) {
            expect(named(await exportPreset(preset), 'prop_far.glb'), preset).toBeUndefined()
        }
    })

    it('offers one for trees, bushes and tall cacti', () => {
        for (const preset of ['blossom-tree', 'birch', 'round-bush', 'saguaro']) {
            const asset = createSceneFromPreset(preset).assets[0]

            expect(offersFarAway(asset.generatorId, asset.parameters), preset).toBe(true)
        }
    })

    it('reads old saved choices without it as on', () => {
        localStorage.setItem('easy-props.export', JSON.stringify({engine: 'godot', levels: 2}))

        expect(loadExportPreferences().far).toBe(true)
        localStorage.removeItem('easy-props.export')
    })
})
