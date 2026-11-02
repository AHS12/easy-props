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
    updateComponentParameters,
    updateTreeParameters,
} from '../core/scene/scene-ops'
import {STYLE_ORDER} from '../assets/style/style-profiles'
import {batchItems, type BatchChoice} from '../core/export/batch-items'
import {APP_VERSION, loadBudgetTarget, saveBudgetTarget, type ExportPreferences} from '../core/export/export-preferences'
import {runBatch, type BatchSummary} from '../core/export/pipeline/batch'
import type {BudgetTargetId, FaceCounts} from '../core/export/pipeline/budget'
import {renderTreeThumbnail} from '../core/export/tree-thumbnail'
import {parseProject, ProjectFileError, serializeProject} from '../core/project/project-document'
import {openProjectFile, saveProjectFile, writeFilesTo} from '../platform/desktop'
import {
    clearDraftText,
    readDraftText,
    writeDraftText,
} from '../platform/draft'
import {
    deleteTree,
    listTrees,
    newTreeId,
    readTree,
    writeTree,
    type SavedTree,
} from '../platform/library'
import {findAttachment} from '../core/scene/attachment'
import {parseEdits} from '../assets/trees/painted/edits'
import {findPreset} from '../assets/trees/presets'
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

function describeFailure(
    error: unknown,
    action: 'save' | 'open' | 'export' | 'read' | 'delete',
): string {
    if (error instanceof ProjectFileError) {
        return error.message
    }

    const detail = error instanceof Error ? error.message : String(error)

    return `Could not ${action} the file. ${detail}`
}

/** A name that is not already in the gallery. "Oak" becomes "Oak 2". */
function copyNameOf(base: string, gallery: readonly SavedTree[]): string {
    const taken = new Set(gallery.map((tree) => tree.name))

    if (!taken.has(base)) {
        return base
    }

    let count = 2

    while (taken.has(`${base} ${count}`)) {
        count += 1
    }

    return `${base} ${count}`
}
import type {LibraryPart} from '../assets/library/library'
import {findComponentGenerator} from '../assets/component-generators'
import {describeComponent, type SceneComponent} from '../assets/shared/component-types'

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

/** How far a batch has got. It has a summary once it has finished. */
export interface BatchState {
    readonly done: number
    readonly total: number
    readonly current: string | null
    readonly summary: BatchSummary | null
}

/** Stops the batch that is running. Not state: nothing draws it. */
let batchController: AbortController | null = null

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
    /** Starts a fresh prop from a preset, named after it, and leaves the saved one alone. */
    startNewProp(presetId: string): void
    /** Brings back a part of a painted tree that was removed. */
    restoreRemovedPart(kind: 'limb' | 'clump', key: string): void
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
    /** Writes the project to a file the user picks. */
    saveProjectToFile(): Promise<void>
    /** Opens a project file the user picks. */
    openProject(): Promise<void>
    /** Opens the export panel. */
    exportModel(): void
    exportOpen: boolean
    closeExport(): void
    /** Closes the export panel and says what it wrote. */
    finishExport(message: string): void
    /** The panel for exporting many props. A batch outlives it. */
    batchOpen: boolean
    openBatch(): void
    closeBatch(): void
    /** The batch running or just finished, or null. */
    batch: BatchState | null
    startBatch(choices: readonly BatchChoice[], variations: number, preferences: ExportPreferences): void
    cancelBatch(): void
    clearBatch(): void
    /** Which detail level the viewport is showing. */
    previewLevel: number
    setPreviewLevel(level: number): void
    /** The faces the current prop will export with at full detail. */
    faceCounts: FaceCounts
    setFaceCounts(counts: FaceCounts): void
    /** The faces of the detail level on screen. */
    shownFaceCounts: FaceCounts
    setShownFaceCounts(counts: FaceCounts): void
    budgetTarget: BudgetTargetId
    setBudgetTarget(target: BudgetTargetId): void

    /** Every tree in the gallery, newest first. */
    gallery: readonly SavedTree[]
    galleryLoading: boolean
    /** Which screen is showing. The app opens on the gallery. */
    page: 'gallery' | 'editor'
    showGallery(): void
    showEditor(): void
    /** The gallery entry this session belongs to, once it has one. */
    currentTreeId: string | null
    treeName: string
    setTreeName(name: string): void
    refreshGallery(): Promise<void>
    /** Saves the tree being edited, updating its entry. A copy is a new one. */
    saveTree(asCopy?: boolean): Promise<void>
    /** The name prompt, while saving something that needs a name. */
    savePrompt: SavePrompt | null
    /** Saves with the name the user chose. A blank name keeps the suggestion. */
    finishSave(name: string): Promise<void>
    cancelSave(): void
    openTree(id: string): Promise<void>
    /** Gives a saved tree a new name, leaving everything else and its preview. */
    renameTree(id: string, name: string): Promise<void>
    removeTree(id: string): Promise<void>

    /**
     * The document as it was last written.
     *
     * Compared by identity, not by value: the store keeps the same Scene
     * object for an unchanged document, so undo back to the saved point
     * makes the session clean again for free.
     */
    savedScene: Scene
    savedStyle: StyleProfileId
    /** True when there is a draft on disk worth offering back. */
    draftAvailable: boolean
    /** Reads the draft, if there is one. */
    refreshDraft(): Promise<void>
    /** Writes the current document as the draft, or clears it when clean. */
    flushDraft(): Promise<void>
    /** Brings the draft's document back into the session. */
    restoreDraft(): Promise<void>
    discardDraft(): Promise<void>
}

