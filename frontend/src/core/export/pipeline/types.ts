/**
 * What the export pipeline asks of a prop.
 *
 * Nothing here knows what a tree is. A generator hands over parts, tagged with
 * what they are, and the pipeline does the same to all of them.
 */

import type {CollisionShape, GeneratedPart} from '../../../assets/shared/generator-types'

export type Vec3 = readonly [number, number, number]

/** A part, already placed in the prop's space by its matrix. */
export interface PlacedPart {
    readonly part: GeneratedPart
    /** Sixteen numbers, column first, from the part's space to the prop's. */
    readonly matrix: readonly number[]
    /** The colour the part's material multiplies it by, as linear red, green and blue. */
    readonly tint: Vec3
    /** Whether the style draws this part faceted. */
    readonly flatShading: boolean
}

export interface ExportSource {
    /** The parts of this prop at a share of its full detail, 1 down to about 0.1. */
    buildAtDetail(detail: number): Promise<readonly PlacedPart[]>
    /** Simple solid shapes, in the prop's own space. Empty lets the pipeline make its own. */
    collision(): readonly CollisionShape[]
    /** Where the base of the prop meets the ground. */
    pivot(): Vec3
    /** Whether this prop offers a far-away card. Trees and bushes do. */
    farAway?(): boolean
    /** Whether this prop moves in the wind. A rock does not. */
    sways(): boolean
    /** True when every part of it moves about alike. */
    swaysEvenly?(): boolean
    /** Everything needed to make this prop again, for its `asset.json`. */
    describe(): Readonly<Record<string, unknown>>
}

export type EngineId = 'unreal' | 'godot' | 'plain'

export const ENGINE_LABELS: Readonly<Record<EngineId, string>> = {
    unreal: 'Unreal',
    godot: 'Godot',
    plain: 'Plain GLB',
}

/**
 * How the game will draw the prop. Lit is the usual look. Cartoon and Comic need
 * the engine kit's toon materials, and Comic also bakes its flat colours and
 * round leaf light into the file.
 */
export type ExportLook = 'lit' | 'cartoon' | 'cel'

export const EXPORT_LOOKS: readonly ExportLook[] = ['lit', 'cartoon', 'cel']

export interface ExportSettings {
    /** Used for every file, and already safe to be one. */
    readonly name: string
    readonly engine: EngineId
    /** How many detail levels to write, 1 to 3. */
    readonly levels: number
    readonly collision: boolean
    /** Asks for wind data. A prop that does not move gets none regardless. */
    readonly wind: boolean
    /** Writes the prop as one object, each material still its own part of it. */
    readonly join?: boolean
    /** Asks for a far-away card. A prop that offers none gets none regardless. */
    readonly far?: boolean
    /** Lit when absent. */
    readonly look?: ExportLook
    /** Puts the look's Godot materials beside the files. Only Godot has them. */
    readonly materials?: boolean
    /** How many pixels across the closest level's pictures are. 512, the app's own, when absent. */
    readonly pictureSize?: PictureSize
    /** Part of a set: its materials are named after the set and what they look like, so files can share them. */
    readonly setName?: string
}

/** The sizes a picture can be exported at. Further levels keep the app's 512. */
export const PICTURE_SIZES = [512, 1024, 2048] as const
export type PictureSize = (typeof PICTURE_SIZES)[number]

export interface ExportFile {
    readonly name: string
    readonly bytes: Uint8Array
    /** Faces in this file. Absent for a file with no mesh in it. */
    readonly faces?: number
}

/** The share of LOD0's faces each detail level aims for. */
export const LEVEL_SHARES: readonly number[] = [1, 0.4, 0.12]

/** Faces in a far-away card: two cards, two sides each, two triangles a side. */
export const FAR_FACES = 8

/** The view's detail level that shows the far-away card, after the real levels. */
export const FAR_LEVEL = LEVEL_SHARES.length

/** Makes a prop's name safe to be a file: `Old Oak #1` becomes `old_oak_1`. */
/**
 * A folder name as typed, minus what no file system allows. Unlike a file name it
 * keeps its spaces and capitals, as people read it. Empty means no folder.
 */
export function folderNameOf(name: string): string {
    return [...name]
        .filter((char) => char >= ' ' && !'<>:"/\\|?*'.includes(char))
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/, '')
        .replace(/^\.+$/, '')
}

export function exportNameOf(name: string): string {
    const safe = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')

    return safe || 'prop'
}
