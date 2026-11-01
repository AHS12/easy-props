import {beforeEach, describe, expect, it, vi} from 'vitest'
import {renderTreeThumbnail} from '../core/export/tree-thumbnail'
import {presetThumbnailsDrawn, requestPresetThumbnail} from './preset-thumbnails'

vi.mock('../core/export/tree-thumbnail', () => ({renderTreeThumbnail: vi.fn()}))

const draw = vi.mocked(renderTreeThumbnail)

describe('waiting for preset pictures', () => {
    beforeEach(() => {
        draw.mockReset()
        draw.mockResolvedValue('data:image/png;base64,x')
    })

    it('has nothing to wait for when no pictures are asked for', async () => {
        await expect(presetThumbnailsDrawn()).resolves.toBeUndefined()
        expect(draw).not.toHaveBeenCalled()
    })

    it('waits until every picture asked for is drawn', async () => {
        const drawn: string[] = []

        requestPresetThumbnail('blossom-tree', () => drawn.push('blossom'))
        requestPresetThumbnail('spring-tree', () => drawn.push('spring'))

        await presetThumbnailsDrawn()

        expect(drawn).toEqual(['blossom', 'spring'])
    })

    it('does not wait forever on a picture that fails', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const drawn: string[] = []

        draw.mockRejectedValueOnce(new Error('no graphics card'))
        requestPresetThumbnail('blossom-tree', () => drawn.push('blossom'))
        requestPresetThumbnail('spring-tree', () => drawn.push('spring'))

        await presetThumbnailsDrawn()

        expect(drawn).toEqual(['spring'])
        warn.mockRestore()
    })

    it('stops waiting for a request that is withdrawn', async () => {
        const drawn: string[] = []
        const withdraw = requestPresetThumbnail('blossom-tree', () => drawn.push('blossom'))
        const withdrawSecond = requestPresetThumbnail('spring-tree', () => drawn.push('spring'))

        withdrawSecond()
        withdraw()

        await presetThumbnailsDrawn()

        expect(drawn).not.toContain('spring')
    })
})
