import {afterEach, describe, expect, it, vi} from 'vitest'
import {applyTheme, resolveTheme, systemTheme} from '../core/settings/theme'

afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
})

const stubSystem = (light: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({matches: light && query.includes('light')}))

describe('the theme', () => {
    it('defaults to dark unless the system asks for light', () => {
        stubSystem(false)
        expect(systemTheme()).toBe('dark')

        stubSystem(true)
        expect(systemTheme()).toBe('light')
    })

    it('uses the choice over the system', () => {
        stubSystem(true)
        expect(resolveTheme('dark')).toBe('dark')
        expect(resolveTheme('system')).toBe('light')
    })

    it('marks the document, and remembers it for the first paint', () => {
        applyTheme('dark')

        expect(document.documentElement.dataset.theme).toBe('dark')
        expect(document.documentElement.classList.contains('dark')).toBe(true)
        expect(localStorage.getItem('easy-props.theme')).toBe('dark')

        applyTheme('light')

        expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
})
