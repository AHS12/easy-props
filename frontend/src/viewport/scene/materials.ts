/**
 * The viewport's own colours.
 *
 * These belong to the view, not to the tree. The material palette lives with
 * the assets, because it travels into the export.
 */

export {MATERIAL_COLORS} from '../../assets/style/materials'

export const VIEWPORT_COLORS = {
    /** The sky above the horizon. */
    skyTop: '#43525e',
    /** The sky at the horizon, where the ground fades into it. */
    skyHorizon: '#93a189',
    ground: '#4c5647',
    /** A bright outdoor scene, for judging a prop among others. */
    meadowSkyTop: '#3f97ea',
    meadowHorizon: '#cfe7f8',
    meadowGround: '#6fa61c',
    meadowBounce: '#8fa860',
    grid: '#5c6656',
    gridMajor: '#6d7864',
    selection: '#f5a63a',
    /** The colour the wireframe overlay draws in. */
    wireframe: '#c3d6bd',
} as const
