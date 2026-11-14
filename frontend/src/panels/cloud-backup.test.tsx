import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DEFAULT_CLOUD_BACKUP} from '../core/settings/settings-spec'
import {CLOUD_WRONG_KEYS, useBackupStore} from '../store/backup-store'
import {useEditorStore} from '../store/editor-store'
import {useSettingsStore} from '../store/settings-store'
import {CloudSetupDialog} from './CloudSetupDialog'
import {RestoreDialog} from './RestoreDialog'
import {fakeDesktop} from '../platform/shell'

let app: Record<string, ReturnType<typeof vi.fn>>
let keys = {saved: false, accessKey: ''}

beforeEach(() => {
    keys = {saved: false, accessKey: ''}
    app = {
        CloudKeys: vi.fn(async () => keys),
        SetCloudKeys: vi.fn(async (accessKey: string) => {
            keys = {saved: true, accessKey}
        }),
        ForgetCloudKeys: vi.fn(async () => undefined),
        LibraryFingerprint: vi.fn(async () => 'props'),
        SetBackupDue: vi.fn(async () => undefined),
        CheckCloudBackup: vi.fn(async () => undefined),
        BackUpToCloud: vi.fn(async () => ({props: 23, uploaded: 2, changedElsewhere: 0, removed: 0})),
        OpenCloudBackup: vi.fn(async () => ({
            app: '0.4.0',
            madeAt: '2026-11-04T10:00:00Z',
            palettes: '',
            props: [
                {id: 'oak', savedAt: '2026-11-01T10:00:00Z', size: 1, hasPicture: false, status: 'new'},
                {id: 'gone', savedAt: '2026-10-01T10:00:00Z', size: 1, hasPicture: false, status: 'removed'},
            ],
        })),
        ReadHeldProp: vi.fn(async (id: string) => [...new TextEncoder().encode(JSON.stringify({name: id === 'oak' ? 'Old oak' : 'Gone pine', scene: {assets: [{}]}}))]),
        RestoreFromHolding: vi.fn(async (choices: unknown[]) => choices.length),
        ClearHolding: vi.fn(async () => undefined),
        ListProps: vi.fn(async () => []),
        ReadPropsIndex: vi.fn(async () => null),
        WritePropsIndex: vi.fn(async () => undefined),
        WriteSettings: vi.fn(async () => undefined),
    }
    fakeDesktop(app)
    useBackupStore.setState({phase: 'idle', progress: null, restoring: null, cloudSetupOpen: false, cloudProblem: null})
    useEditorStore.setState({toast: null, gallery: []})
    useSettingsStore.setState({cloudBackup: DEFAULT_CLOUD_BACKUP, palettes: []})
})

afterEach(() => {
    cleanup()
    fakeDesktop()
})

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), {target: {value}})

async function fillTheForm() {
    useBackupStore.getState().openCloudSetup()
    render(<CloudSetupDialog />)
    await screen.findByRole('dialog')

    type('Endpoint', 'https://ABC.r2.cloudflarestorage.com/my-bucket/')
    fireEvent.blur(screen.getByLabelText('Endpoint'))
    type('Access key', 'id-123')
    type('Secret key', 'very secret')
}

