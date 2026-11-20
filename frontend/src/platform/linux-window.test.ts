import {afterEach, describe, expect, it, vi} from 'vitest'
import {hasTray, isLinux} from './window'

const asBrowser = (userAgent: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)

afterEach(() => {
    vi.restoreAllMocks()
})

describe('the window on Linux', () => {
    it('is recognised from WebKitGTK, and has no tray to hide in', () => {
        asBrowser('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')

        expect(isLinux()).toBe(true)
        expect(hasTray()).toBe(false)
    })

    it('leaves Windows, Macs and Android phones alone', () => {
        for (const agent of [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
            'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
        ]) {
            asBrowser(agent)
            expect(isLinux()).toBe(false)
            expect(hasTray()).toBe(true)
        }
    })
})
