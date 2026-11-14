import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {useEditorStore} from '../store/editor-store'
import {Toast} from './Toast'
import {fakeDesktop} from '../platform/shell'

const app = {ShowFolder: vi.fn(async (folder: string) => folder)}

afterEach(() => {
    cleanup()
    fakeDesktop()
    app.ShowFolder.mockReset()
    useEditorStore.setState({toast: null})
})

describe('Show the files', () => {
    it('appears on a message about files, in the desktop app', () => {
        fakeDesktop(app)
        useEditorStore.getState().notify('Exported 4 files', 'C:/Games/props/Oak')
        render(<Toast />)

        fireEvent.click(screen.getByRole('button', {name: 'Show the files'}))

        expect(app.ShowFolder).toHaveBeenCalledWith('C:/Games/props/Oak')
    })

    it('does not appear on a message without a folder', () => {
        fakeDesktop(app)
        useEditorStore.getState().notify('Saved "Oak"')
        render(<Toast />)

        expect(screen.queryByRole('button', {name: 'Show the files'})).toBeNull()
    })

    it('does not appear in the browser, which has no folders', () => {
        useEditorStore.getState().notify('Exported 4 files', 'Downloads')
        render(<Toast />)

        expect(screen.queryByRole('button', {name: 'Show the files'})).toBeNull()
    })

    it('says so when the folder cannot be opened', async () => {
        fakeDesktop(app)
        app.ShowFolder.mockRejectedValue(new Error('easy-props: not a folder'))
        useEditorStore.getState().notify('Exported 4 files', 'C:/Games/props/Oak')
        render(<Toast />)

        fireEvent.click(screen.getByRole('button', {name: 'Show the files'}))

        await waitFor(() =>
            expect(screen.getByText("Couldn't open the folder. It may have been moved or removed.")).toBeInTheDocument(),
        )
    })
})
