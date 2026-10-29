/**
 * The editor store.
 *
 * Holds the serializable editor state only. Three.js objects deliberately
 * live outside the store, in the viewport module.
 */

import {create} from 'zustand'
import type {StyleProfileId} from '../assets/style/style-profiles'
import {
    clearSelection,
    EMPTY_SELECTION,
    hoverComponent,
    selectComponent,
    selectionAnnouncement,
    type SelectionState,
} from '../core/selection/selection'
import {createInitialScene} from '../core/scene/initial-scene'
import {updateComponentParameters} from '../core/scene/scene-ops'
import type {Scene} from '../core/scene/scene-model'

export type EditorStatus = {
    readonly state: 'ready' | 'busy' | 'error'
    readonly message?: string
}

export interface EditorStore {
    scene: Scene
    style: StyleProfileId
    selection: SelectionState
    status: EditorStatus
    /** Text for the polite live region. */
    announcement: string

    setStyle(style: StyleProfileId): void
    setHover(componentId: string | null): void
    select(componentId: string): void
    deselect(): void
    setStatus(status: EditorStatus): void
    updateParameters(componentId: string, patch: Readonly<Record<string, unknown>>): void
}

export const useEditorStore = create<EditorStore>((set) => ({
    scene: createInitialScene(),
    style: 'low-poly',
    selection: EMPTY_SELECTION,
    status: {state: 'ready'},
    announcement: '',

    setStyle: (style) => set({style}),

    setHover: (componentId) =>
        set((state) => ({selection: hoverComponent(state.selection, componentId)})),

    select: (componentId) =>
        set((state) => {
            const selection = selectComponent(state.selection, componentId)
            return {
                selection,
                announcement: selectionAnnouncement(state.scene, selection),
            }
        }),

    deselect: () =>
        set((state) => {
            const selection = clearSelection(state.selection)
            return {selection, announcement: selectionAnnouncement(state.scene, selection)}
        }),

    setStatus: (status) => set({status}),

    updateParameters: (componentId, patch) =>
        set((state) => ({scene: updateComponentParameters(state.scene, componentId, patch)})),
}))
