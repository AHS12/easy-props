import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import type {LimbSpinePoint, SceneComponent} from '../assets/shared/component-types'
import {countTriangles} from '../assets/shared/geometry-utils'
import {createSeededRandom} from '../assets/shared/random'
import {reshapesSpine, spineKindOf, spineLengthKey} from '../assets/shared/spines'
import {DEFAULT_MATERIALS} from '../assets/style/materials'
import {getStyleProfile} from '../assets/style/style-profiles'
import {
    buildFrondSpine,
    FROND_POINTS,
    palmFrondGenerator,
} from '../assets/trees/components/palm-frond'
import {findComponent, type Scene, type SceneAsset} from '../core/scene/scene-model'
import {updateComponentParameters} from '../core/scene/scene-ops'
import {movedSpine, selectedSpine} from '../viewport/scene/spine-drag'

const STYLE = getStyleProfile('low-poly')
const CONTEXT = {random: () => 0.5, seed: 1, style: STYLE}

/** A frond the user has just added, with nothing else in the scene. */
function sceneWithFrond() {
    const parameters = palmFrondGenerator.createDefaultParameters()

    const component: SceneComponent = {
        id: 'cmp-frond-0',
        type: 'palm-frond',
        generatorId: palmFrondGenerator.id,
        generatorVersion: palmFrondGenerator.version,
        parentId: null,
        transform: {position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]},
        parameters,
        seed: 1,
        slot: null,
        edited: false,
    }

    const asset: SceneAsset = {
        id: 'asset-1',
        kind: 'tree',
        generatorId: 'palm-tree',
        generatorVersion: 1,
        components: [component],
        seed: 1,
        parameters: {},
        materials: DEFAULT_MATERIALS,
    }

    const scene: Scene = {id: 'scene-1', assets: [asset]}

    return {scene, component, parameters}
}

function positions(seed: number, style = STYLE): number[] {
    const parameters = palmFrondGenerator.createDefaultParameters()
    const part = palmFrondGenerator.generate(parameters, {
        random: createSeededRandom(seed),
        seed,
        style,
    })

    return Array.from(part.geometry.getAttribute('position').array)
}

describe('the palm frond', () => {
    it('builds a frond with real geometry', () => {
        const parameters = palmFrondGenerator.createDefaultParameters()
        const part = palmFrondGenerator.generate(parameters, CONTEXT)
        const position = part.geometry.getAttribute('position')

        expect(position.count).toBeGreaterThan(0)

        for (let index = 0; index < position.count; index++) {
            expect(Number.isFinite(position.getX(index))).toBe(true)
            expect(Number.isFinite(position.getY(index))).toBe(true)
            expect(Number.isFinite(position.getZ(index))).toBe(true)
        }

        expect(countTriangles(part.geometry)).toBeGreaterThan(0)
        expect(part.material).toBe('leaves')
    })

    it('stays inside its triangle budget', () => {
        const parameters = palmFrondGenerator.createDefaultParameters()
        const part = palmFrondGenerator.generate(parameters, CONTEXT)

        expect(countTriangles(part.geometry)).toBeLessThan(1500)
    })

    it('reaches out along X from the origin', () => {
        const parameters = palmFrondGenerator.createDefaultParameters()
        const part = palmFrondGenerator.generate(parameters, CONTEXT)
        const position = part.geometry.getAttribute('position')

        const box = new THREE.Box3()
        const vertex = new THREE.Vector3()

        for (let index = 0; index < position.count; index++) {
            box.expandByPoint(vertex.fromBufferAttribute(position, index))
        }

        expect(box.min.x).toBeCloseTo(0, 1)
        expect(box.max.x).toBeCloseTo(parameters.length, 1)
    })

    it('draws the same frond from the same seed', () => {
        expect(positions(4)).toEqual(positions(4))
    })

    it('moves the leaflets when the seed changes', () => {
        expect(positions(4)).not.toEqual(positions(5))
    })

    it('gives a part that arrives without a spine one to drag', () => {
        const {parameters} = palmFrondGenerator.validate({length: 3, arch: 'drooping'})

        expect(parameters.spine).toHaveLength(FROND_POINTS)
        expect(parameters.length).toBe(3)
        expect(parameters.arch).toBe('drooping')
    })

    it('keeps the spine the user has already shaped', () => {
        const parameters = palmFrondGenerator.createDefaultParameters()
        const dragged = parameters.spine.map((point, index) =>
            index === 2 ? {...point, z: 0.4} : point,
        )

        const {parameters: validated} = palmFrondGenerator.validate({...parameters, spine: dragged})

        expect(validated.spine[2].z).toBeCloseTo(0.4, 6)
    })

    it('draws a frond without a stored spine from its arch', () => {
        const parameters = palmFrondGenerator.createDefaultParameters()

        const withSpine = palmFrondGenerator.generate(parameters, CONTEXT)
        const withoutSpine = palmFrondGenerator.generate({...parameters, spine: []}, CONTEXT)

        expect(withoutSpine.geometry.attributes.position.count).toBe(
            withSpine.geometry.attributes.position.count,
        )
    })

    it('clamps rather than refuses', () => {
        const result = palmFrondGenerator.validate({leaflets: -6, arch: 'sideways', twist: 400})

        expect(result.valid).toBe(false)
        expect(result.parameters.leaflets).toBe(4)
        expect(result.parameters.arch).toBe('arched')
        expect(result.parameters.twist).toBe(90)
        expect(result.issues.length).toBeGreaterThan(0)
    })

    it('never throws on rubbish', () => {
        expect(() => palmFrondGenerator.validate(17)).not.toThrow()
        expect(() => palmFrondGenerator.validate(null)).not.toThrow()
        expect(() => palmFrondGenerator.validate({spine: 'flat'})).not.toThrow()
    })
})

