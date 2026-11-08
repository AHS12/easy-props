import {describe, expect, it} from 'vitest'
import {familyOfProp, presetGroups, PROP_FAMILIES} from '../assets/trees/presets'
import {COMMANDS} from '../core/commands/commands'

describe('kinds of prop', () => {
    it('gives every kind its own presets, so none hides under another', () => {
        for (const {id} of PROP_FAMILIES) {
            expect(presetGroups.filter((group) => group.family === id).flatMap((group) => group.presets).length, id).toBeGreaterThan(0)
        }
    })

    it('starts each kind from the menu with a preset of that kind', () => {
        for (const {id} of PROP_FAMILIES) {
            expect(COMMANDS.some((command) => command.id === `new-${id}`), id).toBe(true)
        }
    })

    it('knows the kind of a prop saved without a preset from the generator that made it', () => {
        expect(familyOfProp(null, 'cactus')).toBe('cactus')
        expect(familyOfProp(null, 'plant')).toBe('flower')
        expect(familyOfProp(null, 'grass')).toBe('grass')
        expect(familyOfProp(null, 'bush')).toBe('bush')
        expect(familyOfProp(null, 'cut-rock')).toBe('rock')
    })
})