describe('setting up cloud backup', () => {
    it('tidies a pasted address and fills the bucket from it', async () => {
        await fillTheForm()

        expect(screen.getByLabelText('Endpoint')).toHaveValue('abc.r2.cloudflarestorage.com')
        expect(screen.getByLabelText('Bucket')).toHaveValue('my-bucket')
    })

    it('saves the keys, checks exactly what is on screen, and keeps no secret in the settings', async () => {
        await fillTheForm()

        fireEvent.click(screen.getByRole('button', {name: 'Check the connection'}))

        await screen.findByText(/Connected\. easy-props can read and write in my-bucket\/easy-props\//)
        expect(app.SetCloudKeys).toHaveBeenCalledWith('id-123', 'very secret')
        expect(app.CheckCloudBackup).toHaveBeenCalledWith({
            service: 'r2',
            endpoint: 'abc.r2.cloudflarestorage.com',
            region: 'auto',
            bucket: 'my-bucket',
            folder: 'easy-props',
            pathStyle: true,
        })

        fireEvent.click(screen.getByRole('button', {name: 'Use this storage'}))

        const saved = useSettingsStore.getState().cloudBackup

        expect(saved).toMatchObject({service: 'r2', endpoint: 'abc.r2.cloudflarestorage.com', bucket: 'my-bucket'})
        expect(JSON.stringify(saved)).not.toContain('very secret')
        expect(useBackupStore.getState().cloudSetupOpen).toBe(false)
    })

    it('says plainly when the keys are wrong, and saves nothing', async () => {
        app.CheckCloudBackup.mockRejectedValue(new Error("easy-props: cloud: the storage didn't accept these keys: 403"))
        await fillTheForm()

        fireEvent.click(screen.getByRole('button', {name: 'Check the connection'}))

        expect(await screen.findByRole('alert')).toHaveTextContent(CLOUD_WRONG_KEYS)
        expect(screen.queryByRole('button', {name: 'Use this storage'})).toBeNull()
        expect(useSettingsStore.getState().cloudBackup.service).toBe('')
    })

    it('names the bucket when there is no such bucket', async () => {
        app.CheckCloudBackup.mockRejectedValue(new Error('easy-props: cloud: there is no such bucket: 404'))
        await fillTheForm()

        fireEvent.click(screen.getByRole('button', {name: 'Check the connection'}))

        expect(await screen.findByRole('alert')).toHaveTextContent("There's no bucket called my-bucket at this address.")
    })

    it('shows a saved secret as dots, and keeps it when only the access key changes', async () => {
        keys = {saved: true, accessKey: 'id-old'}
        useSettingsStore.setState({cloudBackup: {...DEFAULT_CLOUD_BACKUP, service: 'r2', endpoint: 'abc.r2.cloudflarestorage.com', bucket: 'b'}})
        useBackupStore.getState().openCloudSetup()
        render(<CloudSetupDialog />)

        await waitFor(() => expect(screen.getByLabelText('Access key')).toHaveValue('id-old'))
        expect(screen.getByText('••••••••')).toBeInTheDocument()

        type('Access key', 'id-new')
        fireEvent.click(screen.getByRole('button', {name: 'Check the connection'}))

        await waitFor(() => expect(app.SetCloudKeys).toHaveBeenCalledWith('id-new', ''))
    })
})

describe('backing up to the cloud', () => {
    beforeEach(() => {
        useSettingsStore.setState({cloudBackup: {...DEFAULT_CLOUD_BACKUP, service: 'r2', endpoint: 'abc.r2.cloudflarestorage.com', bucket: 'b'}})
    })

    it('says how many props are backed up, and remembers when', async () => {
        await useBackupStore.getState().backUpToCloudNow()

        expect(useEditorStore.getState().toast?.message).toBe('Backed up 23 props to the cloud')
        expect(useSettingsStore.getState().cloudBackup.lastAt).not.toBe('')
    })

    it('says when props were left as another computer saved them', async () => {
        app.BackUpToCloud.mockResolvedValue({props: 23, uploaded: 0, changedElsewhere: 1, removed: 0})

        await useBackupStore.getState().backUpToCloudNow()

        expect(useEditorStore.getState().toast?.message).toBe(
            'Backed up 23 props to the cloud. 1 prop was changed on another computer and was left as it is there',
        )
    })

    it('keeps saying what went wrong in Settings', async () => {
        app.BackUpToCloud.mockRejectedValue(new Error("easy-props: cloud: couldn't reach the storage: dial tcp"))

        await useBackupStore.getState().backUpToCloudNow()

        expect(useBackupStore.getState().cloudProblem).toBe(
            "easy-props couldn't reach abc.r2.cloudflarestorage.com. Check the address and your internet connection.",
        )
    })

    it('shows props removed since, unticked, when restoring from the cloud', async () => {
        render(<RestoreDialog />)
        await useBackupStore.getState().openCloudRestore()

        const removed = await screen.findByRole('region', {name: 'Removed since'})

        expect(within(removed).getByRole('checkbox', {name: 'Gone pine'})).toHaveAttribute('aria-checked', 'false')
        expect(screen.getByRole('checkbox', {name: 'Old oak'})).toHaveAttribute('aria-checked', 'true')

        fireEvent.click(within(removed).getByRole('checkbox', {name: 'Gone pine'}))
        fireEvent.click(screen.getByRole('button', {name: 'Restore 2 props'}))

        await waitFor(() =>
            expect(app.RestoreFromHolding).toHaveBeenCalledWith([
                {id: 'oak', copyId: '', copyContents: ''},
                {id: 'gone', copyId: '', copyContents: ''},
            ]),
        )
    })

    it('turning it off forgets the keys and leaves the bucket alone', async () => {
        await useBackupStore.getState().turnOffCloud()

        expect(app.ForgetCloudKeys).toHaveBeenCalled()
        expect(useSettingsStore.getState().cloudBackup.service).toBe('')
    })
})
