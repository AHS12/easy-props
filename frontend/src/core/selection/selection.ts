/**
 * Selection state and the rules that change it.
 *
 * Pure functions over a small state object, so the behaviour can be tested
 * without a viewport or a DOM.
 */

import {describeComponent} from '../../assets/shared/component-types'
import {findComponent, type Scene} from '../scene/scene-model'

export interface SelectionState {
    readonly selectedId: string | null
    readonly hoveredId: string | null
}

export const EMPTY_SELECTION: SelectionState = {
    selectedId: null,
    hoveredId: null,
}

/**
 * Selects a component.
 *
 * Selecting the already-selected component keeps it selected: a second click
 * should not deselect, because the user is usually adjusting rather than
 * dismissing.
 */
export function selectComponent(state: SelectionState, componentId: string): SelectionState {
    if (state.selectedId === componentId) {
        return state
    }

    return {...state, selectedId: componentId}
}

/** Hovers a component. Passing `null` clears the hover. */
export function hoverComponent(state: SelectionState, componentId: string | null): SelectionState {
    if (state.hoveredId === componentId) {
        return state
    }

    return {...state, hoveredId: componentId}
}

/** Clears the selection. The hover is left alone. */
export function clearSelection(state: SelectionState): SelectionState {
    if (state.selectedId === null) {
        return state
    }

    return {...state, selectedId: null}
}

export function isSelected(state: SelectionState, componentId: string): boolean {
    return state.selectedId === componentId
}

/**
 * The message announced to screen readers.
 *
 * Reads as a sentence, because it is spoken rather than read.
 */
export function selectionAnnouncement(scene: Scene, state: SelectionState): string {
    if (!state.selectedId) {
        return ''
    }

    const component = findComponent(scene, state.selectedId)
    if (!component) {
        return ''
    }

    return `Selected: ${describeComponent(component.type)}`
}
