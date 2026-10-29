import {describe, expect, it} from 'vitest'
import {
    createSeededRandom,
    hashSeed,
    pick,
    randomInt,
    randomRange,
    shuffled,
} from '../assets/shared/random'

describe('createSeededRandom', () => {
    it('produces the same sequence for the same seed', () => {
        const first = createSeededRandom(1234)
        const second = createSeededRandom(1234)

        const firstValues = Array.from({length: 32}, () => first())
        const secondValues = Array.from({length: 32}, () => second())

        expect(firstValues).toEqual(secondValues)
    })

    it('produces different sequences for different seeds', () => {
        const first = Array.from({length: 32}, createSeededRandom(1))
        const second = Array.from({length: 32}, createSeededRandom(2))

        expect(first).not.toEqual(second)
    })

    it('always returns values within [0, 1)', () => {
        const random = createSeededRandom(99)

        for (let i = 0; i < 1000; i++) {
            const value = random()
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThan(1)
        }
    })

    it('treats negative seeds as unsigned 32-bit integers', () => {
        expect(Array.from({length: 16}, createSeededRandom(-1))).toEqual(
            Array.from({length: 16}, createSeededRandom(4294967295)),
        )
    })
})

describe('hashSeed', () => {
    it('is deterministic', () => {
        expect(hashSeed(7, 3)).toBe(hashSeed(7, 3))
    })

    it('separates different inputs', () => {
        expect(hashSeed(7, 3)).not.toBe(hashSeed(7, 4))
        expect(hashSeed(7, 3)).not.toBe(hashSeed(3, 7))
    })

    it('returns an unsigned 32-bit integer', () => {
        const hash = hashSeed(1, 2, 3)
        expect(Number.isInteger(hash)).toBe(true)
        expect(hash).toBeGreaterThanOrEqual(0)
        expect(hash).toBeLessThanOrEqual(4294967295)
    })
})

describe('randomRange', () => {
    it('stays within the requested bounds', () => {
        const random = createSeededRandom(42)

        for (let i = 0; i < 500; i++) {
            const value = randomRange(random, -3, 5)
            expect(value).toBeGreaterThanOrEqual(-3)
            expect(value).toBeLessThan(5)
        }
    })
})

describe('randomInt', () => {
    it('includes both bounds', () => {
        const random = createSeededRandom(5)
        const seen = new Set<number>()

        for (let i = 0; i < 500; i++) {
            const value = randomInt(random, 1, 3)
            expect(Number.isInteger(value)).toBe(true)
            expect(value).toBeGreaterThanOrEqual(1)
            expect(value).toBeLessThanOrEqual(3)
            seen.add(value)
        }

        expect([...seen].sort()).toEqual([1, 2, 3])
    })
})

describe('pick', () => {
    it('returns one of the provided items', () => {
        const random = createSeededRandom(11)
        const items = ['a', 'b', 'c']

        for (let i = 0; i < 100; i++) {
            expect(items).toContain(pick(random, items))
        }
    })

    it('throws on an empty collection', () => {
        expect(() => pick(createSeededRandom(1), [])).toThrow()
    })
})

describe('shuffled', () => {
    it('preserves every element', () => {
        const random = createSeededRandom(77)
        const items = [1, 2, 3, 4, 5]
        const result = shuffled(random, items)

        expect(result).toHaveLength(items.length)
        expect([...result].sort()).toEqual([...items].sort())
    })

    it('does not modify the input array', () => {
        const random = createSeededRandom(77)
        const items = [1, 2, 3, 4, 5]

        shuffled(random, items)

        expect(items).toEqual([1, 2, 3, 4, 5])
    })

    it('is deterministic for a given seed', () => {
        expect(shuffled(createSeededRandom(3), [1, 2, 3, 4, 5])).toEqual(
            shuffled(createSeededRandom(3), [1, 2, 3, 4, 5]),
        )
    })
})
