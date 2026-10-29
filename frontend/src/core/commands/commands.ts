/**
 * Everything the editor can do, in one list.
 *
 * The palette, the shortcut sheet, and the key handler all read this list, so
 * a command cannot exist in one place and be missing from another: if it is
 * here, it can be found by name and pressed by its shortcut.
 */

import {SHADING_MODES, SHADING_MODE_LABELS} from '../../assets/style/shading'
import {treePresets} from '../../assets/trees/presets'
import type {EditorStore} from '../../store/editor-store'

export type CommandId =
    | 'undo'
    | 'redo'
    | 'cancel'
    | 'copy'
    | 'remove'
    | 'restore-part'
    | 'restore-tree'
    | 'randomize'
    | 'tool-push'
    | 'tool-pull'
    | 'shading-cycle'
    | 'style-low-poly'
    | 'style-detailed'
    | 'palette'
    | 'shortcuts'
    | `preset-${string}`
    | `shading-${string}`

export interface Command {
    readonly id: CommandId
    readonly label: string
    readonly group: string
    /** Written the way the user presses it, e.g. "Ctrl+Z". */
    readonly shortcut?: string
    /** Extra words the palette should match on. */
    readonly keywords?: string
    readonly run: (state: EditorStore) => void
}

const selected = (state: EditorStore) => state.selection.selectedId

export const COMMANDS: readonly Command[] = [
    {
        id: 'undo',
        label: 'Undo',
        group: 'Edit',
        shortcut: 'Ctrl+Z',
        run: (state) => state.undo(),
    },
    {
        id: 'redo',
        label: 'Redo',
        group: 'Edit',
        shortcut: 'Ctrl+Shift+Z',
        run: (state) => state.redo(),
    },
    {
        id: 'cancel',
        label: 'Cancel',
        group: 'Edit',
        shortcut: 'Esc',
        keywords: 'deselect disarm tool selection',
        run: (state) => {
            // Escape backs out one step at a time: the tool first, then the
            // selection. Disarming the tool and losing the selection in one
            // press would be two surprises.
            if (state.shapeTool !== 'off') {
                state.setShapeTool('off')
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
        keywords: 'duplicate',
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
        keywords: 'delete',
        run: (state) => {
            const id = selected(state)
            if (id) {
                state.deleteComponent(id)
            }
        },
    },
    {
        id: 'restore-part',
        label: 'Restore the selected part',
        group: 'Edit',
        keywords: 'reset defaults',
        run: (state) => {
            const id = selected(state)
            if (id) {
                state.restoreComponent(id)
            }
        },
    },
    {
        id: 'restore-tree',
        label: 'Restore the tree to its preset',
        group: 'Edit',
        keywords: 'reset defaults',
        run: (state) => state.restoreTree(),
    },
    {
        id: 'randomize',
        label: 'Surprise me',
        group: 'Edit',
        keywords: 'randomize variation',
        run: (state) => state.randomizeTree(),
    },
    {
        id: 'tool-push',
        label: 'Push surface',
        group: 'Tools',
        shortcut: 'P',
        keywords: 'shape sculpt extrude bulge',
        run: (state) => state.setShapeTool(state.shapeTool === 'push' ? 'off' : 'push'),
    },
    {
        id: 'tool-pull',
        label: 'Pull surface',
        group: 'Tools',
        shortcut: 'Shift+P',
        keywords: 'shape sculpt intrude dent',
        run: (state) => state.setShapeTool(state.shapeTool === 'pull' ? 'off' : 'pull'),
    },
    {
        id: 'shading-cycle',
        label: 'Cycle shading',
        group: 'View',
        shortcut: 'Z',
        keywords: 'lit flat wireframe draw mode',
        run: (state) => {
            const index = SHADING_MODES.indexOf(state.shadingMode)
            state.setShadingMode(SHADING_MODES[(index + 1) % SHADING_MODES.length])
        },
    },
    ...SHADING_MODES.map(
        (mode): Command => ({
            id: `shading-${mode}`,
            label: `${SHADING_MODE_LABELS[mode]} shading`,
            group: 'View',
            keywords: 'render draw mode',
            run: (state) => state.setShadingMode(mode),
        }),
    ),
    {
        id: 'style-low-poly',
        label: 'Style: Low-poly',
        group: 'View',
        shortcut: '1',
        run: (state) => state.setStyle('low-poly'),
    },
    {
        id: 'style-detailed',
        label: 'Style: Detailed',
        group: 'View',
        shortcut: '2',
        run: (state) => state.setStyle('detailed'),
    },
    ...treePresets.map(
        (preset, index): Command => ({
            id: `preset-${preset.id}`,
            label: `Preset: ${preset.name}`,
            group: 'Presets',
            shortcut: `Ctrl+${index + 1}`,
            keywords: preset.sub,
            run: (state) => state.applyPreset(preset.id),
        }),
    ),
    {
        id: 'palette',
        label: 'Command palette',
        group: 'App',
        shortcut: 'Ctrl+K',
        keywords: 'search find commands',
        run: () => undefined,
    },
    {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        group: 'App',
        shortcut: 'Ctrl+/',
        keywords: 'help keys cheatsheet',
        run: () => undefined,
    },
]

/** The command with this id, if there is one. */
export function findCommand(id: string): Command | undefined {
    return COMMANDS.find((command) => command.id === id)
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

/** The shortcut for a command, or `undefined` if it has none. */
export function shortcutFor(id: CommandId): string | undefined {
    return findCommand(id)?.shortcut
}
