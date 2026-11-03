/**
 * Colour codes, as people paste them from palette websites and art programs.
 *
 * Everything is kept as a lowercase `#rrggbb`, the one form the rest of the app reads.
 */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i
const RGB = /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i

/** A colour as `#rrggbb`, or null when the text isn't one colour code. */
export function parseColourCode(text: string): string | null {
    const trimmed = text.trim()
    const hex = HEX.exec(trimmed)

    if (hex) {
        const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1]

        return `#${digits.toLowerCase()}`
    }

    const rgb = RGB.exec(trimmed)

    if (rgb) {
        const channels = rgb.slice(1, 4).map(Number)

        if (channels.every((channel) => channel <= 255)) {
            return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
        }
    }

    return null
}

/**
 * Every colour code in a pasted list, once each, in order. Codes may be split by
 * spaces, commas or new lines, as palette websites copy them.
 */
export function parseColourList(text: string): string[] {
    const colours: string[] = []

    // rgb() has commas of its own, so it's one token, read whole.
    for (const token of text.match(/rgba?\([^)]*\)|[^\s,;]+/gi) ?? []) {
        const colour = parseColourCode(token)

        if (colour && !colours.includes(colour)) {
            colours.push(colour)
        }
    }

    return colours
}
