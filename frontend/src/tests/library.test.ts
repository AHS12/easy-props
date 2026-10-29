import {describe, expect, it} from 'vitest'
import {LIBRARY_PARTS} from '../assets/library/library'
import {findComponentGenerator} from '../assets/trees/component-generators'
import {createInitialScene} from '../core/scene/initial-scene'
import {findAttachment} from '../core/scene/attachment'
import {
    addComponent,
    copyComponent,
    mergeGenerated,
    removeComponent,
    restoreComponentDefault,
    updateComponentParameters,
    updateTreeParameters,
} from '../core/scene/scene-ops'
import type {SceneComponent} from '../assets/shared/component-types'
import {getStyleProfile} from '../assets/style/style-profiles'

const STYLE = getStyleProfile('low-poly')

function manualPart(id: string, parentId: string | null = null): SceneComponent {
    return {
        id,
        type: 'branch',
        generatorId: 'branch',
        generatorVersion: 1,
        parentId,
        transform: {position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1]},
        parameters: {length: 1},
        seed: 1,
        slot: null,
        edited: true,
    }
}

describe('the library', () => {
    it('has a part in every category', () => {
        const categories = new Set(LIBRARY_PARTS.map((part) => part.category))

        expect(categories.size).toBe(4)
    })

    it('gives every part a unique id', () => {
        const ids = LIBRARY_PARTS.map((part) => part.id)

        expect(new Set(ids).size).toBe(ids.length)
    })

    it('gives every part parameters its generator accepts', () => {
        for (const part of LIBRARY_PARTS) {
            const generator = findComponentGenerator(part.generatorId)

            expect(generator, `${part.id} has no generator`).toBeDefined()

            const validated = generator!.validate(part.parameters)

            expect(validated.issues).toEqual([])
        }
    })

    it('gives every part a name and a description in plain language', () => {
        for (const part of LIBRARY_PARTS) {
            expect(part.name.length).toBeGreaterThan(0)
            expect(part.description.length).toBeGreaterThan(0)
            expect(part.description.toLowerCase()).not.toContain('poly')
            expect(part.description.toLowerCase()).not.toContain('mesh')
        }
    })
})

describe('attachment', () => {
    it('puts a root at the base of the trunk', () => {
        const scene = createInitialScene()
        const root = LIBRARY_PARTS.find((part) => part.category === 'roots')!

        const attachment = findAttachment(scene, root)

        expect(attachment.parentId).toBe('cmp-trunk-0')
        expect(attachment.position[1]).toBeLessThan(0.2)
    })

    it('puts a leaf clump on a branch, never in mid-air', () => {
        const scene = createInitialScene()
        const leaf = LIBRARY_PARTS.find((part) => part.category === 'foliage')!

        const attachment = findAttachment(scene, leaf)

        expect(attachment.parentId).not.toBeNull()
        expect(attachment.parentId).not.toBe('cmp-trunk-0')
    })

    it('gives every part an attachment', () => {
        const scene = createInitialScene()

        for (const part of LIBRARY_PARTS) {
            const attachment = findAttachment(scene, part)

            expect(attachment.parentId).not.toBeNull()
            expect(Number.isFinite(attachment.position[0])).toBe(true)
            expect(Number.isFinite(attachment.position[1])).toBe(true)
            expect(Number.isFinite(attachment.position[2])).toBe(true)
        }
    })
})

describe('adding and removing parts', () => {
    it('adds a part with no slot, so a rebuild leaves it alone', () => {
        const scene = createInitialScene()
        const part = manualPart('man-1')

        const updated = addComponent(scene, 'asset-1', part)

        expect(updated.assets[0].components.some((c) => c.id === 'man-1')).toBe(true)
        expect(updated.assets[0].components.find((c) => c.id === 'man-1')?.slot).toBeNull()
    })

    it('keeps a hand-added part through a rebuild', () => {
        const scene = createInitialScene()
        const withPart = addComponent(scene, 'asset-1', manualPart('man-1'))

        const rebuilt = updateTreeParameters(
            withPart,
            'asset-1',
            {height: 6},
            STYLE,
        )

        expect(rebuilt.assets[0].components.some((c) => c.id === 'man-1')).toBe(true)
    })

    it('removes a part and everything hanging off it', () => {
        const scene = createInitialScene()
        const asset = scene.assets[0]

        const branch = asset.components.find((c) => c.type === 'branch')!
        const child = asset.components.find((c) => c.parentId === branch.id)

        const updated = removeComponent(scene, branch.id)

        expect(updated.assets[0].components.some((c) => c.id === branch.id)).toBe(false)

        if (child) {
            expect(updated.assets[0].components.some((c) => c.id === child.id)).toBe(false)
        }
    })

    it('copies a part with a new identity and the same shape', () => {
        const scene = createInitialScene()
        const branch = scene.assets[0].components.find((c) => c.type === 'branch')!

        const updated = copyComponent(scene, branch.id, (attempt) => `copy-${attempt}`)

        const copy = updated.assets[0].components.find((c) => c.id === 'copy-0')

        expect(copy).toBeDefined()
        expect(copy!.parameters).toEqual(branch.parameters)
        expect(copy!.id).not.toBe(branch.id)
        expect(copy!.slot).toBeNull()
    })

    it('restores a part to the generator defaults', () => {
        const scene = createInitialScene()
        const branch = scene.assets[0].components.find((c) => c.type === 'branch')!

        const edited = updateComponentParameters(scene, branch.id, {length: 9})
        expect(
            edited.assets[0].components.find((c) => c.id === branch.id)?.parameters.length,
        ).toBe(9)

        const restored = restoreComponentDefault(edited, branch.id)

        expect(
            restored.assets[0].components.find((c) => c.id === branch.id)?.parameters.length,
        ).toBeUndefined()
    })
})

describe('merging a rebuild', () => {
    it('keeps a hand-shaped part and takes only its new position', () => {
        const scene = createInitialScene()
        const branch = scene.assets[0].components.find((c) => c.type === 'branch')!

        const edited = updateComponentParameters(scene, branch.id, {length: 9})
        const rebuilt = updateTreeParameters(edited, 'asset-1', {height: 6}, STYLE)

        const merged = rebuilt.assets[0].components.find((c) => c.id === branch.id)

        expect(merged?.parameters.length).toBe(9)
        expect(merged?.edited).toBe(true)
    })

    it('replaces a part the user never touched', () => {
        const scene = createInitialScene()
        const rebuilt = updateTreeParameters(scene, 'asset-1', {height: 6}, STYLE)

        const trunk = rebuilt.assets[0].components.find((c) => c.type === 'trunk')!

        expect(trunk.parameters.height).toBe(6)
        expect(trunk.edited).toBe(false)
    })

    it('never drops a part the user added', () => {
        const scene = createInitialScene()
        const withPart = addComponent(scene, 'asset-1', manualPart('man-1'))

        const merged = mergeGenerated(
            withPart.assets[0].components,
            withPart.assets[0].components.filter((c) => c.slot !== null),
        )

        expect(merged.some((c) => c.id === 'man-1')).toBe(true)
    })
})
