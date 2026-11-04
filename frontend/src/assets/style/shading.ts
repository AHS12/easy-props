/**
 * How the viewport draws the tree.
 *
 * `lit` is the finished look. `flat` reads the silhouette. `wireframe` shows
 * the triangles. `wind` shows what an export tells the engine about moving.
 * `cartoon` previews a game's cartoon lighting, which the engine does, so the
 * file is the same either way.
 */

export type ShadingMode = 'lit' | 'cartoon' | 'flat' | 'wireframe' | 'wind'

export const SHADING_MODES: readonly ShadingMode[] = ['lit', 'flat', 'wireframe', 'wind', 'cartoon']

export const SHADING_MODE_LABELS: Readonly<Record<ShadingMode, string>> = {
    lit: 'Lit',
    flat: 'Flat',
    wireframe: 'Wireframe',
    wind: 'Wind',
    cartoon: 'Cartoon',
}

/** What each mode is for, in the user's words. */
export const SHADING_MODE_HELP: Readonly<Record<ShadingMode, string>> = {
    lit: 'The finished look, with light and shadow.',
    flat: 'One flat colour per part. Good for checking the shape.',
    wireframe: 'Shows the triangles the tree is made of.',
    wind: 'How much each part moves in the wind. Red is slow sway, green is fast flutter.',
    cartoon: 'A preview of cartoon lighting. Your file stays the same.',
}
