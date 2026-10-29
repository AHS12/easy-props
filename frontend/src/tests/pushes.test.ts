import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import type {SurfacePush} from '../assets/shared/component-types'
import {applySurfacePushes} from '../assets/shared/geometry-utils'
import {branchGenerator} from '../assets/trees/components/branch'
import {getStyleProfile} from '../assets/style/style-profiles'
import {createInitialScene} from '../core/scene/initial-scene'
import {setSurfacePushes} from '../core/scene/scene-ops'
import {findComponent} from '../core/scene/scene-model'
import {beginPush, pushFor} from '../viewport/scene/push-drag'

const STYLE = getStyleProfile('low-poly')
const TRUNK_ID = 'cmp-trunk-0'

/** A flat sheet lying in the XY plane, so displacements are easy to read. */
function sheet(): THREE.BufferGeometry {
    return new THREE.PlaneGeometry(2, 2, 4, 4)
}

function vertexAt(geometry: THREE.BufferGeometry, index: number): THREE.Vector3 {
    return new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('position'), index)
}

function centrePush(overrides: Partial<SurfacePush> = {}): SurfacePush {
    return {
        point: [0, 0, 0],
        direction: [0, 0, 1],
        strength: 0.5,
        radius: 1,
        ...overrides,
    }
}

describe('applying a surface push', () => {
    it('leaves the geometry alone when there is nothing to apply', () => {
        const geometry = sheet()
        const before = vertexAt(geometry, 5)

        applySurfacePushes(geometry, [])

        expect(vertexAt(geometry, 5).z).toBeCloseTo(before.z)
    })

    it('moves the surface along the push direction', () => {
        const geometry = sheet()

        applySurfacePushes(geometry, [centrePush()])

        // The middle vertex sits at the point, so it moves the full strength.
        expect(vertexAt(geometry, 12).z).toBeCloseTo(0.5)
    })

    it('fades to nothing at the rim of its reach', () => {
        const geometry = sheet()

        applySurfacePushes(geometry, [centrePush({radius: 0.6})])

        // A corner is further away than the reach, so it does not move.
        expect(vertexAt(geometry, 0).z).toBeCloseTo(0)
    })

    it('moves a near vertex more than a far one', () => {
        const geometry = sheet()

        applySurfacePushes(geometry, [centrePush()])

        const middle = vertexAt(geometry, 12).z
        const edge = Math.max(
            ...Array.from({length: 25}, (_, index) => Math.abs(vertexAt(geometry, index).z)),
        )

        expect(middle).toBeGreaterThan(0)
        expect(edge).toBeGreaterThan(0)
        expect(edge).toBeLessThanOrEqual(middle)
    })

    it('pulls the surface in when the strength is negative', () => {
        const geometry = sheet()

        applySurfacePushes(geometry, [centrePush({strength: -0.4})])

        expect(vertexAt(geometry, 12).z).toBeCloseTo(-0.4)
    })

    it('has less effect the second time, because the surface has moved', () => {
        const geometry = sheet()
        const once = sheet()

        applySurfacePushes(once, [centrePush()])
        applySurfacePushes(geometry, [centrePush(), centrePush()])

        const first = vertexAt(once, 12).z
        const second = vertexAt(geometry, 12).z

        expect(first).toBeCloseTo(0.5)
        // The point is now half a reach away from the surface, so the falloff
        // is already part way down. Repeated pushes at one spot ease off.
        expect(second).toBeGreaterThan(first)
        expect(second).toBeLessThan(1)
    })
})

