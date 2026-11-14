import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const runtime = vi.hoisted(() => ({
    listeners: new Map<string, (event: {data: unknown}) => void>(),
    ByName: vi.fn(async (...args: unknown[]) => (args.length > 0 ? 'answer' : '')),
}))

vi.mock('@wailsio/runtime', () => ({
    Call: {ByName: runtime.ByName},
    Events: {
        On: (name: string, callback: (event: {data: unknown}) => void) => {
            runtime.listeners.set(name, callback)
            return () => runtime.listeners.delete(name)
        },
    },
    Browser: {OpenURL: vi.fn()},
    Clipboard: {SetText: vi.fn()},
    Window: {Minimise: vi.fn(), ToggleMaximise: vi.fn(), IsMaximised: vi.fn(), Close: vi.fn()},
}))

const {connectShell, desktopApp, desktopRuntime, fakeDesktop} = await import('./shell')

const host = window as unknown as {chrome?: unknown}

describe('the desktop shell', () => {
    afterEach(() => {
        delete host.chrome
        fakeDesktop()
        runtime.listeners.clear()
    })

    it('stays away in a plain browser', async () => {
        await connectShell()

        expect(desktopApp()).toBeUndefined()
        expect(desktopRuntime()).toBeUndefined()
    })

    describe('inside the app', () => {
        beforeEach(async () => {
            host.chrome = {webview: {postMessage: () => {}}}
            await connectShell()
        })

        it('calls Go methods by their full name', async () => {
            const app = desktopApp<{ReadFile(path: string): Promise<string>}>()

            await expect(app?.ReadFile('oak.json')).resolves.toBe('answer')
            expect(runtime.ByName).toHaveBeenCalledWith('easy-props/backend.App.ReadFile', 'oak.json')
        })

        it('is not mistaken for a promise', () => {
            expect((desktopApp<{then?: unknown}>())?.then).toBeUndefined()
        })

        it('passes an event one value, several values, or none', () => {
            const seen: unknown[][] = []
            desktopRuntime()?.EventsOn('progress', ((...values: unknown[]) => seen.push(values)) as never)
            const send = runtime.listeners.get('progress')!

            send({data: 0.5})
            send({data: [3, 10]})
            send({data: undefined})

            expect(seen).toEqual([[0.5], [3, 10], []])
        })
    })
})
