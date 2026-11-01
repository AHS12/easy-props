import {describe, expect, it} from 'vitest'
import {pxToRem} from './px-to-rem'

describe('turning pixels into rems', () => {
    it.each([
        ['16px', '1rem'],
        ['4px 8px', '0.25rem 0.5rem'],
        ['-8px', '-0.5rem'],
        ['calc(100vh - 32px)', 'calc(100vh - 2rem)'],
        ['400 13px/1.45 var(--font-sans)', '400 0.8125rem/1.45 var(--font-sans)'],
        ['0 0 0 2px #5c8c4a', '0 0 0 0.125rem #5c8c4a'],
    ])('turns %s into %s', (value, expected) => {
        expect(pxToRem(value)).toBe(expected)
    })

    it.each(['1px solid red', '0.5px', '0px', 'var(--space-2px)', 'url(data:image/svg+xml,width="24px")', '#123px', '1.5rem'])('leaves %s alone', (value) => {
        expect(pxToRem(value)).toBe(value)
    })
})
