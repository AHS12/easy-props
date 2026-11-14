/**
 * Which system the app runs on, in the words of the bug report's System list.
 *
 * Only Go can tell Windows 11 from 10, so in a browser this is null and the
 * person picks it on GitHub.
 */

import {desktopApp} from './shell'

interface SystemBindings {
    SystemInfo(): Promise<string>
}

const bindings = (): SystemBindings | undefined =>
    desktopApp<SystemBindings>()

export async function systemName(): Promise<string | null> {
    try {
        return (await bindings()?.SystemInfo()) || null
    } catch {
        return null
    }
}
