import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {useUiStore} from '../store/ui-store'
import {CHECK_FAILED, DOWNLOAD_FAILED, GITHUB_BUSY, useUpdateStore} from '../store/update-store'
import {SettingsDialog} from './SettingsDialog'
import {fakeDesktop} from '../platform/shell'

const offered = {available: true, version: '9.0.0', releaseUrl: 'https://example.test/release', canInstall: true}

const app = {
    CheckForUpdate: vi.fn(),
    DownloadUpdate: vi.fn(),
    InstallUpdateOnClose: vi.fn(),
    CancelUpdateInstall: vi.fn(),
    QuitApp: vi.fn(),
}

const shell = {
    BrowserOpenURL: vi.fn(),
    EventsOn: vi.fn<(name: string, callback: (fraction: number) => void) => () => void>(() => () => {}),
}

const press = (name: string) =>
    act(async () => {
        fireEvent.click(screen.getByRole('button', {name}))
    })

beforeEach(() => {
    vi.resetAllMocks()
    shell.EventsOn.mockReturnValue(() => {})
    fakeDesktop(app, shell)
    useUpdateStore.setState({update: {phase: 'idle'}})
    useUiStore.getState().openSettings('About')
})

afterEach(() => {
    cleanup()
    useUiStore.getState().closeSettings()
    fakeDesktop()
})

describe('checking for updates', () => {
    it('is not offered in a plain browser', () => {
        fakeDesktop()
        render(<SettingsDialog />)

        expect(screen.queryByRole('button', {name: 'Check for updates'})).toBeNull()
    })

    it('says so when this is the latest version', async () => {
        app.CheckForUpdate.mockResolvedValue({...offered, available: false})
        render(<SettingsDialog />)

        await press('Check for updates')

        expect(screen.getByText('You have the latest version.')).toBeTruthy()
    })

    it('explains what to try when GitHub cannot be reached', async () => {
        app.CheckForUpdate.mockRejectedValue(new Error('offline'))
        render(<SettingsDialog />)

        await press('Check for updates')

        expect(screen.getByText(CHECK_FAILED)).toBeTruthy()
        expect(screen.getByRole('button', {name: 'Try again'})).toBeTruthy()
    })

    it('says when GitHub is turning checks away, and still offers the download page', async () => {
        app.CheckForUpdate.mockRejectedValue(new Error('easy-props: GitHub is limiting requests from this address'))
        render(<SettingsDialog />)

        await press('Check for updates')

        expect(screen.getByText(GITHUB_BUSY)).toBeTruthy()

        await press('Open download page')

        expect(shell.BrowserOpenURL).toHaveBeenCalledWith('https://github.com/AHS12/easy-props/releases/latest')
    })

    it('sends a copy that cannot install itself to the download page', async () => {
        app.CheckForUpdate.mockResolvedValue({...offered, canInstall: false})
        render(<SettingsDialog />)

        await press('Check for updates')
        await press('Open download page')

        expect(shell.BrowserOpenURL).toHaveBeenCalledWith(offered.releaseUrl)
        expect(app.DownloadUpdate).not.toHaveBeenCalled()
    })

    it('tells a Mac copy run from the disk image how to get updates by itself', async () => {
        app.CheckForUpdate.mockResolvedValue({...offered, canInstall: false, manualReason: 'move-to-applications'})
        render(<SettingsDialog />)

        await press('Check for updates')

        expect(screen.getByText(/drag it into your Applications folder/)).toBeTruthy()
        expect(screen.getByRole('button', {name: 'Open download page'})).toBeTruthy()
    })
})

describe('installing an update', () => {
    it('shows progress while it downloads', async () => {
        let finish = () => {}
        app.CheckForUpdate.mockResolvedValue(offered)
        app.DownloadUpdate.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
        render(<SettingsDialog />)

        await press('Check for updates')
        await press('Download update')

        const report = shell.EventsOn.mock.calls[0][1]

        await act(async () => report(0.42))

        expect(screen.getByText('Downloading version 9.0.0: 42%')).toBeTruthy()

        await act(async () => finish())

        expect(screen.getByRole('button', {name: 'Restart to update'})).toBeTruthy()
    })

    it('explains what to try when the download fails', async () => {
        app.CheckForUpdate.mockResolvedValue(offered)
        app.DownloadUpdate.mockRejectedValue(new Error('bad checksum'))
        render(<SettingsDialog />)

        await press('Check for updates')
        await press('Download update')

        expect(screen.getByText(DOWNLOAD_FAILED)).toBeTruthy()
    })

    it('arranges the install before quitting, so the close guard still asks first', async () => {
        app.CheckForUpdate.mockResolvedValue(offered)
        render(<SettingsDialog />)

        await press('Check for updates')
        await press('Download update')
        await press('Restart to update')

        expect(app.InstallUpdateOnClose).toHaveBeenCalledOnce()
        expect(app.QuitApp).toHaveBeenCalledOnce()
        expect(app.InstallUpdateOnClose.mock.invocationCallOrder[0]).toBeLessThan(app.QuitApp.mock.invocationCallOrder[0])
    })

    it('stays open when the install cannot be arranged', async () => {
        app.CheckForUpdate.mockResolvedValue(offered)
        app.InstallUpdateOnClose.mockRejectedValue(new Error('not installed'))
        render(<SettingsDialog />)

        await press('Check for updates')
        await press('Download update')
        await press('Restart to update')

        expect(app.QuitApp).not.toHaveBeenCalled()
    })
})
