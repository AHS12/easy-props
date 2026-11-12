/**
 * The list a set ends with, for an engine kit or a person: every prop and its files,
 * the materials the files share, and the colours the set was matched to.
 */

import type {ColourGroup, SetColours} from './set-colours'
import type {ExportFile} from './pipeline/types'

const SET_LIST_FORMAT = 1

/** The material names a GLB's own description lists. */
export function materialsInGlb(bytes: Uint8Array): readonly string[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    // 'glTF', then a JSON chunk at 12.
    if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67) {
        return []
    }

    const length = view.getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as {materials?: {name?: string}[]}

    return (json.materials ?? []).map((material) => material.name ?? '').filter(Boolean)
}

export interface SetEntry {
    readonly name: string
    readonly files: readonly string[]
    readonly materials: readonly string[]
}

/** Notes what went into a set's folder from one prop's files. */
export function setEntryOf(name: string, files: readonly ExportFile[]): SetEntry {
    return {
        name,
        files: files.map((file) => file.name),
        materials: [...new Set(files.filter((file) => file.name.endsWith('.glb') && !file.name.includes('_collision')).flatMap((file) => materialsInGlb(file.bytes)))],
    }
}

export function setListFile(name: string, entries: readonly SetEntry[], groups: readonly ColourGroup[], colours: SetColours): ExportFile {
    const list = {
        format: SET_LIST_FORMAT,
        set: name,
        props: entries.map(({name: prop, files}) => ({name: prop, files})),
        // Each shared by every prop that names it: one material in the engine.
        materials: [...new Set(entries.flatMap((entry) => entry.materials))].sort(),
        colours: groups.map((group) => ({
            setting: group.label,
            colour: group.options.find((option) => option.value === colours[group.id])?.label ?? colours[group.id],
        })),
    }

    return {name: `${name}.set.json`, bytes: new TextEncoder().encode(`${JSON.stringify(list, null, 4)}\n`)}
}
