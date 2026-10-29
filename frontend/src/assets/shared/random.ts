/**
 * Deterministic pseudo-random number generation.
 *
 * Every generator in this project must be reproducible: the same seed has to
 * produce the same tree. All randomness therefore flows through a
 * `RandomSource` created here rather than `Math.random`.
 */

/** Returns a number in the range [0, 1). */
export type RandomSource = () => number

const UINT32_RANGE = 4294967296

/**
 * Creates a deterministic random source from a numeric seed.
 *
 * Uses the mulberry32 algorithm: small, fast, and has a long enough period
 * for asset generation.
 */
export function createSeededRandom(seed: number): RandomSource {
    let state = seed >>> 0

    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE
    }
}

/**
 * Combines several numbers into a single seed.
 *
 * Use this to derive per-component seeds from a tree seed so that adding or
 * removing one component does not shift the randomness of the others.
 */
export function hashSeed(...parts: number[]): number {
    let hash = 0x811c9dc5

    for (const part of parts) {
        let value = Math.imul(Math.trunc(part) ^ 0x9e3779b9, 0x85ebca6b)
        value ^= value >>> 13
        value = Math.imul(value, 0xc2b2ae35)
        value ^= value >>> 16
        hash = Math.imul(hash ^ value, 0x27d4eb2f)
    }

    return hash >>> 0
}

/** Returns a random number in the range [min, max). */
export function randomRange(random: RandomSource, min: number, max: number): number {
    return min + random() * (max - min)
}

/** Returns a random integer in the range [min, max], both bounds inclusive. */
export function randomInt(random: RandomSource, min: number, max: number): number {
    return Math.floor(randomRange(random, min, max + 1))
}

/** Returns a uniformly chosen element of `items`. */
export function pick<T>(random: RandomSource, items: readonly T[]): T {
    if (items.length === 0) {
        throw new Error('Cannot pick from an empty collection')
    }

    return items[Math.floor(random() * items.length)]
}

/**
 * Returns a shuffled copy of `items`.
 *
 * The input array is never modified.
 */
export function shuffled<T>(random: RandomSource, items: readonly T[]): T[] {
    const result = [...items]

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
    }

    return result
}
