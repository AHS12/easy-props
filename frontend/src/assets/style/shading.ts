/**
 * How the viewport draws the tree.
 *
 * `lit` is the finished look. `flat` reads the silhouette. `wireframe` shows
 * the triangles.
 */

export type ShadingMode = 'lit' | 'flat' | 'wireframe'

export const SHADING_MODES: readonly ShadingMode[] = ['lit', 'flat', 'wireframe']

export const SHADING_MODE_LABELS: Readonly<Record<ShadingMode, string>> = {
    lit: 'Lit',
    flat: 'Flat',
    wireframe: 'Wireframe',
}

/** What each mode is for, in the user's words. */
export const SHADING_MODE_HELP: Readonly<Record<ShadingMode, string>> = {
    lit: 'The finished look, with light and shadow.',
    flat: 'One flat colour per part. Good for checking the shape.',
    wireframe: 'Shows the triangles the tree is made of.',
}
