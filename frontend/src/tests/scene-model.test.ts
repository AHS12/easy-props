import {describe, expect, it} from 'vitest'
import {getStyleProfile, STYLE_PROFILES} from '../assets/style/style-profiles'
import {describeComponent} from '../assets/shared/component-types'
import {
    clearSelection,
    EMPTY_SELECTION,
    hoverComponent,
    isSelected,
    selectComponent,
    selectionAnnouncement,
} from '../core/selection/selection'
import {createInitialScene} from '../core/scene/initial-scene'
import {updateComponentParameters, updateTreeParameters} from '../core/scene/scene-ops'
import {findComponent} from '../core/scene/scene-model'

const TRUNK_ID = 'cmp-trunk-0'

describe('scene operations', () => {
    it('merges a patch into the component parameters', () => {
        const scene = createInitialScene()

        const updated = updateComponentParameters(scene, TRUNK_ID, {baseRadius: 0.5})

        const component = findComponent(updated, TRUNK_ID)
        expect(component?.parameters.baseRadius).toBe(0.5)
    })

    it('keeps parameters that the patch does not mention', () => {
        const scene = createInitialScene()

        const updated = updateComponentParameters(scene, TRUNK_ID, {baseRadius: 0.5})

        const component = findComponent(updated, TRUNK_ID)
        expect(component?.parameters.height).toBe(4.2)
    })

    it('does not mutate the input scene', () => {
        const scene = createInitialScene()
        const before = findComponent(scene, TRUNK_ID)?.parameters.baseRadius

        updateComponentParameters(scene, TRUNK_ID, {baseRadius: 0.9})

        expect(findComponent(scene, TRUNK_ID)?.parameters.baseRadius).toBe(before)
    })

    it('leaves other components untouched', () => {
        const scene = createInitialScene()
        const updated = updateComponentParameters(scene, 'cmp-does-not-exist', {baseRadius: 0.9})

        expect(updated).toEqual(scene)
    })

    it('rebuilds the tree when a tree parameter changes', () => {
        const scene = createInitialScene()

        const updated = updateTreeParameters(
            scene,
            'asset-1',
            {height: 6},
            getStyleProfile('low-poly'),
        )

        const component = findComponent(updated, TRUNK_ID)
        expect(component?.parameters.height).toBe(6)
    })

    it('keeps the branch layout when a tree parameter changes', () => {
        const scene = createInitialScene()
        const before = scene.assets[0].components.length

        const updated = updateTreeParameters(
            scene,
            'asset-1',
            {height: 6},
            getStyleProfile('low-poly'),
        )

        expect(updated.assets[0].components.length).toBe(before)
    })
})

describe('scene model', () => {
    it('finds a component by id', () => {
        const scene = createInitialScene()

        expect(findComponent(scene, TRUNK_ID)).toBeDefined()
        expect(findComponent(scene, 'nope')).toBeUndefined()
    })

    it('names component types in plain language', () => {
        expect(describeComponent('trunk')).toBe('Trunk')
        expect(describeComponent('foliage-cluster')).toBe('Leaf clump')
    })
})

describe('selection', () => {
    it('selects a component', () => {
        const state = selectComponent(EMPTY_SELECTION, 'cmp-1')

        expect(state.selectedId).toBe('cmp-1')
        expect(isSelected(state, 'cmp-1')).toBe(true)
    })

    it('keeps the selection when the same component is selected again', () => {
        const first = selectComponent(EMPTY_SELECTION, 'cmp-1')
        const second = selectComponent(first, 'cmp-1')

        expect(second).toBe(first)
    })

    it('tracks hover separately from selection', () => {
        const selected = selectComponent(EMPTY_SELECTION, 'cmp-1')
        const hovered = hoverComponent(selected, 'cmp-2')

        expect(hovered.selectedId).toBe('cmp-1')
        expect(hovered.hoveredId).toBe('cmp-2')
    })

    it('clears the selection but keeps the hover', () => {
        const state = hoverComponent(selectComponent(EMPTY_SELECTION, 'cmp-1'), 'cmp-2')
        const cleared = clearSelection(state)

        expect(cleared.selectedId).toBeNull()
        expect(cleared.hoveredId).toBe('cmp-2')
    })

    it('announces the selection as a sentence', () => {
        const scene = createInitialScene()
        const state = selectComponent(EMPTY_SELECTION, TRUNK_ID)

        expect(selectionAnnouncement(scene, state)).toBe('Selected: Trunk')
    })

    it('announces nothing when nothing is selected', () => {
        expect(selectionAnnouncement(createInitialScene(), EMPTY_SELECTION)).toBe('')
    })
})

describe('style profiles', () => {
    it('uses fewer segments for the low-poly profile', () => {
        expect(getStyleProfile('low-poly').radialSegments).toBeLessThan(
            getStyleProfile('detailed').radialSegments,
        )
    })

    it('uses flat shading for the low-poly profile only', () => {
        expect(getStyleProfile('low-poly').flatShading).toBe(true)
        expect(getStyleProfile('detailed').flatShading).toBe(false)
    })

    it('keeps every profile within its polygon budget', () => {
        for (const profile of Object.values(STYLE_PROFILES)) {
            expect(profile.polygonBudget).toBeGreaterThan(0)
            expect(profile.radialSegments).toBeGreaterThanOrEqual(3)
            expect(profile.heightSegments).toBeGreaterThanOrEqual(1)
        }
    })
})
