import {describe, expect, it} from 'vitest'
import {parsePrefix, rankEntries, scoreEntry} from './palette-search'

const entries = [
    {label: 'Remove part', keywords: 'delete'},
    {label: 'Move part'},
    {label: 'Detail level', keywords: 'lod poly'},
    {label: 'Export…', keywords: 'collision'},
    {label: 'Restore this part', keywords: 'reset'},
]

const top = (query: string) => rankEntries(entries, query)[0]?.label

describe('palette ranking', () => {
    it('puts the start of a word before a match inside one', () => {
        expect(top('move')).toBe('Move part')
    })

    it('finds the real terms and the plain names', () => {
        expect(top('lod')).toBe('Detail level')
        expect(top('collision')).toBe('Export…')
        expect(top('delete')).toBe('Remove part')
        expect(top('reset')).toBe('Restore this part')
    })

    it('tolerates a typo', () => {
        expect(top('exprot')).toBe('Export…')
        expect(top('remvoe')).toBe('Remove part')
    })

    it('ranks a typo below any exact match', () => {
        const items = [{label: 'Mover'}, {label: 'Moss'}]

        expect(scoreEntry(items[1], 'moss')).toBeGreaterThan(scoreEntry(items[0], 'mose'))
        expect(rankEntries([{label: 'Most'}, {label: 'Moss'}], 'moss')[0].label).toBe('Moss')
    })

    it('does not match nonsense', () => {
        expect(rankEntries(entries, 'zzzz')).toEqual([])
    })

    it('lets use break a near-tie but not beat a better match', () => {
        const items = [{label: 'Save'}, {label: 'Save a copy'}]
        const used = rankEntries(items, 'save', (item) => (item.label === 'Save a copy' ? 5 : 0))

        expect(used[0].label).toBe('Save a copy')
        expect(rankEntries(entries, 'move', (item) => (item.label === 'Remove part' ? 1000 : 0))[0].label).toBe('Move part')
    })
})

describe('palette prefixes', () => {
    it('limits a section and leaves the rest of the text', () => {
        expect(parsePrefix('#droop')).toEqual({section: 'Controls', text: 'droop'})
        expect(parsePrefix('@willow')).toEqual({section: 'Presets', text: 'willow'})
        expect(parsePrefix('>export')).toEqual({section: 'Actions', text: 'export'})
        expect(parsePrefix('oak')).toEqual({section: null, text: 'oak'})
    })
})
