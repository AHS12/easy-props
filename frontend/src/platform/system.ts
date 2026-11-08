/**
 * Which system the app runs on, in the words of the bug report's System list.
 *
 * Only Go can tell Windows 11 from 10, so in a browser this is null and the
 * person picks it on GitHub.
 */

interface SystemBindings {
    SystemInfo(): Promise<string>
}

const bindings = (): SystemBindings | undefined =>
    typeof window === 'undefined' ? undefined : (window.go?.backend?.App as unknown as SystemBindings | undefined)

export async function systemName(): Promise<string | null> {
    try {
        return (await bindings()?.SystemInfo()) || null
    } catch {
        return null
    }
}
