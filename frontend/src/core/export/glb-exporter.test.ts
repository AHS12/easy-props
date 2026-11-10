import {readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {getStyleProfile} from '../../assets/style/style-profiles'
import {findPropGenerator} from '../../assets/prop-generators'
import {treePresets} from '../../assets/trees/presets'
import {createEmptyScene} from '../scene/scene-model'
import {createSceneFromPreset} from '../scene/initial-scene'
import {findBudgetTarget} from './pipeline/budget'
import {MAX_COLLISION_SHAPES} from './pipeline/collision'
import {mergeParts} from './pipeline/merge'
import {buildExport} from './pipeline/package'
import {LEVEL_SHARES, exportNameOf, type ExportFile} from './pipeline/types'
import {sceneExportSource} from './scene-source'

const STYLE = getStyleProfile('low-poly')

/**
 * Presets whose lighter levels are outside the 25% target, and by how much is tolerated.
 * Too light costs nothing. Too heavy is small props and bare wood, where what is
 * left is already near the least that still reads, and the old-style tree, whose
 * wood the generic simplifier can only take so far.
 */
const LEVEL_KNOWN_MISSES: Readonly<Record<string, number>> = {
    birch: 0.005,
    // Plated bark carves more of the trunk, which the lightest level then simplifies away.
    'scots-pine': 0.015,
    larch: 0.005,
    // A bare tree's trunk now narrows into its top limb, which leaves its middle level a little lighter.
    bleached: 0.01,
    // These four lost only faces with no area at their lightest level, which takes
    // them just under the target.
    beech: 0.005,
    aspen: 0.002,
    acacia: 0.005,
    twisted: 0.003,
    banana: 0.045,
    'dead-oak': 0.03,
    burnt: 0.035,
    'round-canopy': 0.07,
    // A column crown is mostly side branches hidden in its leaves, and the lightest level drops them.
    poplar: 0.01,
    // A snapped tree is a bare stump of trunk, which its lightest level takes down further than most.
    'snapped-pine': 0.08,
    'broken-palm': 0.08,
    'lightning-oak': 0.04,
}

/**
 * Props whose lightest outline may be a little smaller than the rule allows. A snapped
 * tree is a bare stump whose roots set its width, and coarse wood draws roots thinner.
 */
const OUTLINE_KNOWN_MISSES: Readonly<Record<string, number>> = {
    'snapped-pine': 0.05,
    'broken-palm': 0.04,
    // Its tallest splinters are the first thing a lighter level smooths away.
    'lightning-oak': 0.02,
}

interface Accessor {
    readonly count: number
    readonly min?: number[]
    readonly max?: number[]
    readonly bufferView: number
    readonly byteOffset?: number
}

interface Gltf {
    readonly nodes?: {name: string; mesh?: number}[]
    readonly meshes?: {name: string; primitives: {attributes: Record<string, number>; indices: number; material: number}[]}[]
    readonly materials?: {name?: string; alphaMode?: string; pbrMetallicRoughness?: {baseColorTexture?: unknown}}[]
    readonly textures?: unknown[]
    readonly images?: unknown[]
    readonly accessors: Accessor[]
    readonly bufferViews: {byteOffset?: number; byteLength: number}[]
}

function readGLB(bytes: Uint8Array): {json: Gltf; bin: DataView} {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const jsonLength = view.getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Gltf
    const binStart = 20 + jsonLength + 8

    return {json, bin: new DataView(bytes.buffer, bytes.byteOffset + binStart)}
}

function faces(json: Gltf): number {
    return (json.meshes ?? []).reduce(
        (sum, mesh) => sum + mesh.primitives.reduce((own, p) => own + json.accessors[p.indices].count / 3, 0),
        0,
    )
}

function bounds(json: Gltf): {min: number[]; max: number[]} {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]

    for (const mesh of json.meshes ?? []) {
        for (const primitive of mesh.primitives) {
            const position = json.accessors[primitive.attributes.POSITION]

            for (let axis = 0; axis < 3; axis++) {
                min[axis] = Math.min(min[axis], position.min![axis])
                max[axis] = Math.max(max[axis], position.max![axis])
            }
        }
    }

    return {min, max}
}