describe('a pushed part is still a parameter', () => {
    it('stores the pushes on the component', () => {
        const scene = createInitialScene()
        const pushed = setSurfacePushes(scene, TRUNK_ID, [centrePush()])

        expect(findComponent(pushed, TRUNK_ID)?.parameters.pushes).toHaveLength(1)
    })

    it('regenerates the mesh from the stored pushes', () => {
        const parameters = branchGenerator.createDefaultParameters()
        const context = {random: () => 0.5, seed: 1, style: STYLE}

        const plain = branchGenerator.generate(parameters, context)
        const pushed = branchGenerator.generate(
            {...parameters, pushes: [centrePush({radius: 5})]},
            context,
        )

        const plainPositions = plain.geometry.getAttribute('position')
        const pushedPositions = pushed.geometry.getAttribute('position')

        let moved = 0
        for (let index = 0; index < plainPositions.count; index++) {
            const dx = pushedPositions.getX(index) - plainPositions.getX(index)
            const dy = pushedPositions.getY(index) - plainPositions.getY(index)
            const dz = pushedPositions.getZ(index) - plainPositions.getZ(index)

            if (Math.hypot(dx, dy, dz) > 1e-4) {
                moved += 1
            }
        }

        expect(moved).toBeGreaterThan(0)
        expect(plainPositions.count).toBe(pushedPositions.count)
    })

    it('keeps the same geometry for the same pushes', () => {
        const parameters = branchGenerator.createDefaultParameters()
        const context = {random: () => 0.5, seed: 1, style: STYLE}
        const pushes = [centrePush({radius: 2})]

        const first = branchGenerator.generate({...parameters, pushes}, context)
        const second = branchGenerator.generate({...parameters, pushes}, context)

        expect(second.geometry.getAttribute('position').array).toEqual(
            first.geometry.getAttribute('position').array,
        )
    })
})

describe('turning a drag into a push', () => {
    function gestureFor(normal: THREE.Vector3, tool: 'push' | 'pull' = 'push') {
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
        camera.position.set(0, 0, 10)
        camera.lookAt(0, 0, 0)
        camera.updateMatrixWorld()

        return beginPush({
            scene: createInitialScene(),
            componentId: TRUNK_ID,
            point: new THREE.Vector3(0, 2, 0),
            normal,
            reach: 0.4,
            tool,
            camera,
            width: 1000,
            height: 800,
            pointer: {x: 500, y: 400},
        })
    }

    it('measures a drag along the normal', () => {
        const gesture = gestureFor(new THREE.Vector3(1, 0, 0))!
        expect(gesture).not.toBeNull()

        // A normal pointing right projects to the right of the screen.
        expect(gesture.screenNormal.x).toBeGreaterThan(0.9)

        const pushed = pushFor(gesture, {x: 560, y: 400})
        expect(pushed?.strength).toBeGreaterThan(0)
    })

    it('does nothing when the drag runs across the normal', () => {
        const gesture = gestureFor(new THREE.Vector3(1, 0, 0))!

        expect(pushFor(gesture, {x: 500, y: 460})).toBeNull()
    })

    it('pulls in the other way', () => {
        const gesture = gestureFor(new THREE.Vector3(1, 0, 0), 'pull')!

        const pulled = pushFor(gesture, {x: 560, y: 400})
        expect(pulled?.strength).toBeLessThan(0)
    })

    it('gives up when there is no direction on screen to measure', () => {
        // A normal pointing straight down the view, at the very centre of the
        // screen: projected, it is a dot, so a drag has nothing to measure
        // against.
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
        camera.position.set(0, 0, 10)
        camera.lookAt(0, 0, 0)
        camera.updateMatrixWorld()

        const gesture = beginPush({
            scene: createInitialScene(),
            componentId: TRUNK_ID,
            point: new THREE.Vector3(0, 0, 0),
            normal: new THREE.Vector3(0, 0, 1),
            reach: 0.4,
            tool: 'push',
            camera,
            width: 1000,
            height: 800,
            pointer: {x: 500, y: 400},
        })

        expect(gesture).toBeNull()
    })

    it('stores the push in the part own space', () => {
        const gesture = gestureFor(new THREE.Vector3(1, 0, 0))!

        // The trunk sits at the origin with no rotation, so its own space and
        // the world agree here.
        expect(gesture.point[1]).toBeCloseTo(2)
        expect(gesture.direction[0]).toBeCloseTo(1)
    })
})
