import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {useEditorStore} from '../store/editor-store'
import {useSettingsStore} from '../store/settings-store'
import {useUiStore} from '../store/ui-store'
import {AUTOMATIC_CHECK_EVERY_MS, checkForUpdatesIfDue, useUpdateStore} from '../store/update-store'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 2)
const offered = {available: true, version: '9.0.0', releaseUrl: 'https://example.test/release', canInstall: true}
const app = {CheckForUpdate: vi.fn()}

/** Lets the check's promise settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function lastCheckedDaysAgo(days: number) {
    useSettingsStore.setState({lastUpdateCheck: NOW - days * DAY, values: {...useSettingsStore.getState().values, checkUpdates: true}})
}

beforeEach(() => {
    vi.resetAllMocks()
    Object.assign(window, {go: {backend: {App: app}}})
    useUpdateStore.setState({update: {phase: 'idle'}})
    useEditorStore.setState({toast: null})
    app.CheckForUpdate.mockResolvedValue(offered)
})

afterEach(() => {
    Object.assign(window, {go: undefined})
    useUiStore.getState().closeSettings()
})

describe('the weekly update check', () => {
    it('checks once a week has passed', async () => {
        lastCheckedDaysAgo(7)
        checkForUpdatesIfDue(NOW)
        await settle()

        expect(app.CheckForUpdate).toHaveBeenCalledOnce()
    })

    it('does not check again within the week', () => {
        lastCheckedDaysAgo(6)
        checkForUpdatesIfDue(NOW)

        expect(app.CheckForUpdate).not.toHaveBeenCalled()
        expect(AUTOMATIC_CHECK_EVERY_MS).toBe(7 * DAY)
    })

    it('does not check when the setting is off', () => {
        lastCheckedDaysAgo(30)
        useSettingsStore.setState({values: {...useSettingsStore.getState().values, checkUpdates: false}})
        checkForUpdatesIfDue(NOW)

        expect(app.CheckForUpdate).not.toHaveBeenCalled()
    })

    it('does not check in a browser', () => {
        lastCheckedDaysAgo(30)
        Object.assign(window, {go: undefined})
        checkForUpdatesIfDue(NOW)

        expect(app.CheckForUpdate).not.toHaveBeenCalled()
    })

    it('says once that a new version is out, with a way to see it', async () => {
        lastCheckedDaysAgo(7)
        checkForUpdatesIfDue(NOW)
        await settle()

        const toast = useEditorStore.getState().toast

        expect(toast?.message).toBe('Version 9.0.0 is out')
        expect(toast?.action?.label).toBe("See what's new")

        toast?.action?.run()

        expect(useUiStore.getState().settingsPage).toBe('About')
        expect(useUpdateStore.getState().update.phase).toBe('available')
    })

    it('says nothing when there is no new version', async () => {
        app.CheckForUpdate.mockResolvedValue({...offered, available: false})
        lastCheckedDaysAgo(7)
        checkForUpdatesIfDue(NOW)
        await settle()

        expect(useEditorStore.getState().toast).toBeNull()
    })

    it('stays quiet when it fails, and tries again next time', async () => {
        app.CheckForUpdate.mockRejectedValue(new Error('offline'))
        lastCheckedDaysAgo(7)
        checkForUpdatesIfDue(NOW)
        await settle()

        expect(useEditorStore.getState().toast).toBeNull()
        expect(useUpdateStore.getState().update.phase).toBe('idle')
        expect(useSettingsStore.getState().lastUpdateCheck).toBe(NOW - 7 * DAY)
    })

    it('counts a check someone asked for', async () => {
        lastCheckedDaysAgo(30)
        await useUpdateStore.getState().check()

        expect(Date.now() - useSettingsStore.getState().lastUpdateCheck).toBeLessThan(DAY)
        expect(useEditorStore.getState().toast).toBeNull()
    })
})
