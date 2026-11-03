import {cleanup, fireEvent, render, screen, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {useSettingsStore} from '../store/settings-store'
import {PalettesPage} from './PalettesPage'

const GAME = ['#112233', '#445566', '#778899', '#aabbcc', '#ddeeff']

beforeEach(() => useSettingsStore.setState({palettes: []}))
afterEach(cleanup)

describe('the Palettes page in Settings', () => {
    it('offers a new palette for every kind, even with none saved', () => {
        render(<PalettesPage />)

        for (const kind of ['Trees', 'Rocks', 'Bush leaves', 'Grass', 'Flowers', 'Cacti']) {
            expect(within(screen.getByRole('region', {name: kind})).getByRole('button', {name: 'New palette'})).toBeInTheDocument()
        }
    })

    it('makes a new palette from the usual colours of its kind, with a name of its own', async () => {
        render(<PalettesPage />)

        const trees = screen.getByRole('region', {name: 'Trees'})

        await userEvent.click(within(trees).getByRole('button', {name: 'New palette'}))
        await userEvent.click(within(trees).getByRole('button', {name: 'New palette'}))

        const {palettes} = useSettingsStore.getState()

        expect(palettes.map((palette) => palette.name)).toEqual(['New palette', 'New palette 2'])
        expect(palettes[0].set).toBe('tree')
        expect(palettes[0].colours).toHaveLength(5)
        // The newest is ready to be named.
        expect(screen.getByRole('textbox', {name: 'Name of New palette 2'})).toHaveFocus()
    })

    it('duplicates a palette, colours and all', async () => {
        useSettingsStore.getState().savePalette('Our game', 'tree', GAME)
        render(<PalettesPage />)

        await userEvent.click(screen.getByRole('button', {name: 'Duplicate Our game'}))

        const copy = useSettingsStore.getState().palettes[1]

        expect(copy.name).toBe('Our game copy')
        expect(copy.colours).toEqual(GAME)
    })

    it('takes a colour code pasted onto one of its colours', () => {
        useSettingsStore.getState().savePalette('Our game', 'tree', GAME)
        render(<PalettesPage />)

        fireEvent.paste(screen.getByRole('button', {name: 'Our game, Bark shadow: pick any colour'}), {
            clipboardData: {getData: () => '#3A7'},
        })

        expect(useSettingsStore.getState().palettes[0].colours[0]).toBe('#33aa77')
    })

    it('lists palettes under their kind of prop', () => {
        useSettingsStore.getState().savePalette('Our forest game', 'tree', GAME)
        useSettingsStore.getState().savePalette('Desert stone', 'stone', GAME.slice(0, 4))
        render(<PalettesPage />)

        expect(screen.getByRole('region', {name: 'Trees'})).toBeInTheDocument()
        expect(screen.getByRole('textbox', {name: 'Name of Our forest game'})).toBeInTheDocument()
        expect(screen.getByRole('region', {name: 'Rocks'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Our forest game, Leaf middle: pick any colour'})).toBeInTheDocument()
    })

    it('renames a palette', async () => {
        useSettingsStore.getState().savePalette('Old name', 'tree', GAME)
        render(<PalettesPage />)

        const field = screen.getByRole('textbox', {name: 'Name of Old name'})

        await userEvent.clear(field)
        await userEvent.type(field, 'New name{Enter}')

        expect(useSettingsStore.getState().palettes[0].name).toBe('New name')
    })

    it('removes a palette only once asked twice', async () => {
        useSettingsStore.getState().savePalette('Gone soon', 'tree', GAME)
        render(<PalettesPage />)

        await userEvent.click(screen.getByRole('button', {name: 'Remove Gone soon'}))
        expect(useSettingsStore.getState().palettes).toHaveLength(1)

        await userEvent.click(screen.getByRole('button', {name: 'Remove'}))
        expect(useSettingsStore.getState().palettes).toHaveLength(0)
    })
})
