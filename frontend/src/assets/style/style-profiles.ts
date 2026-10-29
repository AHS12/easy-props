/**
 * Art style profiles.
 *
 * A style configures geometry and appearance defaults. It never replaces the
 * underlying tree structure, so switching style keeps the same tree
 * recognisable.
 */

export type StyleProfileId = 'low-poly' | 'detailed'

export interface StyleProfile {
    readonly id: StyleProfileId
    readonly label: string
    /** Radial segments on generated tubes. */
    readonly radialSegments: number
    /** Height segments along generated tubes. */
    readonly heightSegments: number
    readonly flatShading: boolean
    readonly foliageDetail: 'simple' | 'layered'
    readonly barkDetail: 'smooth' | 'ridged'
    /** Soft ceiling generators use to scale detail. */
    readonly polygonBudget: number
}

export const STYLE_PROFILES: Readonly<Record<StyleProfileId, StyleProfile>> = {
    'low-poly': {
        id: 'low-poly',
        label: 'Low-poly',
        radialSegments: 5,
        heightSegments: 3,
        flatShading: true,
        foliageDetail: 'simple',
        barkDetail: 'smooth',
        polygonBudget: 2500,
    },
    detailed: {
        id: 'detailed',
        label: 'Detailed',
        radialSegments: 8,
        heightSegments: 6,
        flatShading: false,
        foliageDetail: 'layered',
        barkDetail: 'ridged',
        polygonBudget: 8000,
    },
}

export const STYLE_ORDER: readonly StyleProfileId[] = ['low-poly', 'detailed']

export function getStyleProfile(id: StyleProfileId): StyleProfile {
    return STYLE_PROFILES[id]
}
