/**
 * The desktop shell, as the rest of `platform/` sees it.
 *
 * Inside the app, Go's methods and the window's runtime come from Wails. In a
 * browser or a test there is no shell, so both are undefined and every caller
 * falls back to what the browser offers. Tests put a stand-in in place with
 * `fakeDesktop`.
 *
 * The runtime is loaded only inside the app. In a browser it would warn on every
 * page load and listen for drags that can never come.
 */

/** The window and system calls the interface makes. */
export interface ShellRuntime {
    /** Calls back with the event's data. Several values from Go arrive as separate arguments. */
    EventsOn(name: string, callback: (...data: never[]) => void): () => void
    WindowMinimise(): void
    WindowToggleMaximise(): void
    WindowIsMaximised(): Promise<boolean>
    /** Closes the window, through the close guard. */
    WindowClose(): void
    BrowserOpenURL(url: string): void
    ClipboardSetText(text: string): Promise<boolean>
}

interface Shell {
    app: object | undefined
    runtime: ShellRuntime | undefined
}

/** Matches the Go package and type of the service in main.go. */
const SERVICE = 'easy-props/backend.App'

let current: Shell | undefined

interface WebViewHost {
    chrome?: {webview?: {postMessage?: unknown}}
    webkit?: {messageHandlers?: {external?: {postMessage?: unknown}}}
}

/**
 * True when the page is inside the app's window: Windows' WebView2 or a Mac's
 * WebKit, which give the page a way to message the app. Wails' own details arrive
 * only after the page has loaded on Windows, so they can't be asked yet.
 */
function insideApp(): boolean {
    if (typeof window === 'undefined') {
        return false
    }

    const host = window as unknown as WebViewHost

    return host.chrome?.webview?.postMessage !== undefined || host.webkit?.messageHandlers?.external?.postMessage !== undefined
}

/** Loads the runtime when inside the app. main.tsx waits for it before drawing anything. */
export async function connectShell(): Promise<void> {
    if (!insideApp()) {
        return
    }

    const {Browser, Call, Clipboard, Events, Window} = await import('@wailsio/runtime')

    // Each Go method is called by name, so the typed interfaces in each platform
    // file stay the only description of the boundary.
    const app = new Proxy({}, {
        get: (_target, name) =>
            // Promise checks look for `then`, and this is not a promise.
            typeof name === 'string' && name !== 'then'
                ? (...args: unknown[]) => Call.ByName(`${SERVICE}.${name}`, ...args)
                : undefined,
    })

    const runtime: ShellRuntime = {
        EventsOn: (name, callback) =>
            Events.On(name, (event) => {
                const data: unknown = event.data
                const values = Array.isArray(data) ? data : data === undefined || data === null ? [] : [data]

                ;(callback as (...values: unknown[]) => void)(...values)
            }),
        WindowMinimise: () => void Window.Minimise(),
        WindowToggleMaximise: () => void Window.ToggleMaximise(),
        WindowIsMaximised: () => Window.IsMaximised(),
        WindowClose: () => void Window.Close(),
        BrowserOpenURL: (url) => void Browser.OpenURL(url),
        ClipboardSetText: async (text) => {
            await Clipboard.SetText(text)
            return true
        },
    }

    current = {app, runtime}
}

/** Go's methods, typed by the caller, or undefined outside the app. */
export function desktopApp<T>(): T | undefined {
    return current?.app as T | undefined
}

/** The window's runtime, or undefined outside the app. */
export function desktopRuntime(): ShellRuntime | undefined {
    return current?.runtime
}

/** Puts a stand-in shell in place for a test, or takes it away with no arguments. */
export function fakeDesktop(app?: object, runtime?: Partial<ShellRuntime>): void {
    current = app || runtime ? {app, runtime: runtime as ShellRuntime | undefined} : undefined
}
