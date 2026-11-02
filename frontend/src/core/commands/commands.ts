/**
 * Everything the editor can do, in one list.
 *
 * The palette, the menus, the Keyboard settings page and the key handler all read
 * this list, so a command cannot exist in one place and be missing from another.
 */

import type {LucideIcon} from 'lucide-react'
import {
    Box, Brush, Camera, Check, ClipboardCopy, Dices, Download, FileDown, FolderOpen, Frame, Grid2x2,
    HelpCircle, Home, Info, Keyboard, Layers, LayoutPanelLeft, Maximize, MousePointer2, Move, PanelLeftClose,
    PersonStanding, Redo2, RefreshCw, RotateCcw, Save, Search, Settings, Sparkles, SunMoon, Trash2, Undo2, X,
} from 'lucide-react'
import {findPropGenerator} from '../../assets/prop-generators'
import {SHADING_MODES, SHADING_MODE_LABELS} from '../../assets/style/shading'
import {PROP_FAMILIES, treePresets, type PropFamily} from '../../assets/trees/presets'
import {canRedo, canUndo} from '../history/history'
import {findComponent} from '../scene/scene-model'
import {LEVEL_SHARES} from '../export/pipeline/types'
import {hasUnsavedChanges, useEditorStore, type EditorStore} from '../../store/editor-store'
import {settingValue, useSettingsStore} from '../../store/settings-store'
import {useUiStore} from '../../store/ui-store'
import {useUpdateStore} from '../../store/update-store'
import {canCheckForUpdates} from '../../platform/update'
import {viewportHandle, type ViewAngle} from '../../viewport/viewport-bridge'

export type CommandId = string

export interface Command {
    readonly id: CommandId
    readonly label: string
    readonly group: string
    /** Written the way the user presses it, e.g. "Ctrl+Z". */
    readonly shortcut?: string
    /** Extra words the palette should match on. */
    readonly keywords?: string
    readonly icon?: LucideIcon
    /** Null when it can run, otherwise why it cannot. */
    readonly unavailable?: (state: EditorStore) => string | null
    /** Offered first while this is true. */
    readonly relevant?: (state: EditorStore) => boolean
    /** Opens a sub-list instead of running. */
    readonly children?: (state: EditorStore) => readonly Command[]
    /** Whether a choice in a sub-list is the current one. */
    readonly checked?: (state: EditorStore) => boolean
    /** Works without a prop on screen, on the home page. */
    readonly global?: boolean
    readonly run: (state: EditorStore) => void
}

const selected = (state: EditorStore) => state.selection.selectedId

const selectedPart = (state: EditorStore) => {
    const id = selected(state)

    return id ? findComponent(state.scene, id) : undefined
}

const isPainted = (state: EditorStore) =>
    Boolean(findPropGenerator(state.scene.assets[0]?.generatorId ?? '')?.paintsOwnColours)

const needsPart = (state: EditorStore) => (selected(state) ? null : 'Select a part first')

/** Parts that stand for the whole prop, so they cannot be moved or removed. */
const FIXED_PARTS = ['painted-bark', 'rock-body']

const whyNotRemove = (state: EditorStore) => {
    const part = selectedPart(state)

    if (!part) {
        return 'Select a part first'
    }

    return part.type === 'trunk' || FIXED_PARTS.includes(part.generatorId) ? 'This part is the whole prop' : null
}

const whyNotMove = (state: EditorStore) => {
    const part = selectedPart(state)

    if (!part) {
        return 'Select a part first'
    }

    return part.generatorId === 'painted-limb' || FIXED_PARTS.includes(part.generatorId)
        ? 'Reshape this part with its handles instead'
        : null
}

/** What a New command opens on. */
const FAMILY_STARTERS: Readonly<Record<PropFamily, string>> = {
    tree: 'blossom-tree',
    rock: 'boulder',
    bush: 'round-bush',
}

const ICONS: Readonly<Record<PropFamily, LucideIcon>> = {tree: Sparkles, rock: Box, bush: Brush}

