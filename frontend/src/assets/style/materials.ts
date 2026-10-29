/**
 * The material palette.
 *
 * A tree always reads as a coherent object because every generator draws
 * from this set. The same colours are used by the viewport and by the GLB
 * exporter, so an exported asset looks like what the user saw.
 *
 * These are the starting colours. The user can change them, and the change
 * travels with the tree into the export.
 */

export const MATERIAL_COLORS = {
    bark: '#6b4e35',
    barkLight: '#8a6a4f',
    leaves: '#4e7d3e',
    leavesDark: '#3a6130',
    coconut: '#7a5c3e',
} as const

/** The colours a new tree starts with. */
export const DEFAULT_MATERIALS = {
    bark: MATERIAL_COLORS.bark,
    leaves: MATERIAL_COLORS.leaves,
} as const

export interface ColourChoice {
    readonly name: string
    readonly value: string
}

/**
 * Bark colours to choose from.
 *
 * Named by colour, not by species. A beginner looking at a tree knows it is
 * brown, not that it is Quercus robur.
 */
export const BARK_COLOURS: readonly ColourChoice[] = [
    {name: 'Warm brown', value: '#6b4e35'},
    {name: 'Pale grey', value: '#8d8577'},
    {name: 'Dark brown', value: '#463024'},
    {name: 'Red-brown', value: '#7a4a2e'},
    {name: 'Grey-brown', value: '#5c5348'},
    {name: 'Birch white', value: '#cfc4ad'},
]

/** Leaf colours to choose from. */
export const LEAF_COLOURS: readonly ColourChoice[] = [
    {name: 'Fresh green', value: '#4e7d3e'},
    {name: 'Deep green', value: '#2f5c33'},
    {name: 'Olive', value: '#6d7a3a'},
    {name: 'Autumn orange', value: '#c4702a'},
    {name: 'Gold', value: '#d4a017'},
    {name: 'Grey-green', value: '#7d8a6b'},
]

/**
 * Darkens a hex colour.
 *
 * The shadowed leaf tone is derived from the leaf colour rather than being
 * picked separately, so the two always look like they belong together.
 */
export function darken(hex: string, amount: number): string {
    return mix(hex, '#000000', amount)
}

/**
 * Lightens a hex colour.
 */
export function lighten(hex: string, amount: number): string {
    return mix(hex, '#ffffff', amount)
}

function mix(hex: string, towards: string, amount: number): string {
    const parse = (value: string) => {
        const stripped = value.replace('#', '')

        const full =
            stripped.length === 3
                ? stripped
                      .split('')
                      .map((character) => character + character)
                      .join('')
                : stripped

        const number = Number.parseInt(full, 16)

        return Number.isNaN(number)
            ? null
            : [(number >> 16) & 0xff, (number >> 8) & 0xff, number & 0xff]
    }

    const from = parse(hex)
    const to = parse(towards)

    if (!from || !to) {
        return hex
    }

    const mixed = from.map((channel, index) =>
        Math.round(channel + (to[index] - channel) * amount),
    )

    return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}
