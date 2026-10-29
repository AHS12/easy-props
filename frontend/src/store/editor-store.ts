/**
 * The editor store.
 *
 * Holds the serializable editor state only. Three.js objects deliberately
 * live outside the store, in the viewport module.
 */

import {create} from 'zustand'
import type {StyleProfileId} from '../assets/style/style-profiles'
import {getStyleProfile} from '../assets/style/style-profiles'
import {
    DEFAULT_LIGHTING,
    TIME_OF_DAY,
    type SceneLighting,
    type TimeOfDay,
} from '../assets/style/lighting'
import type {SpinePoint} from '../assets/shared/geometry-utils'
import {hashSeed} from '../assets/shared/random'
import {
    EMPTY_HISTORY,
    pushHistory,
    redo as redoHistory,
    undo as undoHistory,
    type DocumentState,
    type History,
} from '../core/history/history'
import {
    clearSelection,
    EMPTY_SELECTION,
    hoverComponent,
    selectComponent,
    selectionAnnouncement,
    type SelectionState,
} from '../core/selection/selection'
import {createInitialScene, createSceneFromPreset, DEFAULT_PRESET_ID} from '../core/scene/initial-scene'
import {
    setAssetSeed,
    setTrunkSpine as setTrunkSpineInScene,
    updateComponentParameters,
    updateTreeParameters,
} from '../core/scene/scene-ops'
import type {Scene, SceneMaterials} from '../core/scene/scene-model'
import type {ShadingMode} from '../assets/style/shading'

export type EditorStatus = {
    readonly state: 'ready' | 'busy' | 'error'
    readonly message?: string
}

export interface EditorStore {
    scene: Scene
    style: StyleProfileId
    /** The preset the tree came from, so the rail can show which is active. */
    presetId: string
    /** Where the sun is and how strong the shadow is. */
    lighting: SceneLighting
    /** How the viewport draws the tree. */
    shadingMode: ShadingMode
    selection: SelectionState
    status: EditorStatus
    announcement: string
    history: History

    setStyle(style: StyleProfileId): void
    setHover(componentId: string | null): void
    select(componentId: string): void
    deselect(): void
    setStatus(status: EditorStatus): void

    updateComponentParameters(
        componentId: string,
        patch: Readonly<Record<string, unknown>>,
        label: string,
    ): void
    updateTreeParameters(
        patch: Readonly<Record<string, number | string>>,
        label: string,
    ): void
    setTrunkSpine(spine: readonly SpinePoint[]): void
    /** Moves the trunk without recording history. Used while dragging. */
    previewTrunkSpine(spine: readonly SpinePoint[]): void
    /** Records the trunk edit that a drag ended with. */
    commitTrunkShape(before: Scene, spine: readonly SpinePoint[]): void
    /** Changes the colours the tree is painted with. */
    updateMaterials(patch: Partial<SceneMaterials>, label: string): void
    /** Moves the sun. */
    setLighting(lighting: SceneLighting): void
    /** Moves the sun to a named time of day. */
    setTimeOfDay(time: TimeOfDay): void
    /** Switches the viewport between lit, flat, and wireframe. */
    setShadingMode(mode: ShadingMode): void
    applyPreset(presetId: string): void
    /** Rerolls the tree's variation while keeping its shape. */
    randomizeTree(): void

    undo(): void
    redo(): void
}

const FIRST_ASSET_ID = 'asset-1'

export const useEditorStore = create<EditorStore>((set, get) => {
    /**
     * Records an edit in the history and applies it.
     *
     * The scene graph is what is stored, never the geometry.
     */
    const commit = (
        label: string,
        update: (scene: Scene, style: StyleProfileId) => Scene,
        explicitBefore?: Scene,
    ) => {
        const state = get()
        const before: DocumentState = {
            scene: explicitBefore ?? state.scene,
            style: state.style,
            presetId: state.presetId,
        }
        const scene = update(state.scene, state.style)

        if (scene === state.scene && explicitBefore === undefined) {
            return
        }

        set({
            scene,
            history: pushHistory(state.history, label, before, {
                scene,
                style: state.style,
                presetId: state.presetId,
            }),
        })
    }

    return {
        scene: createInitialScene(),
        style: 'low-poly',
        presetId: DEFAULT_PRESET_ID,
        lighting: DEFAULT_LIGHTING,
        shadingMode: 'lit',
        selection: EMPTY_SELECTION,
        status: {state: 'ready'},
        announcement: '',
        history: EMPTY_HISTORY,

        setStyle: (style) => {
            const state = get()
            const before: DocumentState = {
                scene: state.scene,
                style: state.style,
                presetId: state.presetId,
            }

            set({
                style,
                history: pushHistory(state.history, 'change style', before, {
                    scene: state.scene,
                    style,
                    presetId: state.presetId,
                }),
            })
        },

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

        updateComponentParameters: (componentId, patch, label) =>
            commit(label, (scene) => updateComponentParameters(scene, componentId, patch)),

        updateTreeParameters: (patch, label) =>
            commit(label, (scene, style) =>
                updateTreeParameters(scene, FIRST_ASSET_ID, patch, getStyleProfile(style)),
            ),

        setTrunkSpine: (spine) =>
            commit('shape trunk', (scene, style) =>
                setTrunkSpineInScene(scene, FIRST_ASSET_ID, spine, getStyleProfile(style)),
            ),

        previewTrunkSpine: (spine) => {
            const state = get()
            const scene = setTrunkSpineInScene(
                state.scene,
                FIRST_ASSET_ID,
                spine,
                getStyleProfile(state.style),
            )

            set({scene})
        },

        commitTrunkShape: (before, spine) =>
            commit(
                'shape trunk',
                (scene, style) =>
                    setTrunkSpineInScene(scene, FIRST_ASSET_ID, spine, getStyleProfile(style)),
                before,
            ),

        updateMaterials: (patch, label) =>
            commit(label, (scene) => ({
                ...scene,
                assets: scene.assets.map((asset) =>
                    asset.id === FIRST_ASSET_ID
                        ? {...asset, materials: {...asset.materials, ...patch}}
                        : asset,
                ),
            })),

        setLighting: (lighting) => set({lighting}),

        setTimeOfDay: (time) => set({lighting: TIME_OF_DAY[time]}),

        setShadingMode: (shadingMode) => set({shadingMode}),

        applyPreset: (presetId) => {
            const state = get()
            const before: DocumentState = {
                scene: state.scene,
                style: state.style,
                presetId: state.presetId,
            }
            const scene = createSceneFromPreset(presetId)

            set({
                scene,
                presetId,
                history: pushHistory(state.history, 'change tree', before, {
                    scene,
                    style: state.style,
                    presetId,
                }),
            })
        },

        randomizeTree: () => {
            const state = get()
            const currentSeed = state.scene.assets[0]?.seed ?? 1
            const seed = hashSeed(currentSeed, currentSeed + 1)

            commit('surprise me', (scene, style) =>
                setAssetSeed(scene, FIRST_ASSET_ID, seed, getStyleProfile(style)),
            )
        },

        undo: () => {
            const result = undoHistory(get().history)

            if (!result) {
                return
            }

            set({
                scene: result.document.scene,
                style: result.document.style,
                presetId: result.document.presetId,
                history: result.history,
            })
        },

        redo: () => {
            const result = redoHistory(get().history)

            if (!result) {
                return
            }

            set({
                scene: result.document.scene,
                style: result.document.style,
                presetId: result.document.presetId,
                history: result.history,
            })
        },
    }
})
