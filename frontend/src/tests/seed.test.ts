import {beforeEach, describe, expect, it} from 'vitest'
import {canUndo} from '../core/history/history'
import {MAX_SEED, parseSeed} from '../core/scene/seed-text'
import {useEditorStore} from '../store/editor-store'

const store = () => useEditorStore.getState()
const seedOf = () => store().scene.assets[0]?.seed

describe('reading a typed seed', () => {
    it('takes a whole number', () => {
        expect(parseSeed('305')).toBe(305)
        expect(parseSeed('0')).toBe(0)
    })

    it('takes the largest seed the random source can use, and nothing above it', () => {
        expect(parseSeed(String(MAX_SEED))).toBe(4294967295)
        expect(parseSeed('4294967296')).toBeNull()
    })

    it('ignores spaces and commas', () => {
        expect(parseSeed(' 1,024 ')).toBe(1024)
        expect(parseSeed('4 294 967 295')).toBe(MAX_SEED)
    })

    it('ignores text around a single number, so a copied label pastes cleanly', () => {
        expect(parseSeed('Seed 305')).toBe(305)
        expect(parseSeed('seed: 305.')).toBe(305)
    })

    it('refuses text with no number', () => {
        expect(parseSeed('')).toBeNull()
        expect(parseSeed('oak')).toBeNull()
    })

    it('refuses more than one number', () => {
        expect(parseSeed('305 and 12')).toBeNull()
        expect(parseSeed('Seed 305 / 14,000 faces')).toBeNull()
    })

    it('refuses numbers that are not whole and not negative', () => {
        expect(parseSeed('-5')).toBeNull()
        expect(parseSeed('12.5')).toBeNull()
        expect(parseSeed('1e5')).toBeNull()
    })
})

describe('using a seed', () => {
    beforeEach(() => {
        store().startNewProp('blossom-tree')
    })

    it('gives the same parts as the prop that had it', () => {
        store().randomizeTree()
        const liked = store().scene.assets[0]
        store().randomizeTree()

        store().setSeed(liked.seed)

        expect(store().scene.assets[0].components).toEqual(liked.components)
    })

    it('undoes in one step', () => {
        const before = seedOf()

        store().setSeed(305)
        expect(seedOf()).toBe(305)

        store().undo()

        expect(seedOf()).toBe(before)
        expect(canUndo(store().history)).toBe(false)
    })

    it('does nothing when the seed is the same', () => {
        store().setSeed(seedOf()!)

        expect(canUndo(store().history)).toBe(false)
    })
})
