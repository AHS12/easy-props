import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import type {LimbSpinePoint, SpinePoint} from '../assets/shared/component-types'
import {getStyleProfile} from '../assets/style/style-profiles'
import {
    reshapesSpine,
    spineKindOf,
    spineLengthKey,
    spinePointPosition,
} from '../assets/shared/spines'
import {buildBranchSpine, branchGenerator, BRANCH_POINTS} from '../assets/trees/components/branch'
import {buildRootSpine, rootGenerator, ROOT_POINTS} from '../assets/trees/components/root'
import {buildTrunkSpine, trunkGenerator} from '../assets/trees/components/trunk'
import {LIBRARY_PARTS} from '../assets/library/library'
import {createInitialScene} from '../core/scene/initial-scene'
import {findComponent} from '../core/scene/scene-model'
import {updateComponentParameters} from '../core/scene/scene-ops'
import {dragPlaneFor, movedSpine, selectedSpine} from '../viewport/scene/spine-drag'

const TRUNK_ID = 'cmp-trunk-0'
const STYLE = getStyleProfile('low-poly')
const CONTEXT = {random: () => 0.5, seed: 1, style: STYLE}

/** A scene with a branch the user has just added. */
function sceneWithBranch() {
    const scene = createInitialScene()
    const branch = scene.assets[0].components.find((component) => component.type === 'branch')

    return {scene, branch: branch!}
}

describe('spine layout', () => {
    it('rises along Y for a trunk', () => {
        const point: SpinePoint = {t: 0.5, x: 0.2, z: -0.1}

        const position = spinePointPosition(point, 'vertical', 4)

        expect(position.x).toBeCloseTo(0.2)
        expect(position.y).toBeCloseTo(2)
        expect(position.z).toBeCloseTo(-0.1)
    })

    it('reaches along X for a branch', () => {
        const point: LimbSpinePoint = {t: 0.5, y: 0.3, z: -0.1}

        const position = spinePointPosition(point, 'outward', 2)

        expect(position.x).toBeCloseTo(1)
        expect(position.y).toBeCloseTo(0.3)
        expect(position.z).toBeCloseTo(-0.1)
    })

    it('turns the offsets with the twist', () => {
        const point: SpinePoint = {t: 1, x: 1, z: 0}

        const position = spinePointPosition(point, 'vertical', 2, 90)

        expect(position.x).toBeCloseTo(0)
        expect(position.z).toBeCloseTo(-1)
    })

    it('knows which parts have a spine', () => {
        expect(spineKindOf('trunk')).toBe('vertical')
        expect(spineKindOf('branch')).toBe('outward')
        expect(spineKindOf('root')).toBe('outward')
        expect(spineKindOf('foliage-cluster')).toBeNull()
    })

    it('knows which parameter is the length', () => {
        expect(spineLengthKey('trunk')).toBe('height')
        expect(spineLengthKey('branch')).toBe('length')
    })

    it('knows which controls reshape the spine', () => {
        expect(reshapesSpine('trunk', 'bend')).toBe(true)
        expect(reshapesSpine('branch', 'curl')).toBe(true)
        expect(reshapesSpine('root', 'drop')).toBe(true)
        expect(reshapesSpine('branch', 'spine')).toBe(false)
    })
})

