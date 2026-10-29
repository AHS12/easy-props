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

export interface Transform {
    readonly position: readonly [number, number, number]
    readonly rotation: readonly [number, number, number]
    readonly scale: readonly [number, number, number]
}

/**
 * A point along a spine.
 *
 * `t` runs from 0 at the base to 1 at the tip. `x` and `z` are offsets from
 * the axis in metres.
 */
export interface SpinePoint {
    readonly t: number
    readonly x: number
    readonly z: number
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
}

/**
 * The plain-language name of a component type.
 *
 * This is the binding terminology mapping from the product spec: the user
 * sees "Leaf clump", never "foliage cluster".
 */
const TYPE_LABELS: Readonly<Record<ComponentType, string>> = {
    trunk: 'Trunk',
    branch: 'Branch',
    root: 'Root',
    'foliage-cluster': 'Leaf clump',
    'palm-frond': 'Palm frond',
    'palm-crown': 'Palm crown',
    'coconut-cluster': 'Coconut cluster',
}

export function describeComponent(type: ComponentType): string {
    return TYPE_LABELS[type]
}