/** What the save prompt is asking for. */
export interface SavePrompt {
    readonly title: string
    /** The name offered, and the fallback if the field is left blank. */
    readonly name: string
    readonly asCopy: boolean
}

/** True when closing would lose something that was never saved. */
export function hasUnsavedChanges(
    state: Pick<EditorStore, 'scene' | 'style' | 'savedScene' | 'savedStyle'>,
): boolean {
    return state.scene !== state.savedScene || state.style !== state.savedStyle
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

    /** Records the document as the saved one, and drops the draft with it. */
    const markSaved = (scene: Scene, style: StyleProfileId) => {
        set({savedScene: scene, savedStyle: style, draftAvailable: false})
        void clearDraftText().catch(() => undefined)
    }

    /** The one write path, so every save records the same things. */
    const saveNow = async (name: string, asCopy: boolean) => {
        const state = get()
        const copy = asCopy || state.currentTreeId === null
        const id = copy ? newTreeId() : state.currentTreeId

        const text = serializeProject({
            scene: state.scene,
            name,
            style: state.style,
            extras: state.projectExtras,
        })

        try {
            // A preview is worth a few milliseconds: a gallery of names is a
            // list, a gallery of trees is a gallery.
            const thumbnail = await renderTreeThumbnail(state.scene, {
                style: getStyleProfile(state.style),
            })

            await writeTree(id as string, text, thumbnail)

            set({
                currentTreeId: id,
                treeName: name,
                toast: {message: `Saved "${name}"`, undoable: false},
            })

            markSaved(state.scene, state.style)

            await get().refreshGallery()
        } catch (error) {
            set({toast: {message: describeFailure(error, 'save'), undoable: false}})
        }
    }

    const initialScene = createInitialScene()

    return {
        scene: initialScene,
        style: 'low-poly',
        savedScene: initialScene,
        savedStyle: 'low-poly',
        draftAvailable: false,
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
                page: 'editor',
                history: pushHistory(state.history, 'change tree', before, {
                    scene,
                    style: state.style,
                    presetId,
                }),
            })
        },

        startNewProp: (presetId) => {
            get().applyPreset(presetId)
            set({
                treeName: findPreset(presetId)?.name ?? 'My prop',
                currentTreeId: null,
                filePath: null,
                selection: EMPTY_SELECTION,
            })
        },

        restoreRemovedPart: (kind, key) =>
            commit('restore part', (scene, style) => {
                const current = scene.assets[0]?.parameters.edits
                const edits = parseEdits(typeof current === 'string' ? current : '')
                const limbs = {...edits.limbs}
                const clumps = {...edits.clumps}

                if (kind === 'limb') {
                    delete limbs[key]
                } else {
                    delete clumps[key]
                }

                return updateTreeParameters(
                    scene,
                    FIRST_ASSET_ID,
                    {edits: JSON.stringify({limbs, clumps})},
                    getStyleProfile(style),
                )
            }),

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
        gallery: [],
        galleryLoading: false,
        page: 'gallery',
        showGallery: () => set({page: 'gallery'}),
        showEditor: () => set({page: 'editor'}),
        currentTreeId: null,
        treeName: 'My tree',

        setTreeName: (name) => set({treeName: name}),

        refreshGallery: async () => {
            set({galleryLoading: true})

            try {
                set({gallery: await listTrees(), galleryLoading: false})
            } catch (error) {
                set({
                    galleryLoading: false,
                    toast: {message: describeFailure(error, 'read'), undoable: false},
                })
            }
        },

        saveTree: async (asCopy) => {
            const state = get()
            const copy = asCopy === true || state.currentTreeId === null

            // Only a save that needs a name asks for one. Updating a tree you
            // already named should not interrupt you.
            if (copy) {
                set({
                    savePrompt: {
                        title: asCopy === true ? 'Save a copy' : 'Name your tree',
                        name: copyNameOf(state.treeName, state.gallery),
                        asCopy: true,
                    },
                })

                return
            }

            await saveNow(state.treeName, false)
        },

        savePrompt: null,

        finishSave: async (name) => {
            const prompt = get().savePrompt
            const chosen = name.trim()

            set({savePrompt: null})

            await saveNow(chosen === '' ? (prompt?.name ?? get().treeName) : chosen, prompt?.asCopy ?? true)
        },

        cancelSave: () => set({savePrompt: null}),

        refreshDraft: async () => {
            try {
                set({draftAvailable: (await readDraftText()) !== null})
            } catch {
                set({draftAvailable: false})
            }
        },

        flushDraft: async () => {
            const state = get()

            try {
                if (!hasUnsavedChanges(state)) {
                    await clearDraftText()
                    set({draftAvailable: false})
                    return
                }

                const text = serializeProject({
                    scene: state.scene,
                    name: state.treeName,
                    style: state.style,
                    extras: state.projectExtras,
                })

                await writeDraftText(JSON.stringify({treeId: state.currentTreeId, text}))
                set({draftAvailable: true})
            } catch {
                // A draft that cannot be written is not worth a toast: the
                // user is mid-edit, and the next change tries again.
            }
        },

        restoreDraft: async () => {
            try {
                const raw = await readDraftText()

                if (!raw) {
                    set({draftAvailable: false})
                    return
                }

                const stored = JSON.parse(raw) as {treeId?: unknown; text?: unknown}

                if (typeof stored.text !== 'string') {
                    set({draftAvailable: false})
                    return
                }

                const project = parseProject(stored.text)
                const style = asStyleId(project.style)
                const treeId = typeof stored.treeId === 'string' ? stored.treeId : null

                set({
                    scene: project.scene,
                    style,
                    treeName: project.name,
                    // Only claim the gallery entry if it still exists.
                    currentTreeId: get().gallery.some((tree) => tree.id === treeId)
                        ? treeId
                        : null,
                    projectExtras: project.extras,
                    selection: EMPTY_SELECTION,
                    history: EMPTY_HISTORY,
                    draftAvailable: false,
                    page: 'editor',
                    toast: {message: 'Picked up where you left off', undoable: false},
                })
            } catch (error) {
                set({toast: {message: describeFailure(error, 'open'), undoable: false}})
            }
        },

        discardDraft: async () => {
            try {
                await clearDraftText()
            } finally {
                set({draftAvailable: false})
            }
        },

        openTree: async (id) => {
            try {
                const project = parseProject(await readTree(id))

                set({
                    scene: project.scene,
                    style: asStyleId(project.style),
                    treeName: project.name,
                    currentTreeId: id,
                    page: 'editor',
                    filePath: null,
                    projectExtras: project.extras,
                    selection: EMPTY_SELECTION,
                    history: EMPTY_HISTORY,
                    toast: {message: `Opened "${project.name}"`, undoable: false},
                })

                markSaved(project.scene, asStyleId(project.style))
            } catch (error) {
                set({toast: {message: describeFailure(error, 'open'), undoable: false}})
            }
        },

        renameTree: async (id, name) => {
            const chosen = name.trim()

            if (chosen === '') {
                return
            }

            try {
                const project = parseProject(await readTree(id))
                const text = serializeProject({
                    scene: project.scene,
                    name: chosen,
                    style: project.style,
                    extras: project.extras,
                })

                // No thumbnail: the library keeps the preview it already has.
                await writeTree(id, text, null)

                set({
                    ...(get().currentTreeId === id ? {treeName: chosen} : {}),
                    toast: {message: `Renamed to "${chosen}"`, undoable: false},
                })

                await get().refreshGallery()
            } catch (error) {
                set({toast: {message: describeFailure(error, 'save'), undoable: false}})
            }
        },

        removeTree: async (id) => {
            const state = get()

            try {
                await deleteTree(id)

                set({
                    currentTreeId: state.currentTreeId === id ? null : state.currentTreeId,
                    toast: {message: 'Tree deleted', undoable: false},
                })

                await get().refreshGallery()
            } catch (error) {
                set({toast: {message: describeFailure(error, 'delete'), undoable: false}})
            }
        },

        saveProjectToFile: async () => {
            const state = get()
            const text = serializeProject({
                scene: state.scene,
                name: state.treeName,
                style: state.style,
                extras: state.projectExtras,
            })

            try {
                const path = await saveProjectFile(text, null, `${state.treeName}.json`)

                if (path) {
                    markSaved(state.scene, state.style)
                    set({toast: {message: `Saved ${fileNameOf(path)}`, undoable: false}})
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
                    treeName: project.name,
                    // A file chosen from disk is not a gallery entry.
                    currentTreeId: null,
                    page: 'editor',
                    filePath: opened.path,
                    projectExtras: project.extras,
                    selection: EMPTY_SELECTION,
                    history: EMPTY_HISTORY,
                    toast: {message: `Opened ${fileNameOf(opened.path)}`, undoable: false},
                })

                markSaved(project.scene, asStyleId(project.style))
            } catch (error) {
                set({toast: {message: describeFailure(error, 'open'), undoable: false}})
            }
        },

        exportModel: () => set({exportOpen: true}),
        exportOpen: false,
        closeExport: () => set({exportOpen: false}),
        finishExport: (message) => set({exportOpen: false, toast: {message, undoable: false}}),
        batchOpen: false,
        openBatch: () => set({batchOpen: true, exportOpen: false}),
        closeBatch: () => set({batchOpen: false}),
        batch: null,
        startBatch: (choices, variations, {engine, levels, collision, wind, join, folder}) => {
            const state = get()

            if (state.batch && !state.batch.summary) {
                return
            }

            const controller = new AbortController()
            const items = batchItems(choices, variations, {
                style: state.style,
                appVersion: APP_VERSION,
                readInSavedProp: readTree,
            })

            batchController = controller
            set({batch: {done: 0, total: items.length, current: null, summary: null}})

            void runBatch(items, {
                settings: {engine, levels, collision, wind, join},
                budget: state.budgetTarget,
                signal: controller.signal,
                write: (files) => writeFilesTo(folder, files),
                onProgress: (done, total, current) => set({batch: {done, total, current, summary: null}}),
            }).then((summary) => {
                batchController = null
                set({
                    batch: {done: summary.exported, total: summary.total, current: null, summary},
                    // The panel may be long closed, so the news comes back with it.
                    batchOpen: true,
                })
            })
        },
        cancelBatch: () => batchController?.abort(),
        clearBatch: () => set({batch: null}),
        previewLevel: 0,
        setPreviewLevel: (previewLevel) => set({previewLevel}),
        faceCounts: {wood: 0, leaves: 0},
        setFaceCounts: (faceCounts) => set({faceCounts}),
        shownFaceCounts: {wood: 0, leaves: 0},
        setShownFaceCounts: (shownFaceCounts) => set({shownFaceCounts}),
        budgetTarget: loadBudgetTarget(),
        setBudgetTarget: (budgetTarget) => {
            saveBudgetTarget(budgetTarget)
            set({budgetTarget})
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