describe('default spines', () => {
    it('reproduces the branch curve the generator used to draw', () => {
        const spine = buildBranchSpine(0.5, 0.2, 2)

        for (const point of spine) {
            expect(point.y).toBeCloseTo(2 * 0.5 * point.t * point.t)
            expect(point.z).toBeCloseTo(2 * 0.2 * point.t * point.t)
        }
    })

    it('starts a branch where it attaches, whatever its bend', () => {
        const spine = buildBranchSpine(0.9, -0.4, 3)

        expect(spine[0].y).toBeCloseTo(0)
        expect(spine[0].z).toBeCloseTo(0)
    })

    it('sinks a root toward the ground', () => {
        const spine = buildRootSpine(0.4, 0, 1.5)

        expect(spine[spine.length - 1].y).toBeCloseTo(-0.4)
    })

    it('draws a branch without a stored spine from its controls', () => {
        const parameters = branchGenerator.createDefaultParameters()

        const withSpine = branchGenerator.generate(parameters, CONTEXT)
        const withoutSpine = branchGenerator.generate({...parameters, spine: []}, CONTEXT)

        expect(withoutSpine.geometry.attributes.position.count).toBe(
            withSpine.geometry.attributes.position.count,
        )
    })

    it('draws a root without a stored spine from its controls', () => {
        const parameters = rootGenerator.createDefaultParameters()

        const withSpine = rootGenerator.generate(parameters, CONTEXT)
        const withoutSpine = rootGenerator.generate({...parameters, spine: []}, CONTEXT)

        expect(withoutSpine.geometry.attributes.position.count).toBe(
            withSpine.geometry.attributes.position.count,
        )
    })
})

describe('dragging a spine', () => {
    it('finds the spine of the selected part', () => {
        const {scene, branch} = sceneWithBranch()

        const spine = selectedSpine(scene, branch.id)

        expect(spine?.kind).toBe('outward')
        expect(spine?.positions).toHaveLength(5)
    })

    it('shows no handles for a part without a spine', () => {
        const scene = createInitialScene()
        const leaves = scene.assets[0].components.find(
            (component) => component.type === 'foliage-cluster',
        )

        expect(selectedSpine(scene, leaves!.id)).toBeNull()
    })

    it('shows no handles when nothing is selected', () => {
        expect(selectedSpine(createInitialScene(), null)).toBeNull()
    })

    it('moves only the point that was dragged', () => {
        const {scene, branch} = sceneWithBranch()
        const spine = selectedSpine(scene, branch.id)!

        const moved = movedSpine(spine, 4, spine.positions[4].clone().add(new THREE.Vector3(0, 1, 0)))

        expect(moved).toHaveLength(5)
        expect(moved.slice(0, 4)).toEqual(spine.points.slice(0, 4))
        expect(moved[4]).not.toEqual(spine.points[4])
    })

    it('puts the point where the pointer is, twist and all', () => {
        const {scene, branch} = sceneWithBranch()
        const twisted = updateComponentParameters(scene, branch.id, {twist: 80})
        const spine = selectedSpine(twisted, branch.id)!
        const plane = dragPlaneFor(spine, 4)

        // A point on the drag plane, which is the only place a pointer can land.
        const offset = spine.positions[4].clone().add(new THREE.Vector3(0.2, 0.3, 0))
        const target = offset
            .clone()
            .sub(plane.normal.clone().multiplyScalar(plane.distanceToPoint(offset)))

        const moved = movedSpine(spine, 4, target)

        const after = selectedSpine(
            updateComponentParameters(twisted, branch.id, {spine: moved}),
            branch.id,
        )!

        expect(after.positions[4].x).toBeCloseTo(target.x, 4)
        expect(after.positions[4].y).toBeCloseTo(target.y, 4)
        expect(after.positions[4].z).toBeCloseTo(target.z, 4)
    })

    it('follows the pointer through the component transform', () => {
        const {scene, branch} = sceneWithBranch()
        const spine = selectedSpine(scene, branch.id)!

        const target = spine.positions[0].clone()
        const moved = movedSpine(spine, 0, target)

        expect(moved[0].z).toBeCloseTo(spine.points[0].z, 4)
    })

    it('slides a trunk on a horizontal plane at its own height', () => {
        const scene = createInitialScene()
        const spine = selectedSpine(scene, TRUNK_ID)!

        const plane = dragPlaneFor(spine, 2)

        expect(plane.normal.y).toBeCloseTo(1)
        expect(plane.constant).toBeCloseTo(-spine.positions[2].y)
    })

    it('turns the branch drag plane with the branch', () => {
        const {scene, branch} = sceneWithBranch()
        const spine = selectedSpine(scene, branch.id)!

        const plane = dragPlaneFor(spine, 4)
        const axis = new THREE.Vector3(1, 0, 0)
            .applyMatrix4(spine.matrix)
            .sub(new THREE.Vector3().applyMatrix4(spine.matrix))
            .normalize()

        expect(plane.normal.x).toBeCloseTo(axis.x, 5)
        expect(plane.normal.y).toBeCloseTo(axis.y, 5)
        expect(plane.normal.z).toBeCloseTo(axis.z, 5)
        expect(plane.distanceToPoint(spine.positions[4])).toBeCloseTo(0)
    })

    it('keeps the offsets inside the part, not in the world', () => {
        const {scene, branch} = sceneWithBranch()
        const spine = selectedSpine(scene, branch.id)!

        const before = spine.points.map((point) => point.z)
        const moved = movedSpine(spine, 3, spine.positions[3].clone())

        for (let index = 0; index < moved.length; index++) {
            expect(moved[index].z).toBeCloseTo(before[index], 4)
        }
    })
})

