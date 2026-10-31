import {describe, expect, it} from 'vitest'
import {createSceneFromPreset} from './initial-scene'
import {ancestorsOf, buildOutline, type OutlineNode} from './outline'
import {removeComponent, restoreComponentDefault} from './scene-ops'

const flat = (nodes: readonly OutlineNode[]): OutlineNode[] => nodes.flatMap((node) => [node, ...flat(node.children)])

describe('the outline of a painted tree', () => {
    const scene = createSceneFromPreset('blossom-tree')

    it('offers every real part except the bark, which is the whole tree', () => {
        const parts = scene.assets[0].components.filter((part) => part.generatorId !== 'painted-bark')
        const listed = flat(buildOutline(scene)).flatMap((node) => (node.componentId ? [node.componentId] : []))

        expect(new Set(listed)).toEqual(new Set(parts.map((part) => part.id)))
    })

    it('keeps a removed part listed, and restoring it brings it back', () => {
        const clump = scene.assets[0].components.find((part) => part.generatorId === 'painted-clump')!
        const removed = removeComponent(scene, clump.id)
        const row = flat(buildOutline(removed)).find((node) => node.removed)

        expect(row?.removed).toEqual({kind: 'clump', key: clump.parameters.key})
        expect(flat(buildOutline(removed)).some((node) => node.componentId === clump.id)).toBe(false)
    })

    it('marks a hand-edited part', () => {
        const clump = scene.assets[0].components.find((part) => part.generatorId === 'painted-clump')!
        const untouched = flat(buildOutline(restoreComponentDefault(scene, clump.id)))

        expect(untouched.find((node) => node.componentId === clump.id)?.edited).toBe(false)
    })

    it('finds the rows above a part', () => {
        const nodes = buildOutline(scene)
        const clump = flat(nodes).find((node) => node.label === 'Clump 1')!

        expect(ancestorsOf(nodes, clump.id)).toEqual(['group-Leaves'])
    })
})
