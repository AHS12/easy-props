import {describe, expect, it} from 'vitest'
import * as THREE from 'three'
import {getStyleProfile} from '../../assets/style/style-profiles'
import {treePresets} from '../../assets/trees/presets'
import {planPaintedTree, validatePaintedTreeParameters, type Limb} from '../../assets/trees/painted'
import {paintedTreeGenerator} from '../../assets/trees/painted-tree-generator'
import {createComponentRenderer} from '../../viewport/scene/component-renderer'
import {createSceneFromPreset} from '../scene/initial-scene'
import {checkBudget, findBudgetTarget} from './pipeline/budget'
import {collisionShapes, prismGeometry} from './pipeline/collision'
import {mergeParts} from './pipeline/merge'
import {sceneExportSource} from './scene-source'

const STYLE = getStyleProfile('low-poly')
const painted = treePresets.filter((preset) => preset.generatorId === 'painted-tree')

function distanceToWood(point: THREE.Vector3, limb: Limb): number {
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const closest = new THREE.Vector3()
    const segment = new THREE.Line3(a, b)
    let best = Infinity

    for (let i = 0; i < limb.points.length - 1; i++) {
        a.set(...limb.points[i])
        b.set(...limb.points[i + 1])

        const t = segment.closestPointToPointParameter(point, true)

        segment.at(t, closest)

        const radius = limb.radii[i] + (limb.radii[i + 1] - limb.radii[i]) * t

        best = Math.min(best, closest.distanceTo(point) - radius)
    }

    return best
}

describe('collision against the wood', () => {
    it.each(painted.map((preset) => preset.id))('%s stays with its wood', (id) => {
        const preset = painted.find((candidate) => candidate.id === id)!
        const tree = validatePaintedTreeParameters(preset.parameters).parameters
        const {limbs} = planPaintedTree(tree, preset.seed)
        const shapes = collisionShapes(paintedTreeGenerator.collision!(tree, preset.seed), [])

        expect(shapes.length).toBeGreaterThan(0)

        for (const shape of shapes) {
            const length = new THREE.Vector3(...shape.start).distanceTo(new THREE.Vector3(...shape.end))
            const geometry = prismGeometry(shape, [0, 0, 0])
            const position = geometry.getAttribute('position')
            const point = new THREE.Vector3()

            for (let i = 0; i < position.count; i++) {
                point.fromBufferAttribute(position, i)

                const beyond = Math.min(...limbs.map((limb) => distanceToWood(point, limb)))

                expect(beyond).toBeLessThan(length * 0.1)
            }
        }
    })
})

describe('the budget', () => {
    it.each(treePresets.map((preset) => preset.id))('%s shows what the file will hold', async (id) => {
        const scene = createSceneFromPreset(id)
        const renderer = createComponentRenderer()

        renderer.sync(scene, STYLE, 'lit')

        const counts = {wood: 0, leaves: 0}

        for (const {mesh} of renderer.all()) {
            if (!mesh.userData.isProxy) {
                const geometry = mesh.geometry
                const faces = (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3

                counts[mesh.userData.role === 'foliage' ? 'leaves' : 'wood'] += faces
            }
        }

        renderer.dispose()

        const source = sceneExportSource(scene, STYLE, 'test')
        const merged = mergeParts(await source.buildAtDetail(1), 'prop', source.pivot())

        expect(checkBudget(counts, findBudgetTarget('hero')).faces).toBe(
            merged.reduce((sum, mesh) => sum + mesh.faces, 0),
        )
        expect(merged.find((mesh) => mesh.name === 'prop_leaves')?.faces ?? 0).toBe(counts.leaves)
    }, 60000)

    it('names what costs most, and only when over', () => {
        const target = findBudgetTarget('background')

        expect(checkBudget({wood: 1000, leaves: 1000}, target).warning).toBeNull()

        const over = checkBudget({wood: 1000, leaves: 9000}, target)

        expect(over.over).toBe(true)
        expect(over.warning).toBe('Leaves are 90% of this prop. Lower Leaf density or Clumps.')
    })
})
