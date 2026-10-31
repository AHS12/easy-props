/**
 * The files that set a prop up in an engine: its materials and how to use them.
 *
 * They ship inside the app, so saving a kit needs nothing but a folder.
 */

import godotLeaves from '../../../engine-kits/godot/leaves.gdshader?raw'
import godotGuide from '../../../engine-kits/godot/README.md?raw'
import godotWood from '../../../engine-kits/godot/wood.gdshader?raw'
import unrealGuide from '../../../engine-kits/unreal/README.md?raw'
import type {EngineId, ExportFile} from './pipeline/types'

type KitEngine = Exclude<EngineId, 'plain'>

const KITS: Readonly<Record<KitEngine, Readonly<Record<string, string>>>> = {
    godot: {'README.md': godotGuide, 'wood.gdshader': godotWood, 'leaves.gdshader': godotLeaves},
    unreal: {'README.md': unrealGuide},
}

export const KIT_LABELS: Readonly<Record<KitEngine, string>> = {
    godot: 'Wind materials and setup steps for Godot.',
    unreal: 'Steps to build the wind material in Unreal.',
}

export const kitFolder = (engine: KitEngine) => `easy-props-${engine}-kit`

export function engineKitFiles(engine: KitEngine): readonly ExportFile[] {
    return Object.entries(KITS[engine]).map(([name, text]) => ({name, bytes: new TextEncoder().encode(text)}))
}
