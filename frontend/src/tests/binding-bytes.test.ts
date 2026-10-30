import {describe, expect, it} from 'vitest'
import {pngDataUrlFromBinding, textFromBinding} from '../platform/bytes'

const JSON_TEXT = JSON.stringify({name: 'Palm', schemaVersion: 2})

/**
 * Wails marshals `[]byte` with Go's `encoding/json`, which writes base64 —
 * even though the generated `App.d.ts` says `Array<number>`. Reading a file
 * through the declaration gave an empty array and a silently empty file,
 * which is what broke opening a project and showing a gallery preview.
 */
describe('reading bytes back from the Go boundary', () => {
    it('decodes base64, which is what the bridge actually sends', () => {
        expect(textFromBinding(btoa(JSON_TEXT))).toBe(JSON_TEXT)
    })

    it('still decodes a plain array of numbers', () => {
        expect(textFromBinding([...new TextEncoder().encode(JSON_TEXT)])).toBe(JSON_TEXT)
    })

    it('gives empty text when there is nothing to read', () => {
        expect(textFromBinding(null)).toBe('')
        expect(textFromBinding(undefined)).toBe('')
        expect(textFromBinding('')).toBe('')
        expect(textFromBinding([])).toBe('')
    })

    it('passes a base64 preview straight through as a data URL', () => {
        expect(pngDataUrlFromBinding('iVBORw0KGgo=')).toBe(
            'data:image/png;base64,iVBORw0KGgo=',
        )
    })

    it('builds a data URL from an array of bytes', () => {
        expect(pngDataUrlFromBinding([1, 2, 3])).toBe(
            `data:image/png;base64,${btoa(String.fromCharCode(1, 2, 3))}`,
        )
    })

    it('has no preview when there are no bytes', () => {
        expect(pngDataUrlFromBinding(null)).toBeNull()
        expect(pngDataUrlFromBinding([])).toBeNull()
        expect(pngDataUrlFromBinding('')).toBeNull()
    })
})
