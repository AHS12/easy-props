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
import {holdLowPolyCrown} from '../assets/trees/painted'
import {offersLowPoly} from '../assets/prop-generators'
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
import {createInitialScene, createSceneFromPreset, DEFAULT_PRESET_ID, presetOfScene} from '../core/scene/initial-scene'
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
import {describeChanges, makeItFit} from '../core/export/make-it-fit'
import {runBatch, type BatchSummary} from '../core/export/pipeline/batch'
import {findBudgetTarget, type BudgetTargetId, type FaceCounts} from '../core/export/pipeline/budget'
import {folderNameOf} from '../core/export/pipeline/types'
import {afterPaint} from '../core/export/pipeline/yield'
import {renderTreeThumbnail} from '../core/export/tree-thumbnail'
import {parseProject, ProjectFileError, serializeProject} from '../core/project/project-document'
import {desktopJoin, openProjectFile, saveProjectFile, writeExportFiles, writeFilesTo} from '../platform/desktop'
import {
    clearDraftText,
    readDraftText,
    writeDraftText,
} from '../platform/draft'
import {
    copyTreePicture,
    forgetRemovedTree,
    listRemovedTrees,
    listTrees,
    newTreeId,
    pictureAddress,
    putBackTree,
    readTree,
    removeTreeToBin,
    showTreeFile,
    writeTree,
    writeTreePicture,
    type RemovedTree,
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

/** Which screen is showing. Home and Your props show no prop, so editing commands sleep there. */
export type Page = 'gallery' | 'props' | 'editor'

/** True on the pages without a prop on screen. */
export const isHomePage = (page: Page): boolean => page !== 'editor'

/** Pictures of saved props are drawn at this size, so the Your props panel can show them large. */
const PICTURE_SIZE = 512

/** True while missing pictures are being drawn, so two runs never overlap. */
let drawingPictures = false

/** Count listings of saved props and of the bin, so one that finishes late can't replace a newer one. */
let galleryListings = 0
let removedListings = 0

/** The open prop's id, while it sits in the bin, so putting it back reconnects the editor to it. */
let openPropInBin: string | null = null

/** "Old oak", or "3 props". */
const propsLabel = (names: readonly string[]): string => (names.length === 1 ? `"${names[0]}"` : `${names.length} props`)

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
    /** Where some files were written, so the toast can take you there. */
    readonly folder?: string
    /** A button of its own, such as seeing a new version. */
    readonly action?: ToastAction
}

export interface ToastAction {
    readonly label: string
    readonly run: () => void
}

/** How far a batch has got. It has a summary once it has finished. */
export interface BatchState {
    readonly done: number
    readonly total: number
    readonly current: string | null
    readonly summary: BatchSummary | null
    /** Where the batch writes its files. */
    readonly folder: string
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
    /** True while the turn rings are showing. One tool at a time, so turning it on puts Move away. */
    turnTool: boolean
    setTurnTool(on: boolean): void
    /** True while the resize handle is showing. One tool at a time, as with Turn. */
    resizeTool: boolean
    setResizeTool(on: boolean): void
    /** Shows a size without recording history. Used while dragging the resize ring. */
    previewSize(componentId: string, size: number): void
    /** Records the size a drag ended with as one undo step. */
    commitSize(before: Scene, componentId: string, size: number): void
    /** Shows a turn without recording history. Used while dragging a ring. */
    previewTurn(componentId: string, turn: readonly number[]): void
    /** Records the turn a drag ended with as one undo step. */
    commitTurn(before: Scene, componentId: string, turn: readonly number[]): void
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
    /**
     * Starts a fresh prop from a preset, named after it, and leaves the saved one alone.
     * It starts clean, with nothing to undo, so ask before calling this over unsaved work.
     */
    startNewProp(presetId: string): void
    /** True once a prop has been started or opened in this session, so there is one to go back to. */
    propInHand: boolean
    /** Brings back a part of a painted tree that was removed. */
    restoreRemovedPart(kind: 'limb' | 'clump', key: string): void
    /** Rerolls the tree's variation while keeping its shape. */
    randomizeTree(): void
    /** Uses a seed someone chose, as one undo step. The same seed does nothing. */
    setSeed(seed: number): void

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
    /** Closes the export panel and says what it wrote, and where. */
    finishExport(message: string, folder?: string): void
    /** Says something that needs no answer, such as where a kit was saved. */
    notify(message: string, folder?: string, action?: ToastAction): void
    /** The panel for exporting many props. A batch outlives it. */
    batchOpen: boolean
    openBatch(): void
    /** Versions picked in Show me more, offered at the top of Export many. */
    batchPicked: BatchChoice | null
    openBatchWith(choice: BatchChoice): void
    /** Saved props to tick when Export many opens, as from Your props. */
    batchSavedIds: readonly string[]
    openBatchWithSaved(ids: readonly string[]): void
    closeBatch(): void
    /** The batch running or just finished, or null. */
    batch: BatchState | null
    /** `subfolder`, when not empty, is made inside the chosen folder to hold the whole batch. */
    startBatch(choices: readonly BatchChoice[], variations: number, preferences: ExportPreferences, subfolder?: string): void
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
    /** True while Make it fit is trying values. */
    fitting: boolean
    /** Lowers the costliest controls until the prop fits its budget, as one undo step. */
    makeItFit(): Promise<void>

