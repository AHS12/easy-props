import {describe, expect, it} from 'vitest'
import {findCommand} from '../core/commands/commands'
import {bytesOfDataUrl, folderOf, pictureFileName} from '../core/export/picture'
import {useUiStore} from '../store/ui-store'

describe('saving a picture', () => {
    it('names the file after the prop', () => {
        expect(pictureFileName('Red maple')).toBe('Red maple.png')
    })

    it('leaves out what no system allows in a file name', () => {
        expect(pictureFileName('Oak: big/old?')).toBe('Oak big old.png')
        expect(pictureFileName('..hidden')).toBe('hidden.png')
    })

    it('gives a plain name when nothing of the prop’s is left', () => {
        expect(pictureFileName('  ')).toBe('Prop picture.png')
        expect(pictureFileName('???')).toBe('Prop picture.png')
    })

    it('turns the drawing into the PNG’s own bytes', () => {
        const bytes = bytesOfDataUrl('data:image/png;base64,iVBORw0KGgo=')

        expect([...bytes]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    })

    it('knows the folder a picture went to, on any system', () => {
        expect(folderOf('C:\\Users\\me\\Pictures\\Oak.png')).toBe('C:\\Users\\me\\Pictures')
        expect(folderOf('/home/me/Oak.png')).toBe('/home/me')
        expect(folderOf('Oak.png')).toBeUndefined()
    })

    it('opens from the File menu and the palette', () => {
        useUiStore.setState({pictureOpen: false})
        findCommand('save-picture')!.run(undefined as never)

        expect(useUiStore.getState().pictureOpen).toBe(true)
    })
})
