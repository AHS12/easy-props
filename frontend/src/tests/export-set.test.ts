import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {batchItems} from '../core/export/batch-items'
import {colourGroups, inSetColours, usualColours} from '../core/export/set-colours'
import {materialsInGlb, setEntryOf, setListFile} from '../core/export/set-list'
import {buildExport} from '../core/export/pipeline/package'
import {sceneExportSource} from '../core/export/scene-source'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {getStyleProfile} from '../assets/style/style-profiles'

const STYLE = getStyleProfile('low-poly')
const propsOf = (...ids: string[]) => ids.map((id) => createSceneFromPreset(id).assets[0])

// jsdom has no canvas, and pictures are written through one. Only the names are under test.
beforeAll(() => {
    vi.stubGlobal('ImageData', class {
        constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {}
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({putImageData() {}, drawImage() {}, scale() {}, translate() {}}) as never)
    HTMLCanvasElement.prototype.toBlob = function (callback) {
        callback(new Blob([new Uint8Array([137, 80, 78, 71])], {type: 'image/png'}))
    }
})

afterAll(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('a set’s colours', () => {
    it('are one choice for each colour setting the props share', () => {
        const groups = colourGroups(propsOf('oak', 'apple', 'birch', 'mossy-boulder', 'boulder'))
        const labels = groups.map((group) => group.label)

        expect(labels).toContain('Tree: Palette')
        expect(labels).toContain('Tree: Bark colour')
        expect(labels).toContain('Rock: Stone')
        // Trees and rocks never share a palette: their choices differ.
        expect(groups.find((group) => group.label === 'Tree: Palette')!.props).toBe(3)
    })

    it('start on the choice most of the set uses', () => {
        const groups = colourGroups(propsOf('oak', 'apple', 'birch'))
        const colours = usualColours(groups)
        const palette = groups.find((group) => group.key === 'palette')!

        // Two are Forest green, one Spring green.
        expect(colours[palette.id]).toBe('forest')
    })

    it('build a prop in the set’s colours, and leave the saved one as it is', () => {
        const birch = createSceneFromPreset('birch')
        const groups = colourGroups(propsOf('oak', 'apple', 'birch'))
        const matched = inSetColours(birch, usualColours(groups), 'low-poly')

        expect(matched.assets[0].parameters.palette).toBe('forest')
        expect(matched.assets[0].parameters.barkTone).toBe('oak')
        expect(birch.assets[0].parameters.palette).toBe('spring')
    })

    it('go into every prop of a batch', async () => {
        const groups = colourGroups(propsOf('oak', 'apple', 'birch'))
        const [item] = batchItems([{kind: 'preset', id: 'birch'}], 1, {style: 'low-poly', appVersion: 'test', readInSavedProp: async () => '', colours: usualColours(groups)})

        expect((await item.load()).describe().parameters).toMatchObject({palette: 'forest'})
    })
})

describe('a set’s files', () => {
    const exportIn = async (presetId: string, setName?: string) =>
        buildExport(sceneExportSource(createSceneFromPreset(presetId), STYLE, 'test'), {name: presetId, engine: 'godot', levels: 1, collision: false, wind: false, setName})

    it('name materials after the set and what they look like, so files share them', async () => {
        const glb = (files: Awaited<ReturnType<typeof exportIn>>) => files.find((file) => file.name.endsWith('.glb'))!.bytes
        const oak = materialsInGlb(glb(await exportIn('oak', 'forest')))
        const apple = materialsInGlb(glb(await exportIn('apple', 'forest')))
        const alone = materialsInGlb(glb(await exportIn('oak')))

        const olive = materialsInGlb(glb(await exportIn('olive', 'forest')))

        // Both have plated bark, so both name it alike. Leaves are named by their picture:
        // lobed oak, round apple, and painted olive each have their own.
        expect(oak).toContain('forest_leaves_lobed')
        expect(apple).toContain('forest_leaves_round')
        expect(olive).toContain('forest_leaves')
        expect(oak.find((name) => name.startsWith('forest_bark_plated'))).toBeDefined()
        expect(oak.find((name) => name.startsWith('forest_bark_plated'))).toBe(apple.find((name) => name.startsWith('forest_bark_plated')))
        expect(alone).toEqual(['oak_wood', 'oak_leaves'])
    }, 60000)

    it('end with a list of the props, their files, materials and colours', async () => {
        const groups = colourGroups(propsOf('oak', 'apple'))
        const colours = usualColours(groups)
        const entries = [setEntryOf('oak_01', await exportIn('oak', 'forest')), setEntryOf('apple_01', await exportIn('apple', 'forest'))]
        const list = JSON.parse(new TextDecoder().decode(setListFile('forest', entries, groups, colours).bytes))

        expect(list.set).toBe('forest')
        expect(list.props.map((prop: {name: string}) => prop.name)).toEqual(['oak_01', 'apple_01'])
        expect(list.materials).toContain('forest_leaves_lobed')
        expect(list.colours).toContainEqual({setting: 'Tree: Palette', colour: 'Forest green'})
    }, 60000)
})
