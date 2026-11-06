/**
 * How the viewport draws the tree.
 *
 * `lit` is the finished look. `flat` reads the silhouette. `wireframe` shows
 * the triangles. `wind` shows what an export tells the engine about moving.
 * `cartoon` and `cel` preview a game's cartoon lighting, which the engine does,
 * so the file is the same either way.
 */

export type ShadingMode = 'lit' | 'cartoon' | 'cel' | 'flat' | 'wireframe' | 'wind'

export const SHADING_MODES: readonly ShadingMode[] = ['lit', 'flat', 'wireframe', 'wind', 'cartoon', 'cel']

export const SHADING_MODE_LABELS: Readonly<Record<ShadingMode, string>> = {
    lit: 'Lit',
    flat: 'Flat',
    wireframe: 'Wireframe',
    wind: 'Wind',
    cartoon: 'Cartoon',
    cel: 'Comic',
}

/** What each mode is for, in the user's words. */
export const SHADING_MODE_HELP: Readonly<Record<ShadingMode, string>> = {
    lit: 'The finished look, with light and shadow.',
    flat: 'One flat colour per part. Good for checking the shape.',
    wireframe: 'Shows the triangles the tree is made of.',
    wind: 'How much each part moves in the wind. Red is slow sway, green is fast flutter.',
    cartoon: 'A preview of cartoon lighting. Your file stays the same.',
    cel: 'Flat colours, sharp shadows and bold lines. Often called cel shading. Your file stays the same.',
}

/** Other words people search for, so a mode is found by the name they know it by. */
export const SHADING_MODE_KEYWORDS: Readonly<Partial<Record<ShadingMode, string>>> = {
    cartoon: 'toon soft',
    cel: 'cel shading toon anime ink outline',
}