const VIEW_ANGLES: readonly {angle: ViewAngle; label: string; shortcut?: string}[] = [
    {angle: 'perspective', label: 'Perspective'},
    {angle: 'front', label: 'Front'},
    {angle: 'side', label: 'Side'},
    {angle: 'top', label: 'Top'},
]

const THEMES = [
    {value: 'system', label: 'System'},
    {value: 'dark', label: 'Dark'},
    {value: 'light', label: 'Light'},
]

/** Runs something that replaces the document, asking first if that loses work. */
function guardUnsaved(state: EditorStore, action: string, run: () => void) {
    if (!hasUnsavedChanges(state)) {
        run()
        return
    }

    useUiStore.getState().askConfirm({
        title: `${action}?`,
        text: 'You have unsaved changes to this prop. They cannot be brought back with Undo after this.',
        action,
        danger: true,
        run,
    })
}

/** Removes a part, asking first only if the user wants to be asked. */
export function requestRemovePart(state: EditorStore, id: string) {
    if (settingValue('confirmRemove') === true) {
        useUiStore.getState().askConfirm({
            title: 'Remove this part?',
            text: 'You can bring it back with Undo, or from the Outliner.',
            action: 'Remove',
            danger: true,
            run: () => state.deleteComponent(id),
        })
    } else {
        state.deleteComponent(id)
    }
}

