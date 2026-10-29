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
    moveComponent as moveComponentInScene,
    removeComponent,
    restoreComponentDefault,
    setAssetSeed,
    setComponentPosition as setComponentPositionInScene,
    setSurfacePushes,
    updateComponentParameters,
    updateTreeParameters,
} from '../core/scene/scene-ops'
import {STYLE_ORDER} from '../assets/style/style-profiles'
import {exportGLB} from '../core/export/glb-exporter'
import {parseProject, ProjectFileError, serializeProject} from '../core/project/project-document'
import {exportGLBFile, openProjectFile, saveProjectFile} from '../platform/desktop'
import {findAttachment} from '../core/scene/attachment'
import type {Scene, SceneMaterials} from '../core/scene/scene-model'
import type {ShadingMode} from '../assets/style/shading'

/** Saves read back as whatever the file says; anything odd falls back. */
function asStyleId(value: string): StyleProfileId {
    return STYLE_ORDER.includes(value as StyleProfileId)
        ? (value as StyleProfileId)
        : STYLE_ORDER[0]
}

function fileNameOf(path: string): string {
    const parts = path.split(/[\\/]/)
    return parts[parts.length - 1] || path
}

function describeFailure(error: unknown, action: 'save' | 'open' | 'export'): string {
    if (error instanceof ProjectFileError) {
        return error.message
    }

    const detail = error instanceof Error ? error.message : String(error)

    return `Could not ${action} the file. ${detail}`
}
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
    /** Moves a part along one axis, in metres. */
    moveComponent(componentId: string, axis: 'x' | 'y' | 'z', value: number): void
    /** True while the move gizmo is showing. */
    moveTool: boolean
    setMoveTool(on: boolean): void
    /** Shows a move without recording history. Used while dragging. */
    previewPosition(componentId: string, position: readonly [number, number, number]): void
    /** Records the move a drag ended with as one undo step. */
    commitPosition(
        before: Scene,
        componentId: string,
        position: readonly [number, number, number],
    ): void
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

    /** Where this project was last saved, or null if never. */
    filePath: string | null
    /** Keys an older build should write back untouched. */
    projectExtras: Readonly<Record<string, unknown>>
    /** Writes the project. `saveAs` always asks for a new path. */
    saveProject(saveAs?: boolean): Promise<void>
    /** Replaces the session with a project from disk. */
    openProject(): Promise<void>
    /** Writes a GLB beside wherever the user chooses. */
    exportModel(): Promise<void>
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

        moveComponent: (componentId, axis, value) =>
            commit(
                `move ${axis}`,
                (scene) => moveComponentInScene(scene, componentId, axis, value),
            ),

        moveTool: false,

        setMoveTool: (on) => set({moveTool: on}),

        previewPosition: (componentId, position) => {
            const state = get()

            set({scene: setComponentPositionInScene(state.scene, componentId, position)})
        },

        commitPosition: (before, componentId, position) =>
            commit(
                'move part',
                (scene) => setComponentPositionInScene(scene, componentId, position),
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

        filePath: null,
        projectExtras: {},

        saveProject: async (saveAs) => {
            const state = get()
            const text = serializeProject({
                scene: state.scene,
                style: state.style,
                extras: state.projectExtras,
            })

            try {
                const path = await saveProjectFile(
                    text,
                    saveAs ? null : state.filePath,
                    'my-tree.json',
                )

                if (path) {
                    set({
                        filePath: path,
                        toast: {message: `Saved ${fileNameOf(path)}`, undoable: false},
                    })
                }
            } catch (error) {
                set({toast: {message: describeFailure(error, 'save'), undoable: false}})
            }
        },

        openProject: async () => {
            try {
                const opened = await openProjectFile()

                if (!opened) {
                    return
                }

                // Parsing throws before anything is set, so a bad file leaves
                // the session exactly as it was.
                const project = parseProject(opened.text)

                set({
                    scene: project.scene,
                    style: asStyleId(project.style),
                    filePath: opened.path,
                    projectExtras: project.extras,
                    selection: EMPTY_SELECTION,
                    history: EMPTY_HISTORY,
                    toast: {message: `Opened ${fileNameOf(opened.path)}`, undoable: false},
                })
            } catch (error) {
                set({toast: {message: describeFailure(error, 'open'), undoable: false}})
            }
        },

        exportModel: async () => {
            const state = get()

            try {
                const bytes = await exportGLB(state.scene, {style: getStyleProfile(state.style)})
                const path = await exportGLBFile(bytes, 'my-tree.glb')

                if (path) {
                    set({toast: {message: `Exported ${fileNameOf(path)}`, undoable: false}})
                }
            } catch (error) {
                set({toast: {message: describeFailure(error, 'export'), undoable: false}})
            }
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
