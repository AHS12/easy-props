import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {ColourRow} from './ColourRow'

afterEach(cleanup)

const PRESETS = [
    {name: 'Moss', value: '#4e7d3e'},
    {name: 'Bark', value: '#6b4e35'},
]

const setup = () => {
    const onChange = vi.fn()

    render(<ColourRow label="Leaves" value="#4e7d3e" presets={PRESETS} onChange={onChange} />)

    return {onChange, row: screen.getByRole('group', {name: 'Leaves'})}
}

const paste = (target: Element, text: string) =>
    fireEvent.paste(target, {clipboardData: {getData: () => text}})

describe('a colour row', () => {
    it('uses a colour code pasted on it', () => {
        const {onChange} = setup()

        paste(screen.getByRole('button', {name: 'Bark'}), ' #3A7 ')

        expect(onChange).toHaveBeenCalledWith('#33aa77')
    })

    it('ignores pasted text that is not a colour', () => {
        const {onChange, row} = setup()

        paste(row, 'hello')

        expect(onChange).not.toHaveBeenCalled()
    })

    it('opens its own picker, not the system one', () => {
        setup()

        expect(document.querySelector('input[type="color"]')).toBeNull()
        expect(screen.getByRole('button', {name: 'Leaves: pick any colour'})).toBeInTheDocument()
    })
})
