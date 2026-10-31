import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {PropertyRow} from './PropertyRow'

afterEach(cleanup)

const setup = (props: Partial<Parameters<typeof PropertyRow>[0]> = {}) => {
    const onChange = vi.fn()

    render(<PropertyRow label="Height" value={8} min={2} max={20} step={0.1} unit="m" onChange={onChange} {...props} />)

    return {onChange, input: screen.getByRole('textbox', {name: 'Height value'})}
}

describe('a property row', () => {
    it('takes a typed value on Enter', async () => {
        const {onChange, input} = setup()

        await userEvent.click(input)
        await userEvent.clear(input)
        await userEvent.type(input, '12.5{Enter}')

        expect(onChange).toHaveBeenCalledWith(12.5)
    })

    it('holds a typed value to the range, and says so', async () => {
        const {onChange, input} = setup()

        await userEvent.click(input)
        await userEvent.clear(input)
        await userEvent.type(input, '500{Enter}')

        expect(onChange).toHaveBeenCalledWith(20)
        expect(screen.getByRole('status')).toHaveTextContent('Kept to 2.0–20.0 m')
    })

    it('ignores what is not a number', async () => {
        const {onChange, input} = setup()

        await userEvent.click(input)
        await userEvent.clear(input)
        await userEvent.type(input, 'tall{Enter}')

        expect(onChange).not.toHaveBeenCalled()
    })

    it('offers a reset only when changed, and it resets this one control', async () => {
        const {onChange} = setup({resetTo: 6})

        await userEvent.click(screen.getByRole('button', {name: 'Reset Height'}))

        expect(onChange).toHaveBeenCalledWith(6)

        cleanup()
        setup({resetTo: 8})

        expect(screen.queryByRole('button', {name: 'Reset Height'})).not.toBeInTheDocument()
    })

    it('exposes the slider by role', () => {
        setup()

        expect(screen.getByRole('slider', {name: 'Height'})).toBeInTheDocument()
    })
})
