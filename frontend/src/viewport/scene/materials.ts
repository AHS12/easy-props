/**
 * The viewport's own colours.
 *
 * These belong to the view, not to the tree. The material palette lives with
 * the assets, because it travels into the export.
 */

export {MATERIAL_COLORS} from '../../assets/style/materials'

export const VIEWPORT_COLORS = {
    background: '#2b332c',
    ground: '#333c33',
    grid: '#3a443a',
    gridMajor: '#46503f',
    selection: '#5c8c4a',
    /** The colour the wireframe overlay draws in. */
    wireframe: '#9fb89a',
} as const