export const COMMANDS: readonly Command[] = [
    ...PROP_FAMILIES.map(
        ({id, label}): Command => ({
            id: `new-${id}`,
            label: `New ${label.toLowerCase()}`,
            group: 'File',
            icon: ICONS[id],
            global: true,
            keywords: 'start create prop',
            run: (state) => {
                state.startNewProp(FAMILY_STARTERS[id])
            },
        }),
    ),
    {
        id: 'gallery',
        label: 'My props',
        group: 'File',
        shortcut: 'Ctrl+G',
        icon: Home,
        global: true,
        keywords: 'home gallery library start saved open recent props',
        run: (state) => state.showGallery(),
    },
    {
        id: 'open-project',
        label: 'Open a file…',
        group: 'File',
        shortcut: 'Ctrl+O',
        icon: FolderOpen,
        global: true,
        keywords: 'load read disk json dialog',
        run: (state) => guardUnsaved(state, 'Open a file', () => void state.openProject()),
    },
    {
        id: 'save-project',
        label: 'Save',
        group: 'File',
        shortcut: 'Ctrl+S',
        icon: Save,
        keywords: 'write disk json keep gallery my props tree',
        run: (state) => void state.saveTree(),
    },
    {
        id: 'save-project-as',
        label: 'Save a copy…',
        group: 'File',
        shortcut: 'Ctrl+Shift+S',
        keywords: 'write disk json duplicate new version',
        run: (state) => void state.saveTree(true),
    },
    {
        id: 'save-to-file',
        label: 'Save to a file…',
        group: 'File',
        keywords: 'write disk json dialog choose folder',
        run: (state) => void state.saveProjectToFile(),
    },
    {
        id: 'export-model',
        label: 'Export…',
        group: 'File',
        shortcut: 'Ctrl+E',
        icon: Download,
        keywords: 'glb gltf blender unreal godot download lod collision wind engine',
        run: (state) => state.exportModel(),
    },
    {
        id: 'batch-export',
        label: 'Export many…',
        group: 'File',
        icon: FileDown,
        global: true,
        keywords: 'batch variations seeds presets export glb',
        run: (state) => state.openBatch(),
    },
    {
        id: 'settings',
        label: 'Settings',
        group: 'File',
        shortcut: 'Ctrl+,',
        icon: Settings,
        global: true,
        keywords: 'preferences options config',
        run: () => useUiStore.getState().openSettings(),
    },
    {
        id: 'undo',
        label: 'Undo',
        group: 'Edit',
        shortcut: 'Ctrl+Z',
        icon: Undo2,
        unavailable: (state) => (canUndo(state.history) ? null : 'Nothing to undo yet'),
        run: (state) => state.undo(),
    },
    {
        id: 'redo',
        label: 'Redo',
        group: 'Edit',
        shortcut: 'Ctrl+Shift+Z',
        icon: Redo2,
        unavailable: (state) => (canRedo(state.history) ? null : 'Nothing to redo'),
        run: (state) => state.redo(),
    },
    {
        id: 'cancel',
        label: 'Clear selection',
        group: 'Edit',
        shortcut: 'Esc',
        icon: X,
        keywords: 'deselect disarm tool cancel',
        run: (state) => {
            // Escape backs out one step at a time: the tool first, then the
            // selection. Disarming the tool and losing the selection in one
            // press would be two surprises.
            if (state.moveTool) {
                state.setMoveTool(false)
            } else {
                state.deselect()
            }
        },
    },
    {
        id: 'copy',
        label: 'Copy part',
        group: 'Edit',
        shortcut: 'Ctrl+D',
        icon: ClipboardCopy,
        keywords: 'duplicate',
        relevant: (state) => Boolean(selected(state)),
        unavailable: (state) => {
            const reason = needsPart(state)

            return reason ?? (selectedPart(state)?.generatorId.startsWith('painted-') ? 'Parts of a painted tree cannot be copied' : null)
        },
        run: (state) => {
            const id = selected(state)
            if (id) {
                state.copyComponent(id)
            }
        },
    },
    {
        id: 'remove',
        label: 'Remove part',
        group: 'Edit',
        shortcut: 'Delete',
        icon: Trash2,
        keywords: 'delete',
        relevant: (state) => Boolean(selected(state)),
        unavailable: whyNotRemove,
        run: (state) => {
            const id = selected(state)
            if (id) {
                requestRemovePart(state, id)
            }
        },
    },
    {
        id: 'restore-part',
        label: 'Restore this part',
        group: 'Edit',
        icon: RotateCcw,
        keywords: 'reset defaults selected',
        relevant: (state) => Boolean(selected(state)),
        unavailable: needsPart,
        run: (state) => {
            const id = selected(state)
            if (id) {
                state.restoreComponent(id)
            }
        },
    },
    {
        id: 'tool-select',
        label: 'Select tool',
        group: 'Tools',
        shortcut: 'Q',
        icon: MousePointer2,
        keywords: 'pointer click',
        run: (state) => state.setMoveTool(false),
    },
    {
        id: 'tool-move',
        label: 'Move part',
        group: 'Tools',
        shortcut: 'G',
        icon: Move,
        keywords: 'gizmo translate position axis',
        relevant: (state) => Boolean(selected(state)),
        unavailable: whyNotMove,
        run: (state) => state.setMoveTool(!state.moveTool),
    },
    {
        id: 'frame',
        label: 'Frame',
        group: 'View',
        shortcut: 'F',
        icon: Frame,
        keywords: 'focus zoom fit selection',
        relevant: (state) => Boolean(selected(state)),
        run: () => viewportHandle()?.frame(),
    },
    {
        id: 'shading',
        label: 'Shading',
        group: 'View',
        icon: Layers,
        keywords: 'lit flat wireframe wind draw mode render',
        children: () =>
            SHADING_MODES.map(
                (mode): Command => ({
                    id: `shading-${mode}`,
                    label: SHADING_MODE_LABELS[mode],
                    group: 'View',
                    checked: (state) => state.shadingMode === mode,
                    run: (state) => state.setShadingMode(mode),
                }),
            ),
        run: () => undefined,
    },
    {
        id: 'shading-cycle',
        label: 'Next shading',
        group: 'View',
        shortcut: 'Z',
        keywords: 'cycle lit flat wireframe wind',
        run: (state) => {
            const index = SHADING_MODES.indexOf(state.shadingMode)
            state.setShadingMode(SHADING_MODES[(index + 1) % SHADING_MODES.length])
        },
    },
    {
        id: 'detail-level',
        label: 'Detail level',
        group: 'View',
        icon: Grid2x2,
        keywords: 'lod poly triangles faces low',
        children: () =>
            LEVEL_SHARES.map(
                (_, level): Command => ({
                    id: `detail-${level}`,
                    label: `Level ${level} (LOD${level})`,
                    group: 'View',
                    checked: (state) => state.previewLevel === level,
                    run: (state) => state.setPreviewLevel(level),
                }),
            ),
        run: () => undefined,
    },
    {
        id: 'view-angle',
        label: 'Camera angle',
        group: 'View',
        icon: Camera,
        keywords: 'front side top perspective view',
        children: () =>
            VIEW_ANGLES.map(
                ({angle, label}): Command => ({
                    id: `view-${angle}`,
                    label,
                    group: 'View',
                    run: () => viewportHandle()?.setView(angle),
                }),
            ),
        run: () => undefined,
    },
    {
        id: 'toggle-stats',
        label: 'Show stats',
        group: 'View',
        icon: Info,
        keywords: 'faces draw calls size metres triangles',
        checked: () => useUiStore.getState().showStats,
        run: () => useUiStore.getState().toggleStats(),
    },
    {
        id: 'toggle-scale-figure',
        label: 'Show a person for scale',
        group: 'View',
        icon: PersonStanding,
        keywords: 'size human reference metres',
        checked: () => useUiStore.getState().showScaleFigure,
        run: () => useUiStore.getState().toggleScaleFigure(),
    },
    {
        id: 'toggle-panels',
        label: 'Hide or show panels',
        group: 'View',
        shortcut: 'Ctrl+\\',
        icon: PanelLeftClose,
        keywords: 'sidebar collapse',
        run: () => useUiStore.getState().togglePanels(),
    },
    {
        id: 'maximize',
        label: 'Maximize the view',
        group: 'View',
        shortcut: 'Ctrl+ ',
        icon: Maximize,
        keywords: 'fullscreen viewport',
        run: () => useUiStore.getState().toggleMaximized(),
    },
    {
        id: 'reset-layout',
        label: 'Reset layout',
        group: 'View',
        icon: LayoutPanelLeft,
        keywords: 'panels sizes restore',
        global: true,
        run: () => {
            useSettingsStore.getState().resetLayout()
            useUiStore.setState({panelsHidden: false, maximized: false})
        },
    },
    {
        id: 'theme',
        label: 'Theme',
        group: 'View',
        icon: SunMoon,
        global: true,
        keywords: 'dark light mode appearance',
        children: () =>
            THEMES.map(
                ({value, label}): Command => ({
                    id: `theme-${value}`,
                    label,
                    group: 'View',
                    global: true,
                    checked: () => settingValue('theme') === value,
                    run: () => useSettingsStore.getState().setValue('theme', value),
                }),
            ),
        run: () => undefined,
    },
    {
        id: 'randomize',
        label: 'Surprise me',
        group: 'Prop',
        shortcut: 'R',
        icon: Dices,
        keywords: 'randomize variation new seed',
        run: (state) => state.randomizeTree(),
    },
    {
        id: 'restore-tree',
        label: 'Restore to preset',
        group: 'Prop',
        icon: RotateCcw,
        keywords: 'reset defaults tree',
        run: (state) => state.restoreTree(),
    },
    {
        id: 'style-low-poly',
        label: 'Style: Low-poly',
        group: 'Prop',
        shortcut: '1',
        unavailable: (state) => (isPainted(state) ? 'Painted props use Detail level instead' : null),
        checked: (state) => state.style === 'low-poly',
        run: (state) => state.setStyle('low-poly'),
    },
    {
        id: 'style-detailed',
        label: 'Style: Detailed',
        group: 'Prop',
        shortcut: '2',
        unavailable: (state) => (isPainted(state) ? 'Painted props use Detail level instead' : null),
        checked: (state) => state.style === 'detailed',
        run: (state) => state.setStyle('detailed'),
    },
    ...treePresets.map(
        (preset): Command => ({
            id: `preset-${preset.id}`,
            label: preset.name,
            group: 'Presets',
            keywords: preset.sub,
            global: true,
            run: (state) => state.applyPreset(preset.id),
        }),
    ),
    {
        id: 'palette',
        label: 'Search or run a command',
        group: 'Help',
        shortcut: 'Ctrl+K',
        icon: Search,
        global: true,
        keywords: 'find commands palette',
        run: () => {
            const ui = useUiStore.getState()

            ui.setPaletteOpen(!ui.paletteOpen)
        },
    },
    {
        id: 'palette-alt',
        label: 'Search or run a command (other key)',
        group: 'Help',
        shortcut: 'Ctrl+Shift+P',
        global: true,
        keywords: 'find commands palette',
        run: () => {
            const ui = useUiStore.getState()

            ui.setPaletteOpen(!ui.paletteOpen)
        },
    },
    {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        group: 'Help',
        shortcut: 'Ctrl+/',
        icon: Keyboard,
        global: true,
        keywords: 'help keys cheatsheet',
        run: () => useUiStore.getState().openSettings('Keyboard'),
    },
    {
        id: 'tour',
        label: 'Show the tour',
        group: 'Help',
        icon: HelpCircle,
        keywords: 'guide tutorial beginner',
        run: () => useUiStore.getState().setTourOpen(true),
    },
    {
        id: 'whats-new',
        label: "What's new",
        group: 'Help',
        icon: Sparkles,
        global: true,
        keywords: 'changelog release notes version update',
        run: () => useUiStore.getState().setWhatsNewOpen(true),
    },
    {
        id: 'check-updates',
        label: 'Check for updates',
        group: 'Help',
        icon: RefreshCw,
        global: true,
        keywords: 'update upgrade new version download',
        unavailable: () => (canCheckForUpdates() ? null : 'Updates are only available in the desktop app.'),
        run: () => {
            useUiStore.getState().openSettings('About')
            void useUpdateStore.getState().check()
        },
    },
    {
        id: 'about',
        label: 'About easy-props',
        group: 'Help',
        icon: Check,
        global: true,
        keywords: 'version licences',
        run: () => useUiStore.getState().openSettings('About'),
    },
]

