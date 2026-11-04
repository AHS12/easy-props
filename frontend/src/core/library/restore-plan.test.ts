import {describe, expect, it} from 'vitest'
import type {SavedPalette} from '../settings/settings-spec'
import {backupCopyName, mergePalettes, planRestore, renamedProp} from './restore-plan'

const ids = () => {
    let next = 0

    return () => `copy${++next}`
}

describe('restoring props', () => {
    const held = [
        {id: 'new', name: 'Birch', status: 'new' as const},
        {id: 'same', name: 'Pine', status: 'same' as const},
        {id: 'oak', name: 'Old oak', status: 'different' as const},
    ]
    const text = JSON.stringify({name: 'Old oak', preset: 'oak', extra: {kept: true}})

    it('brings in new props as they are, and skips props already here', () => {
        const choices = planRestore(held, new Set(['new', 'same']), [], () => text, ids())

        expect(choices).toEqual([{id: 'new', copyId: '', copyContents: ''}])
    })

    it('brings a prop that differs in as a second copy, renamed, keeping everything else', () => {
        const [choice] = planRestore(held, new Set(['oak']), ['Old oak'], () => text, ids())
        const copy = JSON.parse(choice.copyContents)

        expect(choice.copyId).toBe('copy1')
        expect(copy).toEqual({name: 'Old oak (from backup)', preset: 'oak', extra: {kept: true}})
    })

    it('leaves out props that are not ticked', () => {
        expect(planRestore(held, new Set(), [], () => text, ids())).toEqual([])
    })

    it('never gives two copies the same name', () => {
        const twins = [
            {id: 'a', name: 'Oak', status: 'different' as const},
            {id: 'b', name: 'Oak', status: 'different' as const},
        ]
        const names = planRestore(twins, new Set(['a', 'b']), ['Oak', 'Oak (from backup)'], () => '{"name":"Oak"}', ids()).map(
            (choice) => JSON.parse(choice.copyContents).name,
        )

        expect(names).toEqual(['Oak (from backup) 2', 'Oak (from backup) 3'])
    })

    it('names a copy plainly when nothing is in the way', () => {
        expect(backupCopyName('Fern', new Set())).toBe('Fern (from backup)')
        expect(renamedProp('{"name":"a","b":1}', 'c')).toBe('{\n  "name": "c",\n  "b": 1\n}\n')
    })
})

describe('restoring palettes', () => {
    const forest: SavedPalette = {id: 'p1', name: 'Forest', set: 'tree', colours: ['#112233', '#445566']}

    it('adds palettes with new names', () => {
        const desert = {id: 'p2', name: 'Desert', set: 'tree', colours: ['#aa8844']}
        const {palettes, added} = mergePalettes([forest], JSON.stringify([desert]), () => 'new')

        expect(added).toBe(1)
        expect(palettes.map((palette) => palette.name)).toEqual(['Forest', 'Desert'])
    })

    it('skips a palette with the same name and colours', () => {
        const {palettes, added} = mergePalettes([forest], JSON.stringify([{...forest, name: 'forest'}]), () => 'new')

        expect(added).toBe(0)
        expect(palettes).toEqual([forest])
    })

    it('keeps both when the same name has other colours', () => {
        const other = {...forest, colours: ['#000000']}
        const {palettes, added} = mergePalettes([forest], JSON.stringify([other]), () => 'p9')

        expect(added).toBe(1)
        expect(palettes[1]).toEqual({id: 'p9', name: 'Forest (from backup)', set: 'tree', colours: ['#000000']})
    })

    it('treats the same name for another kind as a different palette', () => {
        const rock = {...forest, id: 'p3', set: 'rock', colours: ['#000000']}

        expect(mergePalettes([forest], JSON.stringify([rock]), () => 'x').palettes[1].name).toBe('Forest')
    })

    it('adds nothing from a damaged palettes file', () => {
        expect(mergePalettes([forest], '{not json', () => 'x')).toEqual({palettes: [forest], added: 0})
        expect(mergePalettes([forest], JSON.stringify([{name: 'no colours'}]), () => 'x').added).toBe(0)
    })
})
