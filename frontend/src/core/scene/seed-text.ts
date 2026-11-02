/**
 * Reading a seed someone typed or pasted.
 */

/** The random source reads a seed as a 32-bit whole number, so this is the largest. */
export const MAX_SEED = 4294967295

export const NOT_A_SEED = "That isn't a seed. A seed is a whole number, like 305."

/**
 * The seed in some text, or null if there isn't exactly one.
 *
 * Spaces and commas are dropped, and so is any text around a single number, so
 * "Seed 305" and "1,024" both paste cleanly. A sign or a decimal point means it
 * isn't a whole number, so it isn't a seed.
 */
export function parseSeed(text: string): number | null {
    const numbers = text.replace(/[\s,]/g, '').match(/[-+]?\d+(\.\d+)?/g) ?? []

    if (numbers.length !== 1 || !/^\d+$/.test(numbers[0])) {
        return null
    }

    const seed = Number(numbers[0])

    return seed <= MAX_SEED ? seed : null
}