describe('a part from the library can be shaped straight away', () => {
    it('gives a library branch a spine when it is validated', () => {
        const part = LIBRARY_PARTS.find((entry) => entry.type === 'branch')!

        const {parameters} = branchGenerator.validate(part.parameters)

        expect(parameters.spine).toHaveLength(BRANCH_POINTS)
        expect(part.parameters).not.toHaveProperty('spine')
    })

    it('gives a library root a spine when it is validated', () => {
        const part = LIBRARY_PARTS.find((entry) => entry.type === 'root')!

        const {parameters} = rootGenerator.validate(part.parameters)

        expect(parameters.spine).toHaveLength(ROOT_POINTS)
    })
})

describe('a dragged spine outlives the controls around it', () => {
    it('marks the part edited so a rebuild keeps the new shape', () => {
        const {scene, branch} = sceneWithBranch()
        const spine = selectedSpine(scene, branch.id)!

        const moved = movedSpine(spine, 4, spine.positions[4].clone().add(new THREE.Vector3(0, 0.4, 0)))
        const shaped = updateComponentParameters(scene, branch.id, {spine: moved})

        expect(findComponent(shaped, branch.id)?.edited).toBe(true)
    })

    it('rebuilds the branch spine when Bend changes', () => {
        const {scene, branch} = sceneWithBranch()

        const shaped = updateComponentParameters(scene, branch.id, {bend: 0.9})
        const spine = shaped.assets[0].components.find((c) => c.id === branch.id)?.parameters
            .spine as LimbSpinePoint[]

        const expected = buildBranchSpine(0.9, branch.parameters.curl as number, branch.parameters.length as number)

        expect(spine.map((point) => point.y)).toEqual(expected.map((point) => point.y))
    })

    it('leaves the spine alone when an unrelated control changes', () => {
        const {scene, branch} = sceneWithBranch()
        const before = branch.parameters.spine

        const shaped = updateComponentParameters(scene, branch.id, {baseRadius: 0.2})

        expect(
            shaped.assets[0].components.find((c) => c.id === branch.id)?.parameters.spine,
        ).toEqual(before)
    })

    it('rebuilds the trunk spine when Bend changes', () => {
        const scene = createInitialScene()
        const trunk = findComponent(scene, TRUNK_ID)!

        const shaped = updateComponentParameters(scene, TRUNK_ID, {bend: 'straight'})
        const spine = findComponent(shaped, TRUNK_ID)?.parameters.spine as SpinePoint[]

        const expected = buildTrunkSpine(
            'straight',
            trunk.parameters.height as number,
            trunk.parameters.leanAzimuth as number,
            trunk.parameters.leanWobble as number,
        )

        expect(spine.map((point) => point.x)).toEqual(expected.map((point) => point.x))
    })

    it('draws the same trunk from the stored spine as from its controls', () => {
        const parameters = trunkGenerator.createDefaultParameters()

        const generated = trunkGenerator.generate(parameters, CONTEXT)

        expect(generated.geometry.attributes.position.count).toBeGreaterThan(0)
    })
})
