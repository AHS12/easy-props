import {describe, expect, it} from 'vitest'
import {groupByTime, matchesSearch, sortProps, summarizeProp, timeGroupOf, UNREADABLE_NAME, type ListedProp} from './prop-summary'

const documentOf = (fields: Record<string, unknown>, asset: Record<string, unknown> = {}) =>
    JSON.stringify({
        schemaVersion: 2,
        generator: 'easy-props',
        createdAt: '2026-10-02T09:00:00.000Z',
        modifiedAt: '2026-11-01T09:00:00.000Z',
        style: 'low-poly',
        scene: {id: 'scene-1', assets: [{id: 'asset-1', kind: 'tree', generatorId: 'painted-tree', seed: 48213, ...asset}]},
        ...fields,
    })

const listed = (id: string, name: string, savedAt: string, extra: Partial<ListedProp> = {}): ListedProp => ({
    id,
    name,
    savedAt,
    createdAt: null,
    presetName: null,
    ...extra,
})

describe('reading a saved prop', () => {
    it('gives its name, preset, seed and when it was made', () => {
        const summary = summarizeProp(documentOf({name: 'Old oak', preset: 'oak'}))

        expect(summary).toMatchObject({name: 'Old oak', presetId: 'oak', seed: 48213, createdAt: '2026-10-02T09:00:00.000Z'})
    })

    it('gets the kind of a prop saved before 0.3.5 from its generator', () => {
        expect(summarizeProp(documentOf({name: 'Rock'}, {generatorId: 'cut-rock'})).kind).toBe('rock')
        expect(summarizeProp(documentOf({name: 'Fern'}, {generatorId: 'plant'})).kind).toBe('flower')
        expect(summarizeProp(documentOf({name: 'Palm'}, {generatorId: 'palm-tree'})).kind).toBe('palm')
    })

    it('lists a file it cannot read under no kind', () => {
        for (const broken of ['not json', '[]', '{}', JSON.stringify({name: 'x', scene: {assets: []}})]) {
            expect(summarizeProp(broken)).toMatchObject({name: UNREADABLE_NAME, kind: null})
        }
    })

    it('names a prop with no name', () => {
        expect(summarizeProp(documentOf({})).name).toBe('Untitled prop')
    })
})

describe('sorting props', () => {
    const props = [
        listed('a', 'birch', '2026-11-01T10:00:00Z', {createdAt: '2026-01-01T00:00:00Z'}),
        listed('b', 'Apple', '2026-11-03T10:00:00Z', {createdAt: '2025-01-01T00:00:00Z'}),
        listed('c', 'cedar', '2026-10-01T10:00:00Z', {createdAt: '2026-06-01T00:00:00Z'}),
    ]

    it('puts the last changed first', () => {
        expect(sortProps(props, 'changed').map((prop) => prop.id)).toEqual(['b', 'a', 'c'])
    })

    it('sorts by name ignoring case', () => {
        expect(sortProps(props, 'name').map((prop) => prop.name)).toEqual(['Apple', 'birch', 'cedar'])
    })

    it('puts the most recently made first', () => {
        expect(sortProps(props, 'made').map((prop) => prop.id)).toEqual(['c', 'a', 'b'])
    })
})

describe('grouping props by when they changed', () => {
    const now = new Date(2026, 10, 4, 9, 0)

    it('counts calendar days, not hours', () => {
        expect(timeGroupOf(new Date(2026, 10, 4, 0, 5).toISOString(), now)).toBe('Today')
        expect(timeGroupOf(new Date(2026, 10, 3, 23, 55).toISOString(), now)).toBe('This week')
        expect(timeGroupOf(new Date(2026, 9, 29, 12, 0).toISOString(), now)).toBe('This week')
        expect(timeGroupOf(new Date(2026, 9, 20, 12, 0).toISOString(), now)).toBe('This month')
        expect(timeGroupOf(new Date(2026, 5, 1, 12, 0).toISOString(), now)).toBe('Earlier')
    })

    it('keeps a day across a clock change as one day', () => {
        // Clocks go back in late October in many places; one calendar day is still one.
        const morning = new Date(2026, 9, 26, 9, 0)

        expect(timeGroupOf(new Date(2026, 9, 25, 9, 0).toISOString(), morning)).toBe('This week')
    })

    it('splits a sorted list into runs under each heading', () => {
        const props = [
            listed('a', 'a', new Date(2026, 10, 4, 8).toISOString()),
            listed('b', 'b', new Date(2026, 10, 2, 8).toISOString()),
            listed('c', 'c', new Date(2026, 10, 1, 8).toISOString()),
            listed('d', 'd', new Date(2025, 0, 1).toISOString()),
        ]

        expect(groupByTime(props, now).map(({group, props: inGroup}) => [group, inGroup.length])).toEqual([
            ['Today', 1],
            ['This week', 2],
            ['Earlier', 1],
        ])
    })
})

describe('searching props', () => {
    it('finds a renamed oak by the preset it started from', () => {
        expect(matchesSearch(listed('a', 'Big one', '', {presetName: 'Oak'}), 'oak')).toBe(true)
    })

    it('matches part of a name, ignoring case', () => {
        expect(matchesSearch(listed('a', 'Mossy Boulder', ''), 'boul')).toBe(true)
        expect(matchesSearch(listed('a', 'Mossy Boulder', ''), 'pine')).toBe(false)
    })
})
