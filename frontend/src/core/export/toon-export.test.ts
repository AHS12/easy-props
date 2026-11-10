import * as THREE from 'three'
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {getStyleProfile} from '../../assets/style/style-profiles'
import {CARTOON_LOOK, COMIC_LOOK, INK_LINES} from '../../assets/style/toon-looks'
import {createSceneFromPreset} from '../scene/initial-scene'
import {engineKitFiles} from './engine-kits'
import {loadExportPreferences} from './export-preferences'
import {godotOutlineShader, godotToonShader} from './godot-toon'
import {mergeParts} from './pipeline/merge'
import {buildExport} from './pipeline/package'
import {sceneExportSource} from './scene-source'

const STYLE = getStyleProfile('low-poly')

const partsOf = (preset: string) => sceneExportSource(createSceneFromPreset(preset), STYLE, 'test').buildAtDetail(1)

const coloursOf = (geometry: THREE.BufferGeometry) => {
    const colour = geometry.getAttribute('color')

    return new Set(Array.from({length: colour.count}, (_, i) => [colour.getX(i), colour.getY(i), colour.getZ(i)].map((value) => value.toFixed(4)).join()))
}

/** Every brace and bracket closed, which Godot checks first. */
const balanced = (text: string) => {
    const open: string[] = []
    const pairs: Record<string, string> = {')': '(', '}': '{', ']': '['}

    for (const char of text) {
        if ('({['.includes(char)) {
            open.push(char)
        } else if (char in pairs && open.pop() !== pairs[char]) {
            return false
        }
    }

    return open.length === 0
}

// jsdom has no canvas, and pictures are written through one. They are not under test here.
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

describe('a Comic export', () => {
    it('bakes each part to a few flat colours', async () => {
        const lit = mergeParts(await partsOf('mossy-boulder'), 'rock', [0, 0, 0])
        const comic = mergeParts(await partsOf('mossy-boulder'), 'rock', [0, 0, 0], undefined, true, true)

        expect(coloursOf(comic[0].geometry).size).toBeLessThan(coloursOf(lit[0].geometry).size / 4)
    })

    it('turns leaf cards toward the round shape of their clump, and leaves wood alone', async () => {
        const facing = (geometry: THREE.BufferGeometry) => {
            geometry.computeBoundingSphere()
            const centre = geometry.boundingSphere!.center
            const position = geometry.getAttribute('position')
            const normal = geometry.getAttribute('normal')
            const point = new THREE.Vector3()
            let sum = 0

            for (let i = 0; i < position.count; i++) {
                point.fromBufferAttribute(position, i).sub(centre).normalize()
                sum += point.dot(new THREE.Vector3().fromBufferAttribute(normal, i))
            }

            return sum / position.count
        }
        const parts = await partsOf('spring-tree')
        const clump = parts.filter((placed) => placed.part.surface?.map && (placed.part.surface.alphaTest ?? 0) > 0).slice(0, 1)
        const branch = parts.filter((placed) => !placed.part.surface?.alphaTest).slice(0, 1)
        const lit = mergeParts(clump, 'tree', [0, 0, 0])[0].geometry
        const comic = mergeParts(clump, 'tree', [0, 0, 0], undefined, true, true)[0].geometry
        const normals = (meshes: ReturnType<typeof mergeParts>) => Array.from(meshes[0].geometry.getAttribute('normal').array)

        expect(facing(comic)).toBeGreaterThan(facing(lit))
        expect(facing(comic)).toBeGreaterThan(0.95)
        expect(normals(mergeParts(branch, 'tree', [0, 0, 0], undefined, true, true))).toEqual(normals(mergeParts(branch, 'tree', [0, 0, 0])))
    })

    it('says its look in the description', async () => {
        const files = await buildExport(sceneExportSource(createSceneFromPreset('boulder'), STYLE, 'test'), {
            name: 'rock', engine: 'godot', levels: 1, collision: false, wind: false, look: 'cel',
        })
        const asset = JSON.parse(new TextDecoder().decode(files.find((file) => file.name.endsWith('.asset.json'))!.bytes))

        expect(asset.look).toBe('cel')
    })
})

describe('materials beside the files', () => {
    const namesOf = async (engine: 'godot' | 'plain', look: 'lit' | 'cel', materials: boolean) => {
        const files = await buildExport(sceneExportSource(createSceneFromPreset('boulder'), STYLE, 'test'), {
            name: 'rock', engine, levels: 1, collision: false, wind: false, look, materials,
        })

        return files.map((file) => file.name)
    }

    it('come with a Godot export, for the look chosen', async () => {
        expect(await namesOf('godot', 'lit', true)).toEqual(expect.arrayContaining(['wood.gdshader', 'leaves.gdshader', 'easy_props_import.gd']))
        expect(await namesOf('godot', 'cel', true)).toEqual(
            expect.arrayContaining(['wood_comic.gdshader', 'leaves_comic.gdshader', 'outline.gdshader']),
        )
        expect(await namesOf('godot', 'cel', true)).not.toContain('wood.gdshader')
    })

    it('stay out when turned off, and of an export for another engine', async () => {
        expect((await namesOf('godot', 'lit', false)).some((name) => name.endsWith('.gdshader'))).toBe(false)
        expect((await namesOf('plain', 'lit', true)).some((name) => name.endsWith('.gdshader'))).toBe(false)
    })
})

describe('the Godot toon materials', () => {
    it('are made from the numbers the view draws with', () => {
        const comic = godotToonShader('cel', 'wood')
        const cartoon = godotToonShader('cartoon', 'leaves')

        expect(cartoon).toContain(`float level = ${CARTOON_LOOK.levels[0]};`)
        expect(comic).toContain(`vec3(${COMIC_LOOK.shadowDepth})`)
        expect(comic).toContain(`? ${COMIC_LOOK.strokeTone} : 1.0`)
        expect(godotOutlineShader()).toContain(`= ${(INK_LINES.outer * COMIC_LOOK.lines.weight).toFixed(1)};`)
    })

    it('keep the wind of the lit materials', () => {
        for (const look of ['cartoon', 'cel'] as const) {
            for (const material of ['wood', 'leaves'] as const) {
                const shader = godotToonShader(look, material)

                expect(shader).toContain('VERTEX += (inverse(MODEL_MATRIX)')
                expect(shader).toContain('void light()')
                expect(balanced(shader)).toBe(true)
            }
        }

        expect(balanced(godotOutlineShader())).toBe(true)
    })

    it('declare what each face hands on before the code that hands it on', () => {
        const shader = godotToonShader('cel', 'leaves')

        expect(shader.indexOf('varying flat vec3 face_colour')).toBeLessThan(shader.indexOf('void vertex()'))
        expect(shader).toContain('face_colour = COLOR.rgb;')
    })

    it('ship in the Godot kit with the outline', () => {
        const names = engineKitFiles('godot').map((file) => file.name)

        expect(names).toEqual(expect.arrayContaining(['wood_cartoon.gdshader', 'leaves_comic.gdshader', 'outline.gdshader']))
    })
})

describe('the remembered look', () => {
    beforeAll(() => localStorage.clear())
    afterAll(() => localStorage.clear())

    it('starts lit, and a look that no longer exists falls back to lit', () => {
        expect(loadExportPreferences().look).toBe('lit')

        localStorage.setItem('easy-props.export', JSON.stringify({look: 'watercolour'}))
        expect(loadExportPreferences().look).toBe('lit')

        localStorage.setItem('easy-props.export', JSON.stringify({look: 'cel'}))
        expect(loadExportPreferences().look).toBe('cel')
    })
})
