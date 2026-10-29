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
import type {SpineLike} from '../assets/shared/spines'
import type {ShapeTool} from '../assets/shared/pushes'
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
    addComponent,
    copyComponent as copyComponentInScene,
    removeComponent,
    restoreComponentDefault,
    setAssetSeed,
    setSurfacePushes,
    updateComponentParameters,
    updateTreeParameters,
} from '../core/scene/scene-ops'
import {findAttachment} from '../core/scene/attachment'
import type {Scene, SceneMaterials} from '../core/scene/scene-model'
import type {ShadingMode} from '../assets/style/shading'
import type {LibraryPart} from '../assets/library/library'
import {findComponentGenerator} from '../assets/trees/component-generators'
import {describeComponent, type SceneComponent, type SurfacePush} from '../assets/shared/component-types'

export type EditorStatus = {
    readonly state: 'ready' | 'busy' | 'error'
    readonly message?: string
}

/** A short message with an action, such as undoing a removal. */
export interface Toast {
    readonly message: string
    /** Set when the toast offers an undo. */
    readonly undoable: boolean
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
    toast: Toast | null
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
    /** Moves a part's spine and records one undo step for the whole move. */
    setSpine(componentId: string, spine: readonly SpineLike[]): void
    /** Moves a spine without recording history. Used while dragging. */
    previewSpine(componentId: string, spine: readonly SpineLike[]): void
    /** Records the move a drag ended with as one undo step. */
    commitSpine(before: Scene, componentId: string, spine: readonly SpineLike[]): void
    /** Which shape tool is armed: off, push, or pull. */
    shapeTool: ShapeTool
    setShapeTool(tool: ShapeTool): void
    /** Shows a push without recording history. Used while dragging. */
    previewPushes(componentId: string, pushes: readonly SurfacePush[]): void
    /** Records the push a drag ended with as one undo step. */
    commitPushes(before: Scene, componentId: string, pushes: readonly SurfacePush[]): void
    /** Replaces a part's pushes. Undoable. */
    setPushes(componentId: string, pushes: readonly SurfacePush[]): void
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

    /** Adds a part from the library and selects it. */
    addLibraryPart(part: LibraryPart): void
    /** Copies a part and everything hanging off it. */
    copyComponent(componentId: string): void
    /** Removes a part and everything hanging off it. */
    deleteComponent(componentId: string): void
    /** Puts a part back to the generator's defaults. */
    restoreComponent(componentId: string): void
    /** Puts the tree back to the preset it came from. */
    restoreTree(): void
    dismissToast(): void

    undo(): void
    redo(): void
}

const FIRST_ASSET_ID = 'asset-1'

/** An id that is not already used in the scene. */
function uniqueComponentId(scene: Scene, base: string): string {
    const taken = new Set(scene.assets[0]?.components.map((component) => component.id) ?? [])

    let id = base
    let attempt = 1

    while (taken.has(id)) {
        id = `${base}-${attempt}`
        attempt += 1
    }

    return id
}

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
        toast: null,
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

        setSpine: (componentId, spine) =>
            commit('shape part', (scene) =>
                updateComponentParameters(scene, componentId, {spine}),
            ),

        previewSpine: (componentId, spine) => {
            const state = get()

            set({
                scene: updateComponentParameters(state.scene, componentId, {spine}),
            })
        },

        commitSpine: (before, componentId, spine) =>
            commit('shape part', (scene) => updateComponentParameters(scene, componentId, {spine}), before),

        shapeTool: 'off',

        setShapeTool: (tool) => set({shapeTool: tool}),

        previewPushes: (componentId, pushes) => {
            const state = get()

            set({scene: setSurfacePushes(state.scene, componentId, pushes)})
        },

        commitPushes: (before, componentId, pushes) =>
            commit('push surface', (scene) => setSurfacePushes(scene, componentId, pushes), before),

        setPushes: (componentId, pushes) =>
            commit('change pushes', (scene) => setSurfacePushes(scene, componentId, pushes)),

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

        addLibraryPart: (part) => {
            const state = get()
            const attachment = findAttachment(state.scene, part)
            // Run the part through its own generator, so the component gets a
            // complete parameter set. A library entry only names the values it
            // cares about, and anything derived from them (a branch's spine,
            // for one) has to exist before the handles can find it.
            const generator = findComponentGenerator(part.generatorId)
            const parameters = (generator
                ? generator.validate(part.parameters).parameters
                : part.parameters) as Readonly<Record<string, unknown>>

            const component: SceneComponent = {
                id: uniqueComponentId(state.scene, `man-${part.type}-${attachment.seed % 100000}`),
                type: part.type,
                generatorId: part.generatorId,
                generatorVersion: 1,
                parentId: attachment.parentId,
                transform: {
                    position: attachment.position,
                    rotation: attachment.rotation,
                    scale: [1, 1, 1],
                },
                parameters,
                seed: attachment.seed,
                // A part the user added is theirs. A rebuild leaves it alone.
                slot: null,
                edited: true,
            }

            commit(`add ${part.name.toLowerCase()}`, (scene) =>
                addComponent(scene, FIRST_ASSET_ID, component),
            )

            set((current) => ({
                selection: selectComponent(current.selection, component.id),
                announcement: `Added ${part.name}`,
            }))
        },

        copyComponent: (componentId) => {
            const state = get()
            const source = state.scene.assets[0]?.components.find((c) => c.id === componentId)

            if (!source) {
                return
            }

            const copies: string[] = []

            commit('copy part', (scene) =>
                copyComponentInScene(scene, componentId, (attempt) => {
                    const id = uniqueComponentId(
                        scene,
                        `man-${source.type}-${hashSeed(source.seed, attempt + 1) % 100000}`,
                    )
                    copies.push(id)
                    return id
                }),
            )

            const first = copies[0]

            if (first) {
                set((current) => ({
                    selection: selectComponent(current.selection, first),
                    announcement: 'Copied part',
                }))
            }
        },

        deleteComponent: (componentId) => {
            const state = get()
            const source = state.scene.assets[0]?.components.find((c) => c.id === componentId)

            if (!source) {
                return
            }

            commit('remove part', (scene) => removeComponent(scene, componentId))

            set((current) => ({
                selection:
                    current.selection.selectedId === componentId
                        ? clearSelection(current.selection)
                        : current.selection,
                toast: {message: `Removed ${describeComponent(source.type)}`, undoable: true},
            }))
        },

        restoreComponent: (componentId) =>
            commit('restore part', (scene) => restoreComponentDefault(scene, componentId)),

        restoreTree: () => {
            const state = get()
            const before: DocumentState = {
                scene: state.scene,
                style: state.style,
                presetId: state.presetId,
            }
            const scene = createSceneFromPreset(state.presetId)

            set({
                scene,
                history: pushHistory(state.history, 'restore tree', before, {
                    scene,
                    style: state.style,
                    presetId: state.presetId,
                }),
                toast: {message: 'Tree restored', undoable: true},
            })
        },

        dismissToast: () => set({toast: null}),

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
