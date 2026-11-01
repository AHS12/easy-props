/**
 * App updates, from the frontend's side. Go talks to GitHub and starts the installer,
 * so that nothing here can name a file to run.
 */

/** Matches `UpdateProgressEvent` in backend/update.go. */
const PROGRESS_EVENT = 'app:update-progress'

export interface UpdateInfo {
    readonly available: boolean
    readonly version: string
    readonly releaseUrl: string
    readonly canInstall: boolean
}

interface UpdateBindings {
    CheckForUpdate(current: string): Promise<UpdateInfo>
    DownloadUpdate(): Promise<void>
    InstallUpdateOnClose(): Promise<void>
    CancelUpdateInstall(): Promise<void>
}

interface ProgressRuntime {
    EventsOn?(name: string, callback: (fraction: number) => void): (() => void) | undefined
}

const bindings = () =>
    typeof window === 'undefined' ? undefined : (window.go?.backend?.App as unknown as UpdateBindings | undefined)

/** A plain browser has nothing to update. */
export const canCheckForUpdates = () => bindings() !== undefined

export async function checkForUpdate(current: string): Promise<UpdateInfo> {
    const app = bindings()

    if (!app) {
        return {available: false, version: '', releaseUrl: '', canInstall: false}
    }

    return app.CheckForUpdate(current)
}

export const downloadUpdate = async () => bindings()?.DownloadUpdate()

export const installUpdateOnClose = async () => bindings()?.InstallUpdateOnClose()

export const cancelUpdateInstall = async () => bindings()?.CancelUpdateInstall()

/** Calls back as the download arrives, with a fraction from 0 to 1. */
export function onUpdateProgress(handler: (fraction: number) => void): () => void {
    const runtime = typeof window === 'undefined' ? undefined : (window.runtime as unknown as ProgressRuntime | undefined)

    return runtime?.EventsOn?.(PROGRESS_EVENT, handler) ?? (() => {})
}