    /** Every tree in the gallery, newest first. */
    gallery: readonly SavedTree[]
    galleryLoading: boolean
    /** Which screen is showing. The app opens on the gallery. */
    page: Page
    showGallery(): void
    /** The page listing every saved prop. */
    showProps(): void
    showEditor(): void
    /** The prop picked on Your props, whose details show beside the list. */
    pickedPropId: string | null
    pickProp(id: string | null): void
    /** Draws pictures for saved props that have none, one at a time, while a page of props is open. */
    drawMissingPictures(): Promise<void>
    /** Shows a saved prop's file in the system's file manager. */
    showPropFile(id: string): Promise<void>
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
    /** Moves a saved prop to the bin, with Undo in the message. */
    removeTree(id: string): Promise<void>
    removeTrees(ids: readonly string[]): Promise<void>
    /** Moves props back from the bin. */
    putBackTrees(ids: readonly string[]): Promise<void>
    /** Removes a prop in the bin for good. */
    forgetTree(id: string): Promise<void>
    /** Empties the bin. */
    forgetAllRemoved(): Promise<void>
    /** Saves a copy of a saved prop without opening it, and picks the copy. */
    copyTree(id: string): Promise<void>
    /** The props in the bin, most recently removed first. */
    removedProps: readonly RemovedTree[]
    refreshRemoved(): Promise<void>

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
/** The longest Make it fit keeps trying, before it settles for what it has. */
const FIT_TIME_MS = 5000

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
            presetId: state.presetId,
            extras: state.projectExtras,
        })

        try {
            // A preview is worth a few milliseconds: a gallery of names is a
            // list, a gallery of trees is a gallery.
            const thumbnail = await renderTreeThumbnail(state.scene, {
                style: getStyleProfile(state.style),
                size: PICTURE_SIZE,
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

            holdLowPolyCrown(true)

            set({
                scene: updateComponentParameters(state.scene, componentId, {spine}),
            })
        },

        commitSpine: (before, componentId, spine) => {
            holdLowPolyCrown(false)
            commit('shape part', (scene) => updateComponentParameters(scene, componentId, {spine}), before)
        },

        moveComponent: (componentId, axis, value) =>
            commit(
                `move ${axis}`,
                (scene) => moveComponentInScene(scene, componentId, axis, value),
            ),

        moveTool: false,

        setMoveTool: (on) => set(on ? {moveTool: true, turnTool: false, resizeTool: false} : {moveTool: false}),

        turnTool: false,

        setTurnTool: (on) => set(on ? {turnTool: true, moveTool: false, resizeTool: false} : {turnTool: false}),

        resizeTool: false,

        setResizeTool: (on) => set(on ? {resizeTool: true, moveTool: false, turnTool: false} : {resizeTool: false}),

        previewSize: (componentId, size) => {
            holdLowPolyCrown(true)
            set({scene: updateComponentParameters(get().scene, componentId, {sizeScale: size})})
        },

        commitSize: (before, componentId, size) => {
            holdLowPolyCrown(false)
            commit('resize part', (scene) => updateComponentParameters(scene, componentId, {sizeScale: size}), before)
        },

        previewTurn: (componentId, turn) => {
            holdLowPolyCrown(true)
            set({scene: updateComponentParameters(get().scene, componentId, {turn: [...turn]})})
        },

        commitTurn: (before, componentId, turn) => {
            holdLowPolyCrown(false)
            commit('turn part', (scene) => updateComponentParameters(scene, componentId, {turn: [...turn]}), before)
        },

        previewPosition: (componentId, position) => {
            const state = get()

            holdLowPolyCrown(true)

            set({scene: setComponentPositionInScene(state.scene, componentId, position)})
        },

        commitPosition: (before, componentId, position) => {
            holdLowPolyCrown(false)
            commit(
                'move part',
                (scene) => setComponentPositionInScene(scene, componentId, position),
                before,
            )
        },

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
            const fresh = createSceneFromPreset(presetId)
            // Low-poly is a switch over the view, so it stays on from one prop to the next.
            const keepsLowPoly = state.scene.assets[0]?.parameters.build === 'low-poly' && offersLowPoly(fresh.assets[0]?.generatorId)
            const scene = keepsLowPoly
                ? updateTreeParameters(fresh, fresh.assets[0].id, {build: 'low-poly'}, getStyleProfile(state.style))
                : fresh

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
            const scene = createSceneFromPreset(presetId)
            const style = get().style

            // Nothing to undo: going back would step into another prop under this one's name.
            set({
                scene,
                presetId,
                page: 'editor',
                history: EMPTY_HISTORY,
                savedScene: scene,
                savedStyle: style,
                treeName: findPreset(presetId)?.name ?? 'My prop',
                currentTreeId: null,
                filePath: null,
                projectExtras: {},
                selection: EMPTY_SELECTION,
                propInHand: true,
            })
        },

        propInHand: false,

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

        setSeed: (seed) => {
            if (seed === get().scene.assets[0]?.seed) {
                return
            }

            commit('change seed', (scene, style) =>
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
                toast: {message: 'Back to the preset', undoable: true},
            })
        },

        dismissToast: () => set({toast: null}),

        filePath: null,
        projectExtras: {},
        gallery: [],
        galleryLoading: false,
        page: 'gallery',
        showGallery: () => set({page: 'gallery'}),
        showProps: () => set({page: 'props'}),
        showEditor: () => set({page: 'editor'}),
        pickedPropId: null,
        pickProp: (id) => set({pickedPropId: id}),

        drawMissingPictures: async () => {
            if (drawingPictures) {
                return
            }

            drawingPictures = true

            try {
                for (const prop of get().gallery.filter((entry) => entry.thumbnail === null && entry.kind !== null)) {
                    // Leaving for the editor stops it, so drawing never competes with editing.
                    if (!isHomePage(get().page)) {
                        return
                    }

                    await afterPaint()

                    try {
                        const project = parseProject(await readTree(prop.id))
                        const picture = await renderTreeThumbnail(project.scene, {
                            style: getStyleProfile(asStyleId(project.style)),
                            size: PICTURE_SIZE,
                        })

                        if (!picture) {
                            continue
                        }

                        await writeTreePicture(prop.id, picture)

                        set({
                            gallery: get().gallery.map((entry) =>
                                entry.id === prop.id ? {...entry, thumbnail: pictureAddress(entry.id, entry.savedAt)} : entry,
                            ),
                        })
                    } catch {
                        // A prop that can't be drawn keeps its icon; the rest still get theirs.
                    }
                }
            } finally {
                drawingPictures = false
            }
        },

        showPropFile: async (id) => {
            try {
                await showTreeFile(id)
            } catch (error) {
                set({toast: {message: describeFailure(error, 'read'), undoable: false}})
            }
        },
        currentTreeId: null,
        treeName: 'My tree',

        setTreeName: (name) => set({treeName: name}),

        refreshGallery: async () => {
            const asked = ++galleryListings

            set({galleryLoading: true})

            try {
                const gallery = await listTrees()

                if (asked === galleryListings) {
                    set({gallery, galleryLoading: false})
                }
            } catch (error) {
                if (asked === galleryListings) {
                    set({
                        galleryLoading: false,
                        toast: {message: describeFailure(error, 'read'), undoable: false},
                    })
                }
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
                    presetId: state.presetId,
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
                    presetId: presetOfScene(project.scene, project.presetId),
                    selection: EMPTY_SELECTION,
                    history: EMPTY_HISTORY,
                    draftAvailable: false,
                    page: 'editor',
                    propInHand: true,
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
                    propInHand: true,
                    filePath: null,
                    projectExtras: project.extras,
                    presetId: presetOfScene(project.scene, project.presetId),
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
                    presetId: project.presetId ?? undefined,
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

        removeTree: (id) => get().removeTrees([id]),

        removeTrees: async (ids) => {
            const state = get()
            const names = ids.map((id) => state.gallery.find((tree) => tree.id === id)?.name ?? 'Untitled prop')
            const removed: string[] = []

            try {
                for (const id of ids) {
                    await removeTreeToBin(id)
                    removed.push(id)
                }
            } catch (error) {
                set({toast: {message: describeFailure(error, 'delete'), undoable: false}})
            }

            if (removed.length === 0) {
                return
            }

            if (state.currentTreeId !== null && removed.includes(state.currentTreeId)) {
                openPropInBin = state.currentTreeId
            }

            set({
                currentTreeId: state.currentTreeId !== null && removed.includes(state.currentTreeId) ? null : state.currentTreeId,
                pickedPropId: state.pickedPropId !== null && removed.includes(state.pickedPropId) ? null : state.pickedPropId,
                ...(removed.length === ids.length
                    ? {
                          toast: {
                              message: `Removed ${propsLabel(names)}`,
                              undoable: false,
                              action: {label: 'Undo', run: () => void get().putBackTrees(removed)},
                          },
                      }
                    : {}),
            })

            await Promise.all([get().refreshGallery(), get().refreshRemoved()])
        },

        putBackTrees: async (ids) => {
            try {
                for (const id of ids) {
                    await putBackTree(id)

                    if (openPropInBin === id && get().currentTreeId === null) {
                        set({currentTreeId: id})
                        openPropInBin = null
                    }
                }

                const names = ids.map((id) => get().removedProps.find((tree) => tree.id === id)?.name ?? 'Untitled prop')

                // Picked again, so Undo leaves the panel where it was before the removal.
                set({pickedPropId: ids[0], toast: {message: `Put back ${propsLabel(names)}`, undoable: false}})
            } catch {
                set({
                    toast: {
                        message: "Couldn't put that prop back. A saved prop may already use its place, or its file was moved.",
                        undoable: false,
                    },
                })
            }

            await Promise.all([get().refreshGallery(), get().refreshRemoved()])
        },

        forgetTree: async (id) => {
            try {
                await forgetRemovedTree(id)
                await get().refreshRemoved()
            } catch (error) {
                set({toast: {message: describeFailure(error, 'delete'), undoable: false}})
            }
        },

        copyTree: async (id) => {
            try {
                const project = parseProject(await readTree(id))
                const name = copyNameOf(`${project.name} copy`, get().gallery)
                const copyId = newTreeId()
                // A copy is a new prop, made now, so it doesn't keep the original's date.
                const extras = {...project.extras}
                delete extras.createdAt

                await writeTree(
                    copyId,
                    serializeProject({
                        scene: project.scene,
                        name,
                        style: project.style,
                        presetId: project.presetId ?? undefined,
                        extras,
                    }),
                    null,
                )
                await copyTreePicture(id, copyId)

                set({pickedPropId: copyId, toast: {message: `Copied as "${name}"`, undoable: false}})
                await get().refreshGallery()
            } catch (error) {
                set({toast: {message: describeFailure(error, 'save'), undoable: false}})
            }
        },

        forgetAllRemoved: async () => {
            const count = get().removedProps.length

            try {
                for (const tree of get().removedProps) {
                    await forgetRemovedTree(tree.id)
                }

                set({toast: {message: count === 1 ? 'Emptied the bin' : `Emptied the bin of ${count} props`, undoable: false}})
            } catch (error) {
                set({toast: {message: describeFailure(error, 'delete'), undoable: false}})
            }

            await get().refreshRemoved()
        },

        removedProps: [],

        refreshRemoved: async () => {
            // Only the newest listing counts: an older one finishing late would show what's gone.
            const asked = ++removedListings

            try {
                const removedProps = await listRemovedTrees()

                if (asked === removedListings) {
                    set({removedProps})
                }
            } catch {
                if (asked === removedListings) {
                    set({removedProps: []})
                }
            }
        },

        saveProjectToFile: async () => {
            const state = get()
            const text = serializeProject({
                scene: state.scene,
                name: state.treeName,
                style: state.style,
                presetId: state.presetId,
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
                    propInHand: true,
                    filePath: opened.path,
                    projectExtras: project.extras,
                    presetId: presetOfScene(project.scene, project.presetId),
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
        finishExport: (message, folder) => set({exportOpen: false, toast: {message, undoable: false, folder}}),
        notify: (message, folder, action) => set({toast: {message, undoable: false, folder, action}}),
        batchOpen: false,
        openBatch: () => set({batchOpen: true, exportOpen: false}),
        batchPicked: null,
        openBatchWith: (batchPicked) => set({batchPicked, batchOpen: true, exportOpen: false}),
        batchSavedIds: [],
        openBatchWithSaved: (batchSavedIds) => set({batchSavedIds, batchPicked: null, batchOpen: true, exportOpen: false}),
        closeBatch: () => set({batchOpen: false}),
        batch: null,
        startBatch: (choices, variations, {engine, levels, collision, wind, join, far, look, materials, folder: chosen, folderPerProp}, subfolder = '') => {
            const inside = folderNameOf(subfolder)
            const folder = inside ? desktopJoin(chosen, inside) : chosen
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
            set({batch: {done: 0, total: items.length, current: null, summary: null, folder}})

            void runBatch(items, {
                settings: {engine, levels, collision, wind, join, far, look, materials},
                budget: state.budgetTarget,
                signal: controller.signal,
                write: (files, name) => (folderPerProp ? writeExportFiles(folder, name, files) : writeFilesTo(folder, files)),
                onProgress: (done, total, current) => set({batch: {done, total, current, summary: null, folder}}),
            }).then((summary) => {
                batchController = null
                set({
                    batch: {done: summary.exported, total: summary.total, current: null, summary, folder},
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
        fitting: false,
        makeItFit: async () => {
            const {scene, style, budgetTarget, fitting} = get()

            if (fitting) {
                return
            }

            const budget = findBudgetTarget(budgetTarget).faces

            set({fitting: true})
            // The button says it's working before the first build blocks the page.
            await afterPaint()

            try {
                const result = await makeItFit(scene, getStyleProfile(style), budget, {
                    deadline: performance.now() + FIT_TIME_MS,
                })

                // Something else changed the prop meanwhile, and that wins.
                if (get().scene !== scene) {
                    return
                }

                const faces = `${result.faces.toLocaleString()} of ${budget.toLocaleString()} faces`

                if (result.changes.length === 0) {
                    set({toast: {message: 'Make it fit could not lower anything more. Try a bigger budget.', undoable: false}})

                    return
                }

                commit('make it fit', () => result.scene)
                set({
                    toast: {
                        message: result.fits
                            ? `${describeChanges(result.changes)}. Now ${faces}.`
                            : `${describeChanges(result.changes)}. Got to ${faces}: lower more by hand, or pick a bigger budget.`,
                        undoable: true,
                    },
                })
            } finally {
                set({fitting: false})
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