/** Every edge shared by exactly two faces, and every vertex behind every face. */
function expectClosedConvex(
    {json, bin}: {json: Gltf; bin: DataView},
    primitive: {attributes: Record<string, number>; indices: number},
): void {
    const read = (accessor: Accessor, index: number, size: number, width: number) => {
        const view = json.bufferViews[accessor.bufferView]
        const at = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + index * size * width

        return Array.from({length: size}, (_, part) =>
            width === 4 ? bin.getFloat32(at + part * 4, true) : bin.getUint16(at + part * 2, true),
        )
    }
    const positions = json.accessors[primitive.attributes.POSITION]
    const indices = json.accessors[primitive.indices]
    const points = Array.from({length: positions.count}, (_, i) => read(positions, i, 3, 4))
    const triangles = Array.from({length: indices.count / 3}, (_, i) => read(indices, i, 3, 2))
    const edges = new Map<string, number>()

    for (const [a, b, c] of triangles) {
        for (const [from, to] of [[a, b], [b, c], [c, a]]) {
            const key = `${from}>${to}`

            expect(edges.has(key), 'an edge used twice the same way').toBe(false)
            edges.set(key, 1)
        }

        const u = points[b].map((value, axis) => value - points[a][axis])
        const v = points[c].map((value, axis) => value - points[a][axis])
        const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]

        for (const point of points) {
            const out = point.reduce((sum, value, axis) => sum + (value - points[a][axis]) * normal[axis], 0)

            expect(out).toBeLessThan(1e-4)
        }
    }

    for (const key of edges.keys()) {
        const [from, to] = key.split('>')

        expect(edges.has(`${to}>${from}`), 'an open edge').toBe(true)
    }
}

function fileNamed(files: readonly ExportFile[], ending: string): ExportFile {
    const file = files.find((candidate) => candidate.name.endsWith(ending))

    if (!file) {
        throw new Error(`No file ending ${ending} in ${files.map((f) => f.name).join(', ')}`)
    }

    return file
}

async function exportPreset(presetId: string, levels = 3, collision = true, engine: 'godot' | 'unreal' = 'godot') {
    const scene = createSceneFromPreset(presetId)

    return buildExport(sceneExportSource(scene, STYLE, 'test'), {name: 'oak_01', engine, levels, collision, wind: true})
}

// jsdom has no canvas, and the leaf texture is written through one. The picture
// is not under test here, only that there is one of it.
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

