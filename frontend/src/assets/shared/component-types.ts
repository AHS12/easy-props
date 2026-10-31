/**
 * The shared shape of a component.
 *
 * These types live in the geometry layer so generators can describe what they
 * produce without importing the editor. The editor imports them back.
 */

export type ComponentType =
    | 'trunk'
    | 'branch'
    | 'root'
    | 'foliage-cluster'
    | 'palm-frond'
    | 'palm-crown'
    | 'coconut-cluster'
    | 'bark'
    | 'rock'

export interface Transform {
    readonly position: readonly [number, number, number]
    readonly rotation: readonly [number, number, number]
    readonly scale: readonly [number, number, number]
}

/**
 * A point along a spine.
 *
 * `t` runs from 0 at the base to 1 at the tip. `x` and `z` are offsets from
 * the axis in metres. This is the trunk's layout: it rises along Y.
 */
export interface SpinePoint {
    readonly t: number
    readonly x: number
    readonly z: number
}

/**
 * A point along a branch or a root.
 *
 * These parts are built along X and their transform points that axis at
 * whatever they are attached to, so the offsets are `y` and `z`.
 */
export interface LimbSpinePoint {
    readonly t: number
    readonly y: number
    readonly z: number
}

/**
 * A push or a pull on a part's surface.
 *
 * Stored in the part's own space, so it moves with the part and means the
 * same thing on every part. It is a parameter like any other: undo, save, and
 * seed determinism all keep working because the mesh is regenerated from it
 * rather than edited.
 */
export interface SurfacePush {
    /** Where on the surface, in the part's own space. */
    readonly point: readonly [number, number, number]
    /** Which way, in the part's own space. Usual the surface normal. */
    readonly direction: readonly [number, number, number]
    /** How far, in metres. Negative pulls in. */
    readonly strength: number
    /** How far the push reaches, in metres. */
    readonly radius: number
}

export const IDENTITY_TRANSFORM: Transform = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
}

export interface SceneComponent {
    readonly id: string
    readonly type: ComponentType
    readonly generatorId: string
    readonly generatorVersion: number
    /** Attachment target. `null` means it is a root of its asset. */
    readonly parentId: string | null
    readonly transform: Transform
    /** Generator parameters. Shape depends on `generatorId`. */
    readonly parameters: Readonly<Record<string, unknown>>
    /** Per-component overrides of the asset's style profile. */
    readonly styleOverrides?: Readonly<Record<string, unknown>> | null
    /** Deterministic variation seed for this component. */
    readonly seed: number
    /**
     * Which generator slot this part came from.
     *
     * `null` for a part the user added by hand. The slot is how a rebuild
     * knows which of its parts to keep and which to replace.
     */
    readonly slot: string | null
    /**
     * True once the user has changed this part's own parameters.
     *
     * A rebuild keeps an edited part's shape and takes only its new
     * position, so a hand-shaped branch is not undone by changing the
     * tree's height.
     */
    readonly edited: boolean
}

/**
 * The plain-language name of a component type.
 *
 * The user sees "Leaf clump", never "foliage cluster".
 */
const TYPE_LABELS: Readonly<Record<ComponentType, string>> = {
    trunk: 'Trunk',
    branch: 'Branch',
    root: 'Root',
    'foliage-cluster': 'Leaf clump',
    'palm-frond': 'Palm frond',
    'palm-crown': 'Palm crown',
    'coconut-cluster': 'Coconut cluster',
    bark: 'Bark',
    rock: 'Rock',
}

export function describeComponent(type: ComponentType): string {
    return TYPE_LABELS[type]
}