/**
 * Runs a command. One that cannot run says why, and never silently does nothing.
 */
export function runCommand(command: Command): void {
    const state = useEditorStore.getState()
    const reason = command.unavailable?.(state)

    if (reason) {
        useEditorStore.setState({toast: {message: reason, undoable: false}})
        return
    }

    command.run(state)
}

/** The command with this id, if there is one, looking inside sub-lists too. */
export function findCommand(id: string, state?: EditorStore): Command | undefined {
    const top = COMMANDS.find((command) => command.id === id)

    if (top || !state) {
        return top
    }

    for (const command of COMMANDS) {
        const child = command.children?.(state).find((entry) => entry.id === id)

        if (child) {
            return child
        }
    }

    return undefined
}

/** The keys that run a command now: the user's choice, or else the default. */
export function shortcutFor(id: CommandId): string | undefined {
    const chosen = useSettingsStore.getState().shortcuts[id]

    if (chosen !== undefined) {
        return chosen === '' ? undefined : chosen
    }

    return COMMANDS.find((command) => command.id === id)?.shortcut
}

/** The command bound to these keys, if any. */
export function commandForKeys(keys: string): Command | undefined {
    return COMMANDS.find((command) => shortcutFor(command.id) === keys)
}

/**
 * The key string for an event, in the same shape the shortcuts are written.
 *
 * A letter reports its own case, so Shift has to be added back explicitly;
 * otherwise `P` and `Shift+P` would look identical.
 */
export function shortcutOf(event: KeyboardEvent): string {
    const parts: string[] = []

    if (event.ctrlKey || event.metaKey) {
        parts.push('Ctrl')
    }
    if (event.altKey) {
        parts.push('Alt')
    }
    if (event.shiftKey && /^[a-zA-Z]$/.test(event.key)) {
        parts.push('Shift')
    }

    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
    parts.push(key === 'Escape' ? 'Esc' : key)

    return parts.join('+')
}

/** How a shortcut reads on screen. */
export const displayKeys = (keys: string) => keys.replace(/\+ $/, '+Space')
