/**
 * App updates, from the frontend's side. Go talks to GitHub and starts the installer,
 * so that nothing here can name a file to run.
 */

import {desktopApp, desktopRuntime} from './shell'

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

const bindings = () =>
    desktopApp<UpdateBindings>()

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
    return desktopRuntime()?.EventsOn(PROGRESS_EVENT, handler) ?? (() => {})
}
