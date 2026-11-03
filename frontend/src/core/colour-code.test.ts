import {describe, expect, it} from 'vitest'
import {parseColourCode, parseColourList} from './colour-code'
import {parseSettings} from './settings/settings-spec'

describe('reading a colour code', () => {
    it('takes a code with or without #, short codes, and rgb()', () => {
        for (const text of ['#4e7d3e', '4e7d3e', '#4E7D3E', '  #4e7d3e  ', 'rgb(78, 125, 62)', 'rgb(78 125 62)']) {
            expect(parseColourCode(text), text).toBe('#4e7d3e')
        }

        expect(parseColourCode('#4e7')).toBe('#44ee77')
    })

    it('gives nothing for text that is not one colour', () => {
        for (const text of ['', 'green', '#4e7d3', '#4e7d3e #ffffff', 'rgb(300, 0, 0)', 'rgb(1, 2)']) {
            expect(parseColourCode(text), text).toBeNull()
        }
    })

    it('reads a pasted list once each, in order, split by spaces, commas or new lines', () => {
        expect(parseColourList('#264653, #2a9d8f\n#e9c46a rgb(244, 162, 97) e76f51 #264653 nonsense')).toEqual([
            '#264653',
            '#2a9d8f',
            '#e9c46a',
            '#f4a261',
            '#e76f51',
        ])
    })
})

describe('remembered colours in the settings file', () => {
    it('keeps good codes, and drops repeats and anything else', () => {
        const file = parseSettings(
            JSON.stringify({version: 2, recentColours: ['#AABBCC', '#aabbcc', 'red', 4], myColours: ['#112233', '#12']}),
        )

        expect(file.recentColours).toEqual(['#aabbcc'])
        expect(file.myColours).toEqual(['#112233'])
    })

    it('reads a file from before them as empty lists', () => {
        const file = parseSettings(JSON.stringify({version: 2}))

        expect(file.recentColours).toEqual([])
        expect(file.myColours).toEqual([])
    })
})