describe('game-ready export', () => {
    it('keeps the pipeline free of anything about trees', () => {
        const folder = join(__dirname, 'pipeline')

        for (const file of readdirSync(folder)) {
            expect(readFileSync(join(folder, file), 'utf8'), file).not.toMatch(/assets\/trees|viewport\//)
        }
    })

    it('makes a file name of a prop name', () => {
        expect(exportNameOf('Old Oak #1')).toBe('old_oak_1')
        expect(exportNameOf('  ')).toBe('prop')
    })

    it('writes the expected files', async () => {
        const files = await exportPreset('blossom-tree')

        expect(files.map((file) => file.name).sort()).toEqual([
            'oak_01.asset.json',
            'oak_01_LOD0.glb',
            'oak_01_LOD1.glb',
            'oak_01_LOD2.glb',
            'oak_01_collision.glb',
        ])

        const asset = JSON.parse(new TextDecoder().decode(fileNamed(files, '.asset.json').bytes))

        expect(asset.generator).toBe('painted-tree')
        expect(asset.seed).toBeTypeOf('number')
        expect(asset.parameters.height).toBeTypeOf('number')
        expect(asset.faces.LOD0).toBe(faces(readGLB(fileNamed(files, 'LOD0.glb').bytes).json))
    }, 60000)

    it('writes one file when asked for one level and no collision', async () => {
        const files = await exportPreset('blossom-tree', 1, false)

        expect(files.map((file) => file.name).sort()).toEqual(['oak_01.asset.json', 'oak_01.glb'])
    }, 60000)

    it('names collision for the engine it is going to', async () => {
        const unreal = readGLB(fileNamed(await exportPreset('blossom-tree', 1, true, 'unreal'), '_collision.glb').bytes).json
        const godot = readGLB(fileNamed(await exportPreset('blossom-tree', 1, true, 'godot'), '_collision.glb').bytes).json

        expect(unreal.nodes!.every((node) => /^UCX_oak_01_LOD0_\d\d$/.test(node.name))).toBe(true)
        expect(godot.nodes!.every((node) => /^oak_01_\d+-convcolonly$/.test(node.name))).toBe(true)
    }, 60000)

    it('writes relief on the wood alone, as the file format reads it', async () => {
        const {json} = readGLB(fileNamed(await exportPreset('blossom-tree', 1, false), 'oak_01.glb').bytes)
        const relief = (name: string) => (json.materials!.find((material) => material.name === name) as {normalTexture?: unknown}).normalTexture

        expect(relief('oak_01_wood')).toBeDefined()
        expect(relief('oak_01_leaves')).toBeUndefined()

        // The exporter cannot read our relief to invert it, and a canvas stub here would hide that it tried.
        const parts = await sceneExportSource(createSceneFromPreset('blossom-tree'), STYLE, 'test').buildAtDetail(1)

        for (const {material} of mergeParts(parts, 'oak', [0, 0, 0])) {
            expect(material.normalScale.y).toBeLessThan(0)
        }
    }, 60000)

    describe.each(['plain', 'godot', 'unreal'] as const)('with parts joined for %s', (engine) => {
        const exportBoth = async (levels: number) => {
            const settings = {name: 'oak_01', engine, levels, collision: true, wind: true}
            const source = () => sceneExportSource(createSceneFromPreset('blossom-tree'), STYLE, 'test')

            return {
                apart: await buildExport(source(), settings),
                joined: await buildExport(source(), {...settings, join: true}),
            }
        }

        it('writes one object with a part per material, losing nothing', async () => {
            const {apart, joined} = await exportBoth(2)

            for (const level of ['LOD0', 'LOD1']) {
                const before = readGLB(fileNamed(apart, `${level}.glb`).bytes).json
                const after = readGLB(fileNamed(joined, `${level}.glb`).bytes).json
                const drawn = after.nodes!.filter((node) => !node.name.startsWith('UCX_'))

                expect(drawn.map((node) => node.name)).toEqual(['oak_01'])

                const mesh = after.meshes![drawn[0].mesh!]

                expect(mesh.primitives.length).toBe(before.meshes!.length)
                expect(mesh.primitives.map((primitive) => after.materials![primitive.material].name).sort()).toEqual(
                    ['oak_01_leaves', 'oak_01_wood'],
                )

                for (const primitive of mesh.primitives) {
                    expect(primitive.attributes.COLOR_0).toBeDefined()
                    expect(primitive.attributes.TEXCOORD_1, 'wind data').toBeDefined()
                }

                expect(after.materials!.map((material) => material.name).sort()).toEqual(['oak_01_leaves', 'oak_01_wood'])

                const own = {...after, meshes: [mesh]}

                expect(faces(own)).toBe(faces(before))
                expect(bounds(own)).toEqual(bounds(before))
            }
        }, 60000)

        it('puts collision where the engine can read it', async () => {
            const {joined} = await exportBoth(2)
            const lod = (level: number) => readGLB(fileNamed(joined, `LOD${level}.glb`).bytes).json
            const shapesIn = (level: number) => lod(level).nodes!.filter((node) => node.name.startsWith('UCX_'))

            if (engine === 'unreal') {
                expect(joined.some((file) => file.name.endsWith('_collision.glb'))).toBe(false)
                expect(shapesIn(0).length).toBeGreaterThan(0)
                expect(shapesIn(0).every((node) => /^UCX_oak_01_\d\d$/.test(node.name))).toBe(true)
                expect(shapesIn(1)).toEqual([])
            } else {
                expect(fileNamed(joined, '_collision.glb')).toBeDefined()
                expect(shapesIn(0)).toEqual([])
            }
        }, 60000)
    })

    it('still writes a valid file for a scene with nothing in it', async () => {
        const files = await buildExport(sceneExportSource(createEmptyScene(), STYLE, 'test'), {
            name: 'empty',
            engine: 'plain',
            levels: 1,
            collision: true,
            wind: true,
        })

        expect(faces(readGLB(fileNamed(files, 'empty.glb').bytes).json)).toBe(0)
    })

    it.each(treePresets.map((preset) => preset.id))('%s is game ready', async (presetId) => {
        const preset = treePresets.find((candidate) => candidate.id === presetId)!
        const files = await exportPreset(presetId)
        const levels = [0, 1, 2].map((level) => readGLB(fileNamed(files, `LOD${level}.glb`).bytes).json)
        const full = faces(levels[0])
        const fullBounds = bounds(levels[0])
        const fullSize = [0, 1, 2].map((axis) => fullBounds.max[axis] - fullBounds.min[axis])

        for (const [level, json] of levels.entries()) {
            // Merged, named after the prop, and sharing one texture.
            expect(json.meshes!.length, `LOD${level} meshes`).toBeLessThanOrEqual(2)
            expect(json.materials!.length, `LOD${level} materials`).toBeLessThanOrEqual(2)
            // Strokes and relief on the wood, and the leaves' dabs.
            expect((json.images ?? []).length, `LOD${level} images`).toBeLessThanOrEqual(3)

            // Every mesh has a texture, or Unreal ignores its vertex colours.
            for (const mesh of json.meshes!) {
                expect(mesh.name).toMatch(/^oak_01_(wood|leaves)$/)

                for (const primitive of mesh.primitives) {
                    expect(json.materials![primitive.material].pbrMetallicRoughness?.baseColorTexture, mesh.name).toBeDefined()
                    expect(primitive.attributes.COLOR_0, mesh.name).toBeDefined()
                    expect(primitive.attributes.TEXCOORD_0, mesh.name).toBeDefined()
                }
            }

            for (const node of json.nodes!.filter((candidate) => candidate.mesh !== undefined)) {
                expect(node.name).toMatch(/^oak_01_(wood|leaves)$/)
            }

            // On target within 25%, but for the few known to miss the lightest level.
            const share = faces(json) / full
            const miss = level >= 1 ? (LEVEL_KNOWN_MISSES[presetId] ?? 0) : 0

            expect(share, `LOD${level} share`).toBeGreaterThan(LEVEL_SHARES[level] * 0.75 - miss)
            // A prop that already fits the smallest budget has nothing it must lose.
            if (full > findBudgetTarget('mobile').faces) {
                expect(share, `LOD${level} share`).toBeLessThan(LEVEL_SHARES[level] * 1.25 + miss)
            }

            // The silhouette holds within 10%.
            const box = bounds(json)

            for (let axis = 0; axis < 3; axis++) {
                const size = box.max[axis] - box.min[axis]

                expect(Math.abs(size - fullSize[axis]) / fullSize[axis], `LOD${level} axis ${axis}`).toBeLessThan(0.1 + (OUTLINE_KNOWN_MISSES[presetId] ?? 0))
            }
        }

        // Pivot at the base. One unit is one metre.
        const generator = findPropGenerator(preset.generatorId)!
        const {height, snapped = 0} = generator.validate(preset.parameters).parameters as {height: number; snapped?: number}

        // A snapped tree stands as high as where it broke.
        expect(fullBounds.max[1]).toBeGreaterThan(height * (snapped > 0 ? 0.15 : 0.5))

        expect(fullBounds.max[1]).toBeLessThan(height * 2)

        // The pivot is the middle of the base, so a prop stands on the origin.
        expect(Math.abs(fullBounds.min[1])).toBeLessThan(height * 0.2)

        // Nothing stops a player walking through grass, so it has nothing to collide with.
        if (preset.generatorId === 'grass' || preset.generatorId === 'plant') {
            expect(files.some((file) => file.name.endsWith('_collision.glb'))).toBe(false)

            return
        }

        // Closed convex shapes, within the limit.
        const collision = readGLB(fileNamed(files, '_collision.glb').bytes)

        expect(collision.json.nodes!.length).toBeGreaterThan(0)
        expect(collision.json.nodes!.length).toBeLessThanOrEqual(MAX_COLLISION_SHAPES)

        for (const mesh of collision.json.meshes!) {
            expectClosedConvex(collision, mesh.primitives[0])
        }
    }, 120000)
})
