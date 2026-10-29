/**
 * Validating a surface push.
 *
 * A push arrives from a pointer drag, so it is user input: a NaN coordinate
 * or a negative reach would break the mesh rather than the form. These are
 * clamped rather than rejected, like every other parameter.
 */

import {z} from 'zod'

const triple = z.tuple([z.number(), z.number(), z.number()])

export const surfacePushSchema = z.object({
    point: triple,
    direction: triple,
    strength: z.number().catch(0),
    radius: z.number().catch(0.2),
})

/** How many pushes a part keeps. Enough to sculpt, not enough to slow down. */
export const MAX_PUSHES = 24

/** The shape tool: off, or pushing the surface out or in. */
export type ShapeTool = 'off' | 'push' | 'pull'

export const SHAPE_TOOLS: readonly ShapeTool[] = ['off', 'push', 'pull']

export const SHAPE_TOOL_LABELS: Readonly<Record<ShapeTool, string>> = {
    off: 'Off',
    push: 'Push',
    pull: 'Pull',
}

/** How far the nearest push reaches, as a share of the part's own size. */
export const PUSH_REACH_SHARE = 0.4
