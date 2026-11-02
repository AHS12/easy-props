/**
 * Where an update has got to. It lives outside the settings window so that a download
 * carries on, and is still shown, after the window is closed and opened again.
 */

import {create} from 'zustand'
import {APP_VERSION} from '../core/export/export-preferences'
import {canCheckForUpdates, checkForUpdate, downloadUpdate, installUpdateOnClose, onUpdateProgress} from '../platform/update'
import {closeWindow} from '../platform/window'
import {useEditorStore} from './editor-store'
import {useSettingsStore} from './settings-store'
import {useUiStore} from './ui-store'

export type UpdateState =
    | {readonly phase: 'idle'}
    | {readonly phase: 'checking'}
    | {readonly phase: 'current'}
    | {readonly phase: 'manual'; readonly version: string; readonly releaseUrl: string}
    | {readonly phase: 'available'; readonly version: string}
    | {readonly phase: 'downloading'; readonly version: string; readonly fraction: number}
    | {readonly phase: 'ready'; readonly version: string}
    | {readonly phase: 'failed'; readonly message: string}

export const CHECK_FAILED = "Couldn't check for updates. Check your internet connection, or try again in a little while."
export const DOWNLOAD_FAILED = "The update didn't finish downloading. Check your internet connection and try again."
export const INSTALL_FAILED = "The update couldn't start. Try checking for updates again."

/** How long the app waits between checks of its own. */
export const AUTOMATIC_CHECK_EVERY_MS = 7 * 24 * 60 * 60 * 1000

interface UpdateStore {
    update: UpdateState
    /**
     * Looks for a newer version. A quiet check is one the app made itself: it never
     * says it failed, since someone may just be offline, and it says so when one is out.
     */
    check(options?: {quiet?: boolean}): Promise<void>
    download(): Promise<void>
    restart(): Promise<void>
}

export const useUpdateStore = create<UpdateStore>((set, get) => ({
    update: {phase: 'idle'},

    check: async ({quiet = false} = {}) => {
        const before = get().update

        if (before.phase === 'checking' || before.phase === 'downloading') {
            return
        }

        set({update: {phase: 'checking'}})

        try {
            const info = await checkForUpdate(APP_VERSION)

            // Any check that got an answer counts, so asking from Help also resets the week.
            useSettingsStore.getState().setLastUpdateCheck(Date.now())

            if (!info.available) {
                set({update: {phase: 'current'}})
                return
            }

            set({
                update: info.canInstall
                    ? {phase: 'available', version: info.version}
                    : {phase: 'manual', version: info.version, releaseUrl: info.releaseUrl},
            })

            if (quiet) {
                useEditorStore.getState().notify(`Version ${info.version} is out`, undefined, {
                    label: "See what's new",
                    run: () => useUiStore.getState().openSettings('About'),
                })
            }
        } catch {
            set({update: quiet ? before : {phase: 'failed', message: CHECK_FAILED}})
        }
    },

    download: async () => {
        const {update} = get()

        if (update.phase !== 'available') {
            return
        }

        const {version} = update

        set({update: {phase: 'downloading', version, fraction: 0}})

        const stopListening = onUpdateProgress((fraction) => set({update: {phase: 'downloading', version, fraction}}))

        try {
            await downloadUpdate()
            set({update: {phase: 'ready', version}})
        } catch {
            set({update: {phase: 'failed', message: DOWNLOAD_FAILED}})
        } finally {
            stopListening()
        }
    },

    restart: async () => {
        try {
            await installUpdateOnClose()
            closeWindow()
        } catch {
            set({update: {phase: 'failed', message: INSTALL_FAILED}})
        }
    },
}))

/**
 * Looks for an update when the app opens, if it's been a week and the setting allows.
 * Never in a browser, which has nothing to update.
 */
export function checkForUpdatesIfDue(now = Date.now()): void {
    const settings = useSettingsStore.getState()

    if (!canCheckForUpdates() || settings.values.checkUpdates !== true) {
        return
    }

    if (now - settings.lastUpdateCheck < AUTOMATIC_CHECK_EVERY_MS) {
        return
    }

    void useUpdateStore.getState().check({quiet: true})
}
