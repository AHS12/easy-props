import {describe, expect, it} from 'vitest'
import type * as THREE from 'three'
import {countTriangles} from '../assets/shared/geometry-utils'
import {getStyleProfile} from '../assets/style/style-profiles'
import {palmTrunkGenerator} from '../assets/trees/components/palm-trunk'

const STYLE = getStyleProfile('low-poly')
const CONTEXT = {random: () => 0.5, seed: 7, style: STYLE}

function parametersOf(overrides: Record<string, unknown> = {}) {
    const defaults = palmTrunkGenerator.createDefaultParameters() as unknown as Record<
        string,
        unknown
    >

    return palmTrunkGenerator.validate({...defaults, ...overrides}).parameters
}

function generate(overrides: Record<string, unknown> = {}): THREE.BufferGeometry {
    return palmTrunkGenerator.generate(parametersOf(overrides), CONTEXT).geometry
}

function positions(geometry: THREE.BufferGeometry): number[] {
    return Array.from(geometry.getAttribute('position').array)
}

/**
 * The radius of the tube at each height, read from a trunk that has been
 * straightened, so the axis is the Y axis.
 */
function ringRadii(geometry: THREE.BufferGeometry): number[] {
    const position = geometry.getAttribute('position')
    const bands = new Map<number, number>()

    for (let index = 0; index < position.count; index++) {
        const height = Math.round(position.getY(index) * 1000)
        const radius = Math.hypot(position.getX(index), position.getZ(index))

        bands.set(height, Math.max(bands.get(height) ?? 0, radius))
    }

    return [...bands.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, radius]) => radius)
}

/** How much the radius moves over the middle of the trunk. */
function middleSpread(geometry: THREE.BufferGeometry): number {
    const radii = ringRadii(geometry)
    const middle = radii.slice(
        Math.floor(radii.length * 0.4),
        Math.ceil(radii.length * 0.6) + 1,
    )

    return Math.max(...middle) - Math.min(...middle)
}

describe('palm trunk', () => {
    it('draws a solid trunk of bark', () => {
        const part = palmTrunkGenerator.generate(
            palmTrunkGenerator.createDefaultParameters(),
            CONTEXT,
        )

        const position = part.geometry.getAttribute('position')

        expect(part.material).toBe('bark')
        expect(position.count).toBeGreaterThan(0)
        expect(countTriangles(part.geometry)).toBeGreaterThan(0)

        for (let index = 0; index < position.array.length; index++) {
            expect(Number.isFinite(position.array[index])).toBe(true)
        }
    })

    it('draws the same trunk from the same parameters', () => {
        expect(positions(generate())).toEqual(positions(generate()))
    })

    it('stays inside the low-poly budget at the default parameters', () => {
        expect(countTriangles(generate())).toBeLessThan(4000)
    })

    it('ignores a push saved by an old development build', () => {
        const pushed = generate({
            pushes: [{point: [0, 2, 0.4], direction: [0, 0, 1], strength: 0.3, radius: 0.6}],
        })

        expect(positions(pushed)).toEqual(positions(generate()))
    })
})

describe('the palm spine', () => {
    it('carries as many points as Control points asks for', () => {
        const parameters = palmTrunkGenerator.createDefaultParameters()

        expect(parameters.spine).toHaveLength(parameters.controlPoints)
    })

    it('supplies a spine when the parameters arrive without one', () => {
        const supplied = parametersOf({spine: undefined, controlPoints: 8})

        expect(supplied.spine).toHaveLength(8)
    })

    it('starts at the trunk and ends at the full height', () => {
        const supplied = parametersOf({spine: [], height: 6, bend: 'straight'})

        expect(supplied.spine[0].t).toBeCloseTo(0)
        expect(supplied.spine[supplied.spine.length - 1].t).toBeCloseTo(1)
    })
})

describe('palm trunk rings', () => {
    it('puts gentle ridges on a ringed trunk and leaves a plain trunk smooth', () => {
        const plain = middleSpread(generate({bend: 'straight', spine: [], rings: 0}))
        const ringed = middleSpread(generate({bend: 'straight', spine: [], rings: 24}))

        expect(plain).toBeLessThan(ringed)
    })

    it('cuts the rings deeper when Ring depth grows', () => {
        const shallow = middleSpread(
            generate({bend: 'straight', spine: [], rings: 24, ringDepth: 0.02}),
        )
        const deep = middleSpread(
            generate({bend: 'straight', spine: [], rings: 24, ringDepth: 0.3}),
        )

        expect(shallow).toBeLessThan(deep)
    })
})

describe('palm trunk validation', () => {
    it('clamps values that are out of range and reports them', () => {
        const validated = palmTrunkGenerator.validate({
            height: 500,
            rings: 900,
            ringDepth: -3,
            twist: 1000,
        })

        expect(validated.parameters.height).toBe(18)
        expect(validated.parameters.rings).toBe(40)
        expect(validated.parameters.ringDepth).toBe(0)
        expect(validated.parameters.twist).toBe(180)

        const keys = validated.issues.map((issue) => issue.key)

        expect(keys).toContain('height')
        expect(keys).toContain('rings')
        expect(keys).toContain('ringDepth')
        expect(keys).toContain('twist')
    })

    it('falls back to the defaults when the values make no sense', () => {
        const defaults = palmTrunkGenerator.createDefaultParameters()

        const validated = palmTrunkGenerator.validate({
            height: 'tall',
            baseRadius: null,
            bend: 'sideways',
        })

        expect(validated.valid).toBe(false)
        expect(validated.parameters.height).toBe(defaults.height)
        expect(validated.parameters.baseRadius).toBe(defaults.baseRadius)
        expect(validated.parameters.bend).toBe(defaults.bend)
    })

    it('leaves sound values untouched', () => {
        const validated = palmTrunkGenerator.validate({
            height: 12,
            baseRadius: 0.5,
            taper: 0.5,
            rings: 10,
            ringDepth: 0.1,
            twist: 30,
            bend: 'straight',
            controlPoints: 6,
        })

        expect(validated.issues).toHaveLength(0)
        expect(validated.valid).toBe(true)
        expect(validated.parameters.height).toBe(12)
        expect(validated.parameters.baseRadius).toBe(0.5)
        expect(validated.parameters.rings).toBe(10)
        expect(validated.parameters.ringDepth).toBe(0.1)
        expect(validated.parameters.twist).toBe(30)
        expect(validated.parameters.bend).toBe('straight')
        expect(validated.parameters.controlPoints).toBe(6)
    })
})
