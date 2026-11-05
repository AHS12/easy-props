/**
 * The files that set a prop up in an engine: its materials and how to use them.
 *
 * They ship inside the app, so saving a kit needs nothing but a folder.
 */

import godotLeaves from '../../../engine-kits/godot/leaves.gdshader?raw'
import godotGuide from '../../../engine-kits/godot/README.md?raw'
import godotWood from '../../../engine-kits/godot/wood.gdshader?raw'
import unrealGuide from '../../../engine-kits/unreal/README.md?raw'
import unrealSetup from '../../../engine-kits/unreal/setup_props.py?raw'
import {godotOutlineShader, godotToonShader} from './godot-toon'
import type {EngineId, ExportFile, ExportLook} from './pipeline/types'

type KitEngine = Exclude<EngineId, 'plain'>

const KITS: Readonly<Record<KitEngine, Readonly<Record<string, string>>>> = {
    godot: {
        'README.md': godotGuide,
        'wood.gdshader': godotWood,
        'leaves.gdshader': godotLeaves,
        'wood_cartoon.gdshader': godotToonShader('cartoon', 'wood'),
        'leaves_cartoon.gdshader': godotToonShader('cartoon', 'leaves'),
        'wood_comic.gdshader': godotToonShader('cel', 'wood'),
        'leaves_comic.gdshader': godotToonShader('cel', 'leaves'),
        'outline.gdshader': godotOutlineShader(),
    },
    unreal: {'README.md': unrealGuide, 'setup_props.py': unrealSetup},
}

export const KIT_LABELS: Readonly<Record<KitEngine, string>> = {
    godot: 'Wind materials, Cartoon and Comic materials, and setup steps for Godot.',
    unreal: 'A script that sets up your props in Unreal, and the steps to do it by hand.',
}

export const kitFolder = (engine: KitEngine) => `easy-props-${engine}-kit`

/** The Godot materials a look needs: wood and leaves that move in the wind, and lines for the toon looks. */
const GODOT_MATERIALS: Readonly<Record<ExportLook, readonly string[]>> = {
    lit: ['wood.gdshader', 'leaves.gdshader'],
    cartoon: ['wood_cartoon.gdshader', 'leaves_cartoon.gdshader', 'outline.gdshader'],
    cel: ['wood_comic.gdshader', 'leaves_comic.gdshader', 'outline.gdshader'],
}

export function godotMaterialFiles(look: ExportLook): readonly ExportFile[] {
    return GODOT_MATERIALS[look].map((name) => ({name, bytes: new TextEncoder().encode(KITS.godot[name])}))
}

export function engineKitFiles(engine: KitEngine): readonly ExportFile[] {
    return Object.entries(KITS[engine]).map(([name, text]) => ({name, bytes: new TextEncoder().encode(text)}))
}
