import {findComponent} from '../core/scene/scene-model'
import type {EditorStore} from '../store/editor-store'

const CAMERA_HINTS: Readonly<Record<string, string>> = {
    'easy-props': 'Left drag to orbit · Right drag to pan · Scroll to zoom',
    blender: 'Middle drag to orbit · Shift+middle to pan · Scroll to zoom',
    unreal: 'Alt+left to orbit · Alt+middle to pan · Scroll to zoom',
}

/** The hint for this moment: what you can do right now. */
export function hintFor(state: Pick<EditorStore, 'status' | 'moveTool' | 'selection' | 'scene'>, scheme: string): string {
    if (state.status.message) {
        return state.status.message
    }

    const part = state.selection.selectedId ? findComponent(state.scene, state.selection.selectedId) : undefined

    if (state.moveTool) {
        return part ? 'Drag an arrow to move the part · Esc to put the tool down' : 'Click a part, then drag an arrow to move it'
    }

    if (part) {
        return part.generatorId === 'painted-limb'
            ? 'Drag a white handle to reshape · F to frame · Delete to remove · Esc to deselect'
            : 'G to move · F to frame · Delete to remove · Esc to deselect'
    }

    return `Click a part to select · ${CAMERA_HINTS[scheme] ?? CAMERA_HINTS['easy-props']}`
}
