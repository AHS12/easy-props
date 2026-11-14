import {act, cleanup, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {useSettingsStore} from '../store/settings-store'
import {useUiStore} from '../store/ui-store'
import {SettingsDialog} from './SettingsDialog'

beforeEach(() => {
    useUiStore.getState().openSettings('General')
})

afterEach(() => {
    cleanup()
    useUiStore.getState().closeSettings()
    useSettingsStore.getState().resetPage('General')
})

describe('a choice with its own help', () => {
    it('explains the choice that is made, and changes with it', () => {
        render(<SettingsDialog />)

        expect(screen.getByText(/Closing the window quits easy-props/)).toBeTruthy()
        expect(screen.getByText(/Minimising puts the window on the taskbar/)).toBeTruthy()

        act(() => {
            useSettingsStore.getState().setValue('closeButton', 'tray')
            useSettingsStore.getState().setValue('minimiseButton', 'tray')
        })

        expect(screen.getByText(/Closing the window hides it/)).toBeTruthy()
        expect(screen.getByText(/Minimising hides the window/)).toBeTruthy()
        expect(screen.queryByText(/Closing the window quits easy-props/)).toBeNull()
    })
})
