import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {
    applyTheme,
    readStoredTheme,
    resolveInitialTheme,
    storeTheme,
    systemTheme,
} from '../core/settings/theme'

const STORAGE_KEY = 'easy-props.theme'

describe('theme preferences', () => {
    beforeEach(() => {
        window.localStorage.clear()
        document.documentElement.removeAttribute('data-theme')
    })

    afterEach(() => {
        window.localStorage.clear()
    })

    it('reports no stored choice by default', () => {
        expect(readStoredTheme()).toBeNull()
    })

    it('round-trips a stored choice', () => {
        storeTheme('dark')
        expect(readStoredTheme()).toBe('dark')

        storeTheme('light')
        expect(readStoredTheme()).toBe('light')
    })

    it('ignores a stored value that is not a theme', () => {
        window.localStorage.setItem(STORAGE_KEY, 'neon')

        expect(readStoredTheme()).toBeNull()
    })

    it('prefers the stored choice over the system theme', () => {
        storeTheme('dark')

        expect(resolveInitialTheme()).toBe('dark')
    })

    it('falls back to the system theme when nothing is stored', () => {
        expect(resolveInitialTheme()).toBe(systemTheme())
    })

    it('writes the theme onto the document element', () => {
        applyTheme('dark')
        expect(document.documentElement.dataset.theme).toBe('dark')

        applyTheme('light')
        expect(document.documentElement.dataset.theme).toBe('light')
    })

    it('survives storage being unavailable', () => {
        const original = window.localStorage

        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            value: {
                getItem: () => null,
                setItem: () => {
                    throw new Error('storage disabled')
                },
            },
        })

        try {
            expect(() => storeTheme('dark')).not.toThrow()
            expect(readStoredTheme()).toBeNull()
        } finally {
            Object.defineProperty(window, 'localStorage', {
                configurable: true,
                value: original,
            })
        }
    })
})
