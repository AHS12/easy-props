/**
 * Where an update has got to. It lives outside the settings window so that a download
 * carries on, and is still shown, after the window is closed and opened again.
 */

import {create} from 'zustand'
import {APP_VERSION} from '../core/export/export-preferences'
import {checkForUpdate, downloadUpdate, installUpdateOnClose, onUpdateProgress} from '../platform/update'
import {closeWindow} from '../platform/window'

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

interface UpdateStore {
    update: UpdateState
    check(): Promise<void>
    download(): Promise<void>
    restart(): Promise<void>
}

export const useUpdateStore = create<UpdateStore>((set, get) => ({
    update: {phase: 'idle'},

    check: async () => {
        if (get().update.phase === 'checking' || get().update.phase === 'downloading') {
            return
        }

        set({update: {phase: 'checking'}})

        try {
            const info = await checkForUpdate(APP_VERSION)

            if (!info.available) {
                set({update: {phase: 'current'}})
            } else if (info.canInstall) {
                set({update: {phase: 'available', version: info.version}})
            } else {
                set({update: {phase: 'manual', version: info.version, releaseUrl: info.releaseUrl}})
            }
        } catch {
            set({update: {phase: 'failed', message: CHECK_FAILED}})
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
