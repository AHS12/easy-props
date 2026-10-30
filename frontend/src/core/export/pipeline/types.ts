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
    /** Everything needed to make this prop again, for its `asset.json`. */
    describe(): Readonly<Record<string, unknown>>
}

export type EngineId = 'unreal' | 'godot' | 'plain'

export const ENGINE_LABELS: Readonly<Record<EngineId, string>> = {
    unreal: 'Unreal',
    godot: 'Godot',
    plain: 'Plain GLB',
}

export interface ExportSettings {
    /** Used for every file, and already safe to be one. */
    readonly name: string
    readonly engine: EngineId
    /** How many detail levels to write, 1 to 3. */
    readonly levels: number
    readonly collision: boolean
}

export interface ExportFile {
    readonly name: string
    readonly bytes: Uint8Array
    /** Faces in this file. Absent for a file with no mesh in it. */
    readonly faces?: number
}

/** The share of LOD0's faces each detail level aims for. */
export const LEVEL_SHARES: readonly number[] = [1, 0.4, 0.12]

/** Makes a prop's name safe to be a file: `Old Oak #1` becomes `old_oak_1`. */
export function exportNameOf(name: string): string {
    const safe = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')

    return safe || 'prop'
}
