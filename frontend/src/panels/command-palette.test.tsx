import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, beforeAll, describe, expect, it} from 'vitest'
import {useEditorStore} from '../store/editor-store'
import {useUiStore} from '../store/ui-store'
import {CommandPalette} from './CommandPalette'

beforeAll(() => {
    // The test page has no layout, so it has nothing to scroll.
    Element.prototype.scrollIntoView = () => undefined
})

afterEach(() => {
    cleanup()
    useUiStore.setState({paletteOpen: false})
    useEditorStore.setState({page: 'gallery'})
})

describe('the empty palette', () => {
    it('suggests ways to get a prop on Home, instead of saying nothing matches', () => {
        useEditorStore.setState({page: 'gallery'})
        useUiStore.setState({paletteOpen: true})
        render(<CommandPalette />)

        expect(screen.getByRole('option', {name: /New tree/})).toBeInTheDocument()
        expect(screen.getByRole('option', {name: /Open a file/})).toBeInTheDocument()
        expect(screen.queryByText('Nothing matches that. Try a shorter word.')).toBeNull()
    })

    it('suggests working on the prop in the editor', () => {
        useEditorStore.setState({page: 'editor'})
        useUiStore.setState({paletteOpen: true})
        render(<CommandPalette />)

        expect(screen.getByRole('option', {name: /Export/})).toBeInTheDocument()
    })
})
