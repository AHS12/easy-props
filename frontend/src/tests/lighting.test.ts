import {describe, expect, it} from 'vitest'
import {
    DEFAULT_LIGHTING,
    TIME_OF_DAY,
    sunDialPosition,
    sunDialToAngles,
    sunDirection,
    type TimeOfDay,
} from '../assets/style/lighting'
import {darken, lighten, MATERIAL_COLORS} from '../assets/style/materials'
import {SHADING_MODES} from '../assets/style/shading'
import {materialColor} from '../viewport/scene/component-renderer'

describe('sun', () => {
    it('points straight up at noon', () => {
        const direction = sunDirection({...DEFAULT_LIGHTING, azimuth: 0, elevation: 90})

        expect(direction.x).toBeCloseTo(0, 5)
        expect(direction.y).toBeCloseTo(1, 5)
        expect(direction.z).toBeCloseTo(0, 5)
    })

    it('points along the horizon when the sun is down', () => {
        const direction = sunDirection({...DEFAULT_LIGHTING, azimuth: 0, elevation: 0})

        expect(direction.y).toBeCloseTo(0, 5)
        expect(direction.length()).toBeCloseTo(1, 5)
    })

    it('always returns a unit vector', () => {
        for (const preset of Object.values(TIME_OF_DAY)) {
            expect(sunDirection(preset).length()).toBeCloseTo(1, 5)
        }
    })

    it('keeps every time of day inside a sane range', () => {
        for (const preset of Object.values(TIME_OF_DAY)) {
            expect(preset.elevation).toBeGreaterThanOrEqual(0)
            expect(preset.elevation).toBeLessThanOrEqual(90)
            expect(preset.azimuth).toBeGreaterThanOrEqual(0)
            expect(preset.azimuth).toBeLessThanOrEqual(360)
            expect(preset.shadowStrength).toBeGreaterThanOrEqual(0)
            expect(preset.shadowStrength).toBeLessThanOrEqual(1)
        }
    })
})

describe('sun dial', () => {
    it('puts a high sun near the centre', () => {
        const high = sunDialPosition({...DEFAULT_LIGHTING, elevation: 90})
        const low = sunDialPosition({...DEFAULT_LIGHTING, elevation: 0})

        expect(Math.hypot(high.x, high.y)).toBeLessThan(Math.hypot(low.x, low.y))
    })

    it('round trips a position back to the same angles', () => {
        const lighting = {...DEFAULT_LIGHTING, azimuth: 200, elevation: 40}
        const position = sunDialPosition(lighting)
        const angles = sunDialToAngles(position.x, position.y)

        expect(angles.azimuth).toBeCloseTo(lighting.azimuth, 3)
        expect(angles.elevation).toBeCloseTo(lighting.elevation, 3)
    })

    it('never reads a position outside the dial', () => {
        const angles = sunDialToAngles(5, -5)

        expect(angles.elevation).toBeLessThanOrEqual(90)
        expect(angles.elevation).toBeGreaterThanOrEqual(0)
    })
})

describe('colours', () => {
    it('darkens a colour without changing its format', () => {
        expect(darken('#4e7d3e', 0.25)).toMatch(/^#[0-9a-f]{6}$/)
        expect(lighten('#4e7d3e', 0.25)).toMatch(/^#[0-9a-f]{6}$/)
    })

    it('makes a darker tone darker than the original', () => {
        const darker = darken('#4e7d3e', 0.25)

        expect(Number.parseInt(darker.slice(1), 16)).toBeLessThan(
            Number.parseInt('#4e7d3e'.slice(1), 16),
        )
    })

    it('makes a lighter tone lighter than the original', () => {
        const lighter = lighten('#4e7d3e', 0.25)

        expect(Number.parseInt(lighter.slice(1), 16)).toBeGreaterThan(
            Number.parseInt('#4e7d3e'.slice(1), 16),
        )
    })

    it('handles short hex colours', () => {
        expect(darken('#fff', 0.5)).toMatch(/^#[0-9a-f]{6}$/)
    })

    it('leaves an unreadable colour alone', () => {
        expect(darken('not-a-colour', 0.5)).toBe('not-a-colour')
    })

    it('derives the shadowed leaf tone from the leaf colour', () => {
        const materials = {bark: '#5a3d28', leaves: '#c23b1f'}

        expect(materialColor('leaves', materials)).toBe('#c23b1f')
        expect(materialColor('leaves-dark', materials)).toBe(darken('#c23b1f', 0.24))
    })

    it('paints the bark the colour the user chose', () => {
        expect(materialColor('bark', {bark: '#d9d2c4', leaves: '#4e7d3e'})).toBe('#d9d2c4')
    })

    it('keeps the coconut colour fixed', () => {
        expect(materialColor('coconut', {bark: '#000000', leaves: '#000000'})).toBe(
            MATERIAL_COLORS.coconut,
        )
    })
})

describe('shading modes', () => {
    it('offers lit, flat, and wireframe', () => {
        expect(SHADING_MODES).toEqual(['lit', 'flat', 'wireframe'])
    })

    it('names every time of day', () => {
        for (const time of Object.keys(TIME_OF_DAY) as TimeOfDay[]) {
            expect(TIME_OF_DAY[time]).toBeDefined()
        }
    })
})
