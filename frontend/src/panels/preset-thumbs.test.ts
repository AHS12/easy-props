import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {beforeEach, describe, expect, it} from 'vitest'
import {treePresets} from '../assets/trees/presets'
import {presetFingerprint} from './preset-fingerprint'
import {forgetUnneededPictures, presetThumbnail} from './preset-thumbnails'
import shipped from './preset-thumbs.json'

const manifest: Record<string, string> = shipped

describe('the pictures shipped with the app', () => {
    it('has a picture for every preset and none left over', () => {
        for (const preset of treePresets) {
            expect(existsSync(resolve(__dirname, `../../public/preset-thumbs/${preset.id}.png`)), preset.id).toBe(true)
        }

        expect(Object.keys(manifest).sort()).toEqual(treePresets.map((preset) => preset.id).sort())
    })

    it('are up to date with their presets. If this fails, run make previews', () => {
        const stale = treePresets.filter((preset) => manifest[preset.id] !== presetFingerprint(preset.id))

        expect(stale.map((preset) => preset.id)).toEqual([])
    }, 60000)

    it('are used without drawing anything', () => {
        expect(presetThumbnail('blossom-tree')).toMatch(/preset-thumbs\/blossom-tree\.png$/)
    })
})

describe('tidying saved pictures', () => {
    beforeEach(() => localStorage.clear())

    it('forgets old versions and shipped presets, and leaves the rest', () => {
        localStorage.setItem('easy-props.preset-thumb.9.old-tree', 'x')
        localStorage.setItem('easy-props.preset-thumb.10.blossom-tree', 'x')
        localStorage.setItem('easy-props.preset-thumb.10.not-shipped-yet', 'x')
        localStorage.setItem('easy-props.export', 'x')

        forgetUnneededPictures()

        expect(Object.keys(localStorage).sort()).toEqual(['easy-props.export', 'easy-props.preset-thumb.10.not-shipped-yet'])
    })
})
