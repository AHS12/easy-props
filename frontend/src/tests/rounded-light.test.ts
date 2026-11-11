import {createHash} from 'node:crypto'
import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {cutRockDefaults, cutRockGenerator, type CutRockParameters} from '../assets/rocks/cut-rock-generator'
import {damageRock} from '../assets/rocks/rock-damage'
import {buildRockMesh} from '../assets/rocks/rock-mesh'
import {planRock} from '../assets/rocks/rock-plan'
import {findPreset, presetGroups} from '../assets/trees/presets'
import {parseProject, serializeProject} from '../core/project/project-document'
import {createSceneFromPreset} from '../core/scene/initial-scene'

const rockPresets = presetGroups.filter((group) => group.family === 'rock').flatMap((group) => group.presets)

function rockOf(id: string, changes: Partial<CutRockParameters> = {}, detail = 1) {
    const preset = findPreset(id)!
    const rock = {...(preset.parameters as unknown as CutRockParameters), ...changes}

    return buildRockMesh(damageRock(planRock(rock, preset.seed), rock, preset.seed), rock, preset.seed, detail)
}

const facesOf = (geometry: THREE.BufferGeometry) => geometry.index!.count / 3

/** Every number the rock is built from, so any change at all shows. */
function fingerprint(geometry: THREE.BufferGeometry): string {
    const hash = createHash('sha1')

    for (const name of Object.keys(geometry.attributes)) {
        hash.update(name + Buffer.from(new Float32Array(geometry.getAttribute(name).array).buffer).toString('hex'))
    }

    hash.update(Buffer.from(new Uint32Array(geometry.index!.array).buffer).toString('hex'))

    return hash.digest('hex')
}

describe('rounded light on rocks', () => {
    it('is on for new rocks, and hidden on a low-poly one', () => {
        expect(cutRockDefaults.rounded).toBe(0.5)

        const keys = (build: string) => cutRockGenerator.shownControls!({...cutRockDefaults, build}).map((spec) => spec.key)

        expect(keys('painted')).toContain('rounded')
        expect(keys('low-poly')).not.toContain('rounded')
    })

    it('at 0 builds a rock exactly as it was before Rounded light existed', () => {
        // Taken from the rocks as they were built before, at every level.
        expect(fingerprint(rockOf('boulder', {rounded: 0}))).toBe('0366de1122e02e56693e8c80974116b905baa5f8')
        expect(fingerprint(rockOf('boulder', {rounded: 0}, 0.5))).toBe('7a15fb5df2f5ea4304961fc6419d832f37407669')
        expect(fingerprint(rockOf('boulder', {rounded: 0}, 0.2))).toBe('8830f0b4d889ede088a3bd6e789e6dfc0a4ac83f')
        expect(fingerprint(rockOf('cracked-boulder', {rounded: 0}))).toBe('507a45b9194f6894d9e9cf432c954e03f7107f23')
        expect(fingerprint(rockOf('cliff-face', {rounded: 0}))).toBe('62b56ae6d78f9a04e3dda50ddf6cd92465704c76')
    })

    it('rolls the light across a face, where before it was one direction', () => {
        const spread = (rounded: number) => {
            const normal = rockOf('boulder', {rounded}).getAttribute('normal')
            const directions = new Set<string>()

            for (let index = 0; index < normal.count; index++) {
                directions.add([normal.getX(index), normal.getY(index), normal.getZ(index)].map((value) => value.toFixed(2)).join())
            }

            return directions.size
        }

        expect(spread(0.5)).toBeGreaterThan(spread(0) * 2)
    })

    it('keeps the outline where it was', () => {
        const boxOf = (rounded: number) => {
            const geometry = rockOf('boulder', {rounded})

            geometry.computeBoundingBox()

            return geometry.boundingBox!
        }
        const before = boxOf(0)
        const after = boxOf(0.5)

        for (const axis of ['x', 'y', 'z'] as const) {
            expect(Math.abs(after.max[axis] - before.max[axis])).toBeLessThan(0.1)
            expect(Math.abs(after.min[axis] - before.min[axis])).toBeLessThan(0.1)
        }
    })

    it.each(rockPresets.map((preset) => preset.id))('costs %s little more, and steps down at lighter levels', (id) => {
        const before = facesOf(rockOf(id, {rounded: 0}))
        const after = facesOf(rockOf(id))

        expect(after).toBeLessThan(before * 2.6)
        // At game distance it costs no more than an edged rock always did.
        expect(facesOf(rockOf(id, {}, 0.4))).toBeLessThanOrEqual(before)
        expect(facesOf(rockOf(id, {}, 0.4))).toBeLessThan(after)
        expect(facesOf(rockOf(id, {}, 0.12))).toBeLessThan(facesOf(rockOf(id, {}, 0.4)))
    })
})

describe('a rock saved before rounded light', () => {
    it('opens with none, so it is built exactly as it was', () => {
        const scene = createSceneFromPreset('boulder')
        const document = JSON.parse(serializeProject({scene, style: 'low-poly'})) as {
            scene: {assets: {parameters: Record<string, unknown>; components: {parameters: {rock?: Record<string, unknown>}}[]}[]}
        }

        for (const asset of document.scene.assets) {
            delete asset.parameters.rounded

            for (const component of asset.components) {
                delete component.parameters.rock?.rounded
            }
        }

        const [asset] = parseProject(JSON.stringify(document)).scene.assets

        expect(asset.parameters.rounded).toBe(0)
        expect((asset.components[0].parameters as {rock: {rounded: number}}).rock.rounded).toBe(0)
    })

    it('keeps the rounded light of a rock saved with it', () => {
        const [asset] = parseProject(serializeProject({scene: createSceneFromPreset('boulder'), style: 'low-poly'})).scene.assets

        expect(asset.parameters.rounded).toBe(0.5)
    })
})
