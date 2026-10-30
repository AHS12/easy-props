/**
 * Hand edits to single parts of a painted tree.
 *
 * The tree is still built from one plan. An edit is an instruction to that
 * plan, keyed by the part's stable name, so the wood re-blends around a moved
 * limb, children follow their parent, and sliders keep working afterwards.
 */

import type {Vec3} from './plan'

export interface LimbEdit {
    /** How far each control point has been dragged, in metres. */
    readonly offsets?: readonly Vec3[]
    readonly lengthScale?: number
    readonly thicknessScale?: number
    readonly removed?: boolean
}

export interface ClumpEdit {
    readonly offset?: Vec3
    readonly sizeScale?: number
    readonly flattenScale?: number
    readonly colour?: string
    readonly removed?: boolean
}

export interface PaintedEdits {
    readonly limbs: Readonly<Record<string, LimbEdit>>
    readonly clumps: Readonly<Record<string, ClumpEdit>>
}

const NO_EDITS: PaintedEdits = {limbs: {}, clumps: {}}

/** Never throws: a damaged edit list means an unedited tree, not a broken one. */
export function parseEdits(text: string): PaintedEdits {
    if (!text) {
        return NO_EDITS
    }

    try {
        const raw = JSON.parse(text) as Partial<PaintedEdits>

        return {limbs: raw.limbs ?? {}, clumps: raw.clumps ?? {}}
    } catch {
        return NO_EDITS
    }
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** What the user asked of a part, in the terms of the existing editor. */
export type PartAction =
    | {readonly kind: 'patch'; readonly patch: Readonly<Record<string, unknown>>}
    | {readonly kind: 'move'; readonly position: Vec3}
    | {readonly kind: 'remove'}
    | {readonly kind: 'restore'}

interface PartReference {
    readonly generatorId: string
    readonly parameters: Readonly<Record<string, unknown>>
}

export const isPaintedPart = (generatorId: string) => generatorId.startsWith('painted-')

/**
 * The tree's edit list after an action on one part.
 *
 * Null when the action does not apply, such as moving a limb or removing the
 * trunk, so the caller leaves the tree alone.
 */
export function applyPartAction(
    editsText: string,
    part: PartReference,
    action: PartAction,
): string | null {
    const edits = parseEdits(editsText)
    const key = part.parameters.key

    if (typeof key !== 'string') {
        return null
    }

    if (part.generatorId === 'painted-limb') {
        const next = limbAfter(edits.limbs[key] ?? {}, key, part, action)

        if (next === null) {
            return null
        }

        const limbs = {...edits.limbs}

        if (next === 'clear') {
            delete limbs[key]
        } else {
            limbs[key] = next
        }

        return JSON.stringify({...edits, limbs})
    }

    if (part.generatorId === 'painted-clump') {
        const next = clumpAfter(edits.clumps[key] ?? {}, part, action)

        if (next === null) {
            return null
        }

        const clumps = {...edits.clumps}

        if (next === 'clear') {
            delete clumps[key]
        } else {
            clumps[key] = next
        }

        return JSON.stringify({...edits, clumps})
    }

    return null
}

function limbAfter(
    edit: LimbEdit,
    key: string,
    part: PartReference,
    action: PartAction,
): LimbEdit | 'clear' | null {
    switch (action.kind) {
        case 'restore':
            return 'clear'

        case 'remove':
            // The trunk is the tree.
            return key === 't' ? null : {...edit, removed: true}

        case 'move':
            return null

        case 'patch': {
            const {patch} = action
            const next: {-readonly [K in keyof LimbEdit]: LimbEdit[K]} = {...edit}

            if (finite(patch.lengthScale)) {
                next.lengthScale = patch.lengthScale
            }

            if (finite(patch.thicknessScale)) {
                next.thicknessScale = patch.thicknessScale
            }

            const base = part.parameters.base as readonly Vec3[] | undefined

            if (Array.isArray(patch.spine) && base) {
                next.offsets = (patch.spine as readonly {x?: number; y?: number; z: number}[]).map(
                    (point, index): Vec3 => [
                        (point.x ?? 0) - base[index][0],
                        (point.y ?? 0) - base[index][1],
                        point.z - base[index][2],
                    ],
                )
            }

            return next
        }
    }
}

function clumpAfter(
    edit: ClumpEdit,
    part: PartReference,
    action: PartAction,
): ClumpEdit | 'clear' | null {
    switch (action.kind) {
        case 'restore':
            return 'clear'

        case 'remove':
            return {...edit, removed: true}

        case 'move': {
            const base = part.parameters.base as Vec3 | undefined

            return base
                ? {
                      ...edit,
                      offset: [
                          action.position[0] - base[0],
                          action.position[1] - base[1],
                          action.position[2] - base[2],
                      ],
                  }
                : null
        }

        case 'patch': {
            const {patch} = action
            const next: {-readonly [K in keyof ClumpEdit]: ClumpEdit[K]} = {...edit}

            if (finite(patch.sizeScale)) {
                next.sizeScale = patch.sizeScale
            }

            if (finite(patch.flattenScale)) {
                next.flattenScale = patch.flattenScale
            }

            if (typeof patch.colour === 'string') {
                next.colour = patch.colour
            }

            return next
        }
    }
}
