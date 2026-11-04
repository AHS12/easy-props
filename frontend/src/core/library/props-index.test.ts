import {describe, expect, it} from 'vitest'
import type {PropSummary} from './prop-summary'
import {parsePropsIndex, refreshPropsIndex, serializePropsIndex} from './props-index'

const summary = (name: string): PropSummary => ({
    name,
    kind: 'tree',
    presetId: null,
    presetName: null,
    seed: 1,
    createdAt: null,
})

const file = (id: string, size = 10, savedAt = '2026-11-01T10:00:00Z') => ({id, size, savedAt})

describe('the index of saved props', () => {
    it('reads only files that changed since it was written', async () => {
        const first = await refreshPropsIndex({}, [file('a'), file('b')], async (id) => summary(id))
        const read: string[] = []

        const second = await refreshPropsIndex(
            parsePropsIndex(serializePropsIndex(first.index)),
            [file('a'), file('b', 12)],
            async (id) => {
                read.push(id)
                return summary(`${id} again`)
            },
        )

        expect(read).toEqual(['b'])
        expect(second.summaries.get('a')?.name).toBe('a')
        expect(second.summaries.get('b')?.name).toBe('b again')
        expect(second.changed).toBe(true)
    })

    it('says nothing changed when every file is as it was', async () => {
        const first = await refreshPropsIndex({}, [file('a')], async (id) => summary(id))
        const second = await refreshPropsIndex(first.index, [file('a')], async () => {
            throw new Error('read a file it had no need to')
        })

        expect(second.changed).toBe(false)
    })

    it('forgets files that are gone', async () => {
        const first = await refreshPropsIndex({}, [file('a'), file('b')], async (id) => summary(id))
        const second = await refreshPropsIndex(first.index, [file('a')], async (id) => summary(id))

        expect(Object.keys(second.index)).toEqual(['a'])
        expect(second.changed).toBe(true)
    })

    it('is built again when it is damaged', () => {
        expect(parsePropsIndex('{not json')).toEqual({})
        expect(parsePropsIndex(JSON.stringify({version: 99, props: {}}))).toEqual({})
        expect(parsePropsIndex(JSON.stringify({version: 1, props: {a: {size: 'big'}}}))).toEqual({})
        expect(parsePropsIndex(null)).toEqual({})
    })
})