describe('the frond arch', () => {
    it('lifts an upright frond at its tip', () => {
        const spine = buildFrondSpine('upright', 0.6, 3)
        const middle = spine[Math.floor(spine.length / 2)]

        expect(spine[spine.length - 1].y).toBeGreaterThan(middle.y)
    })

    it('drops a drooping frond below its middle and below its base', () => {
        const spine = buildFrondSpine('drooping', 0.8, 3)
        const middle = spine[Math.floor(spine.length / 2)]

        expect(spine[spine.length - 1].y).toBeLessThan(middle.y)
        expect(spine[spine.length - 1].y).toBeLessThan(spine[0].y)
    })

    it('bows an arched frond over the horizontal', () => {
        const spine = buildFrondSpine('arched', 0.8, 3)
        const middle = spine[Math.floor(spine.length / 2)]

        expect(spine[spine.length - 1].y).toBeLessThan(middle.y)
        expect(spine[spine.length - 1].y).toBeGreaterThan(spine[0].y)
    })

    it('draws a straight line when there is no arch', () => {
        for (const arch of ['upright', 'arched', 'drooping'] as const) {
            for (const point of buildFrondSpine(arch, 0, 2.6)) {
                expect(point.y).toBeCloseTo(0, 9)
                expect(point.z).toBeCloseTo(0, 9)
            }
        }
    })

    it('runs the spine from nought to one', () => {
        const spine = buildFrondSpine('arched', 0.55, 2.6, 8)

        expect(spine).toHaveLength(8)
        expect(spine[0].t).toBe(0)
        expect(spine[7].t).toBe(1)

        for (const point of spine) {
            expect(point.t).toBeGreaterThanOrEqual(0)
            expect(point.t).toBeLessThanOrEqual(1)
        }
    })
})

describe('a frond has a draggable spine', () => {
    it('is laid out the way a limb is', () => {
        expect(spineKindOf('palm-frond')).toBe('outward')
        expect(spineLengthKey('palm-frond')).toBe('length')
        expect(reshapesSpine('palm-frond', 'arch')).toBe(true)
        expect(reshapesSpine('palm-frond', 'archAmount')).toBe(true)
        expect(reshapesSpine('palm-frond', 'width')).toBe(false)
    })

    it('shows a handle for every point in its spine', () => {
        const {scene, component} = sceneWithFrond()

        const spine = selectedSpine(scene, component.id)

        expect(spine?.kind).toBe('outward')
        expect(spine?.points).toHaveLength(8)
        expect(spine?.positions).toHaveLength(8)
    })

    it('moves only the offsets when a handle is dragged', () => {
        const {scene, component} = sceneWithFrond()
        const spine = selectedSpine(scene, component.id)!
        const before = spine.points.map((point) => point.t)

        const target = spine.positions[3].clone().add(new THREE.Vector3(0, 0.4, 0.2))
        const moved = movedSpine(spine, 3, target)

        expect(moved).toHaveLength(8)

        for (let index = 0; index < moved.length; index++) {
            expect(moved[index].t).toBe(before[index])
        }

        expect(moved[2]).toEqual(spine.points[2])
        expect(moved[4]).toEqual(spine.points[4])
        expect(moved[3].y).toBeCloseTo((spine.points[3].y ?? 0) + 0.4, 5)
        expect(moved[3].z).toBeCloseTo(spine.points[3].z + 0.2, 5)
    })

    it('rebuilds the spine when the arch changes', () => {
        const {scene, component, parameters} = sceneWithFrond()
        const before = findComponent(scene, component.id)?.parameters.spine as LimbSpinePoint[]

        const patched = updateComponentParameters(scene, component.id, {arch: 'drooping'})
        const after = findComponent(patched, component.id)?.parameters.spine as LimbSpinePoint[]

        const expected = buildFrondSpine('drooping', parameters.archAmount, parameters.length)

        expect(after).not.toEqual(before)
        expect(after).toHaveLength(FROND_POINTS)
        expect(after.map((point) => point.y)).toEqual(expected.map((point) => point.y))
    })

    it('rebuilds the spine when the arch amount changes', () => {
        const {scene, component} = sceneWithFrond()

        const flatter = updateComponentParameters(scene, component.id, {archAmount: 0.1})
        const spine = findComponent(flatter, component.id)?.parameters.spine as LimbSpinePoint[]

        expect(spine[FROND_POINTS - 1].y).toBeLessThan(0.15)
    })

    it('leaves the spine alone when an unrelated control changes', () => {
        const {scene, component} = sceneWithFrond()
        const before = component.parameters.spine

        const wider = updateComponentParameters(scene, component.id, {width: 0.6})

        expect(findComponent(wider, component.id)?.parameters.spine).toEqual(before)
    })
})
