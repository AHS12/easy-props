import * as THREE from 'three'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {getStyleProfile} from '../assets/style/style-profiles'
import {paintedBarkGenerator} from '../assets/trees/components/painted-parts'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {updateTreeParameters} from '../core/scene/scene-ops'
import {createComponentRenderer} from '../viewport/scene/component-renderer'

const STYLE = getStyleProfile('detailed')
const flush = () => new Promise((resolve) => setTimeout(resolve))

/** Stands in for the workers: each build waits until the test finishes it. */
function controlledBuilds() {
    const builds: {parameters: {tree: {height: number}}; finish: (geometry: THREE.BufferGeometry) => void}[] = []

    vi.spyOn(paintedBarkGenerator, 'buildOffThread').mockImplementation((parameters) =>
        new Promise((finish) => {
            builds.push({parameters: parameters as never, finish})
        }),
    )

    return builds
}

function setUp() {
    const builds = controlledBuilds()
    const arrived = vi.fn()
    const renderer = createComponentRenderer(arrived)
    const scene = createSceneFromPreset('blossom-tree')
    const assetId = scene.assets[0].id

    renderer.sync(scene, STYLE, 'lit')

    return {builds, arrived, renderer, scene, assetId}
}

async function finishWarmUp(builds: ReturnType<typeof controlledBuilds>) {
    for (let index = 0; index < 3; index++) {
        builds.shift()!.finish(new THREE.BufferGeometry())
        await flush()
    }
}

const clumpMesh = (renderer: ReturnType<typeof createComponentRenderer>) =>
    renderer.all().find((part) => part.materialKind === 'painted' && part.id.startsWith('cmp-clump'))!.mesh.geometry

describe('showing a tree while its bark is built elsewhere', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('warms the threads on the first tree', async () => {
        const {builds} = setUp()

        expect(builds).toHaveLength(1)
        await finishWarmUp(builds)
        expect(builds).toHaveLength(0)
    })

    it('holds the leaves until the bark is ready, then shows both', async () => {
        const {builds, arrived, renderer, scene, assetId} = setUp()

        await finishWarmUp(builds)

        const leavesBefore = clumpMesh(renderer)
        const barkBefore = renderer.get('cmp-bark-0')!.mesh.geometry
        const taller = updateTreeParameters(scene, assetId, {height: 11}, STYLE)

        renderer.sync(taller, STYLE, 'lit')
        expect(builds).toHaveLength(1)
        expect(clumpMesh(renderer)).toBe(leavesBefore)
        expect(renderer.get('cmp-bark-0')!.mesh.geometry).toBe(barkBefore)

        const bark = new THREE.BufferGeometry()

        builds.shift()!.finish(bark)
        await flush()

        expect(renderer.get('cmp-bark-0')!.mesh.geometry).toBe(bark)
        expect(clumpMesh(renderer)).not.toBe(leavesBefore)
        expect(arrived).toHaveBeenCalledTimes(1)
    })

    it('skips values a fast drag has passed, and ends on the last', async () => {
        const {builds, renderer, scene, assetId} = setUp()

        await finishWarmUp(builds)

        for (const height of [9, 10, 11, 12]) {
            renderer.sync(updateTreeParameters(scene, assetId, {height}, STYLE), STYLE, 'lit')
        }

        expect(builds).toHaveLength(1)
        expect(builds[0].parameters.tree.height).toBe(9)

        builds.shift()!.finish(new THREE.BufferGeometry())
        await flush()

        expect(builds).toHaveLength(1)
        expect(builds[0].parameters.tree.height).toBe(12)
    })

    it('still shows a change that needs no new bark at once', async () => {
        const {builds, renderer, scene, assetId} = setUp()

        await finishWarmUp(builds)

        const leavesBefore = clumpMesh(renderer)

        renderer.sync(updateTreeParameters(scene, assetId, {fullness: 1.2}, STYLE), STYLE, 'lit')

        expect(builds).toHaveLength(0)
        expect(clumpMesh(renderer)).not.toBe(leavesBefore)
    })

    it('rebuilds in place if the workers fail', async () => {
        const {builds, renderer, scene, assetId} = setUp()

        await finishWarmUp(builds)

        const barkBefore = renderer.get('cmp-bark-0')!.mesh.geometry

        vi.mocked(paintedBarkGenerator.buildOffThread!).mockImplementationOnce(() => Promise.reject(new Error('no')))
        renderer.sync(updateTreeParameters(scene, assetId, {height: 11}, STYLE), STYLE, 'lit')
        await flush()

        expect(renderer.get('cmp-bark-0')!.mesh.geometry).not.toBe(barkBefore)
    })
})
