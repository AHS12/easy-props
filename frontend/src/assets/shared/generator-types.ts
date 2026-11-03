/**
 * The generator contract.
 *
 * A generator turns parameters into geometry. It is pure: the same
 * parameters and the same seed always produce the same result. This is the
 * single extension point for new asset families, so a future rock generator
 * implements this interface and touches nothing else.
 */

import type * as THREE from 'three'
import type {StyleProfile} from '../style/style-profiles'
import type {ComponentType, Transform} from './component-types'
import type {ParameterSpec, ValidationResult} from './parameters'
import type {RandomSource} from './random'

export type MaterialKind = 'bark' | 'bark-light' | 'leaves' | 'leaves-dark' | 'coconut' | 'painted'

/**
 * A point marked 1 in this attribute sways with the rest but never flutters, as a
 * fruit swings whole rather than swelling and shrinking with its leaves.
 */
export const RIGID_ATTRIBUTE = 'rigid'

/** What a part is made of, which decides how an export treats it. */
export type PartRole = 'solid' | 'foliage' | 'thin'

/** A simple solid for an engine to collide with: two parallel rings, each a circle. */
export interface CollisionShape {
    readonly start: readonly [number, number, number]
    readonly end: readonly [number, number, number]
    readonly startRadius: number
    readonly endRadius: number
}

/**
 * How a part that paints itself is drawn.
 *
 * Such a part keeps its colour per vertex and its own shading normals, and may
 * cut its outline out of a texture.
 */
export interface PaintedSurface {
    readonly vertexColors: boolean
    readonly map?: THREE.Texture
    /** Fine relief for light to catch. Needs a `map`, whose texture coordinates it shares. */
    readonly normalMap?: THREE.Texture
    readonly alphaTest?: number
    /** False for leaves, where a shadow map would only speckle soft shading. */
    readonly receiveShadow?: boolean
    /**
     * This part draws nothing and is never exported. Its mesh only gives the
     * pointer something to land on and the selection something to outline.
     */
    readonly proxy?: boolean
}

export interface GenerationContext {
    /** Deterministic randomness for this generation. */
    readonly random: RandomSource
    /** The seed behind that randomness, for hashing and derivation. */
    readonly seed: number
    /** The style profile in effect. */
    readonly style: StyleProfile
    /** The share of this part's full detail to build, 1 down to about 0.1. */
    readonly detail?: number
}

/** The geometry of one component, ready to be added to the scene. */
export interface GeneratedPart {
    readonly geometry: THREE.BufferGeometry
    readonly material: MaterialKind
    readonly surface?: PaintedSurface
    /** Left out, it follows from the material. See `roleOfPart`. */
    readonly role?: PartRole
}

/**
 * A generator for one kind of component.
 *
 * `parameters` describes the controls the inspector renders, so the UI and
 * the generator agree on ranges, defaults, and labels.
 */
export interface PartGenerator<P extends object = object> {
    readonly id: string
    readonly version: number
    readonly type: ComponentType
    readonly label: string
    readonly parameters: readonly ParameterSpec[]
    createDefaultParameters(): P
    validate(parameters: unknown): ValidationResult<P>
    generate(parameters: P, context: GenerationContext): GeneratedPart
    /**
     * Everything the mesh depends on, when that is less than the parameters.
     *
     * The renderer reuses a mesh while this stays the same, so a part whose
     * parameters hold the whole tree need not rebuild for every slider. A part
     * that has one is also free to move: its position is not part of the mesh.
     */
    signature?(parameters: P): unknown
    /**
     * The same geometry as `generate`, built away from the interface.
     *
     * Null when that is not possible here, in which case the caller generates
     * as usual. A heavy part has this so a slider never waits for its mesh.
     */
    buildOffThread?(parameters: P, style: StyleProfile, detail?: number): Promise<THREE.BufferGeometry> | null
    /** Turns what `buildOffThread` made into the part `generate` would have returned. */
    dress?(geometry: THREE.BufferGeometry, parameters: P): GeneratedPart
    /** True when `context.detail` lightens this part. An export thins out any other part itself. */
    readonly scalesWithDetail?: boolean
}

/** What a part is: its own word for it, or what its material implies. */
export function roleOfPart(part: GeneratedPart): PartRole {
    if (part.role) {
        return part.role
    }

    return part.material === 'leaves' || part.material === 'leaves-dark' || part.material === 'coconut'
        ? 'foliage'
        : 'solid'
}

/** A component produced by a tree generator, before it enters the scene. */
export interface GeneratedComponent {
    readonly id: string
    readonly type: ComponentType
    readonly generatorId: string
    readonly generatorVersion: number
    readonly parentId: string | null
    readonly transform: Transform
    readonly parameters: Readonly<Record<string, unknown>>
    readonly styleOverrides?: Readonly<Record<string, unknown>> | null
    readonly seed: number
    /** The slot this component occupies in the generator's output. */
    readonly slot: string
}

/**
 * A control Make it fit may move, and how far.
 *
 * The limit is the cheapest it may go, which keeps a tree from going bald. It
 * can be above the control's value, as a larger leaf size costs less.
 */
export interface FitControl {
    readonly key: string
    readonly limit: number
}

/**
 * A generator for a whole tree.
 *
 * It produces the component list, not the geometry. Each component is then
 * generated by its own part generator, which is what makes it possible to
 * regenerate one branch without touching the rest of the tree.
 */
export interface PropGenerator<P extends object = object> {
    readonly id: string
    readonly version: number
    readonly label: string
    readonly parameters: readonly ParameterSpec[]
    /** True when colours are one of its parameters, so the bark and leaf pickers do not apply. */
    readonly paintsOwnColours?: boolean
    /** True for a prop the wind does not move. */
    readonly still?: boolean
    /** True when every part of it moves about alike, as across a patch of grass. */
    readonly swaysEvenly?: boolean
    /** What to lower when it costs too much, in the words of its own controls. */
    readonly budgetAdvice?: string
    /**
     * The controls that do something with these values, as a kind of prop that
     * reuses one generator hides what it has no use for. Left out, all of them.
     */
    shownControls?(values: Readonly<Record<string, unknown>>): readonly ParameterSpec[]
    /** What Make it fit may change, best first. Left out, the prop only gets the advice. */
    readonly fitControls?: readonly FitControl[]
    createDefaultParameters(): P
    validate(parameters: unknown): ValidationResult<P>
    generate(parameters: P, context: GenerationContext): readonly GeneratedComponent[]
    /** Simple solids in the tree's own space. Left out, an export makes its own from the solid parts. */
    collision?(parameters: P, seed: number): readonly CollisionShape[]
    /** Where its base meets the ground. The origin when left out. */
    pivot?(parameters: P, seed: number): readonly [number, number, number]
}
