import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {getStyleProfile} from '../assets/style/style-profiles'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {createComponentRenderer} from '../viewport/scene/component-renderer'
import {cartoonLevel} from '../viewport/scene/cartoon'
import {flattenColours, flattenPicture} from '../viewport/scene/cel'
import {createIdMaterial, idColour, LAND_ID, setIdMap} from '../viewport/scene/ink-lines'
import {createMeadowScenery} from '../viewport/scene/meadow-scenery'

const STYLE = getStyleProfile('low-poly')

const compile = (material: THREE.Material) => {
    const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>',
    } as unknown as THREE.WebGLProgramParametersWithUniforms

    material.onBeforeCompile(shader, undefined as never)

    return shader.vertexShader
}

describe('the cartoon view', () => {
    it('draws every part in hard bands of light', () => {
        const renderer = createComponentRenderer()

        renderer.sync(createSceneFromPreset('round-canopy'), STYLE, 'cartoon')

        for (const part of renderer.all()) {
            expect(part.mesh.material).toBeInstanceOf(THREE.MeshToonMaterial)
        }
    })
})

describe('finding where the lines go', () => {
    it('gives every part a colour of its own', () => {
        const renderer = createComponentRenderer()

        renderer.sync(createSceneFromPreset('blossom-tree'), STYLE, 'cartoon')

        const colours = renderer.all().map((part) => part.materials.id.uniforms.idColor.value.getHexString())

        expect(new Set(colours).size).toBe(colours.length)
    })

    it('never gives a part the colour of empty sky', () => {
        expect(idColour(0).getHex()).not.toBe(0)
        expect(idColour(0xfffffe).getHex()).not.toBe(0)
    })

    it('keeps a cut-out leaf to its painted shape, so a crown is outlined and not its cards', () => {
        const map = new THREE.Texture()
        const leaf = createIdMaterial(1, map, 0.5, THREE.DoubleSide)
        const bark = createIdMaterial(2, null, 0, THREE.FrontSide)

        expect(leaf.defines).toHaveProperty('ID_CUT_OUT')
        expect(bark.defines).not.toHaveProperty('ID_CUT_OUT')

        setIdMap(leaf, null)
        expect(leaf.defines).not.toHaveProperty('ID_CUT_OUT')
    })

    it('moves each part with the wind, so its lines stay on it', () => {
        const renderer = createComponentRenderer()

        renderer.sync(createSceneFromPreset('round-canopy'), STYLE, 'cartoon')

        expect(compile(renderer.all()[0].materials.id)).toContain('windStrength > 0.0')
    })

    it('puts every part back as it was after drawing the colours', () => {
        const renderer = createComponentRenderer()

        renderer.sync(createSceneFromPreset('round-canopy'), STYLE, 'cartoon')

        const before = renderer.all().map((part) => part.mesh.material)
        const drawn: THREE.Material[] = []
        const fake = {
            render: () => {
                drawn.push(...renderer.all().map((part) => part.mesh.material as THREE.Material))
            },
        } as unknown as THREE.WebGLRenderer

        renderer.drawIds(fake, new THREE.PerspectiveCamera())

        expect(drawn.every((material) => material instanceof THREE.ShaderMaterial)).toBe(true)
        expect(renderer.all().map((part) => part.mesh.material)).toEqual(before)
    })
})

describe('cel shading colours', () => {
    const tones = (flat: Float32Array) => {
        const found = new Set<string>()

        for (let index = 0; index < flat.length; index += 3) {
            found.add(`${flat[index].toFixed(3)},${flat[index + 1].toFixed(3)},${flat[index + 2].toFixed(3)}`)
        }

        return found
    }

    it('turns the light and dark grain of one leaf colour into a single flat colour', () => {
        const colours: number[] = []

        for (let index = 0; index < 60; index++) {
            const light = 0.5 + (index % 7) / 14
            colours.push(0.9 * light, 0.35 * light, 0.05 * light)
        }

        expect(tones(flattenColours(colours)).size).toBe(1)
    })

    it('keeps flowers apart from the leaves around them', () => {
        const colours: number[] = []

        for (let index = 0; index < 60; index++) {
            colours.push(...(index % 5 === 0 ? [0.95, 0.4, 0.6] : [0.2, 0.55, 0.15]))
        }

        expect(tones(flattenColours(colours)).size).toBe(2)
    })

    it('keeps a dark brown trunk apart from dark green leaves', () => {
        const colours: number[] = []

        for (let index = 0; index < 300; index++) {
            const light = 0.3 + (index % 10) / 14
            colours.push(...(index % 15 === 0 ? [0.12 * light, 0.05 * light, 0.02 * light] : [0.1 * light, 0.4 * light, 0.03 * light]))
        }

        const flat = flattenColours(colours)
        let brown = 0

        for (let index = 0; index < flat.length; index += 3) {
            if (flat[index] > flat[index + 1]) {
                brown++
            }
        }

        expect(brown).toBe(20)
    })

    it('cuts a far-away picture to a few flat colours and keeps its trunk brown', () => {
        const size = 16
        const pixels = new Uint8Array(size * size * 4)

        for (let index = 0; index < size * size; index++) {
            const trunk = index % size < 3
            const grain = (index * 7) % 40
            pixels.set(trunk ? [110, 70, 40, 255] : [90 + grain, 170 + grain, 50, 255], index * 4)
        }

        const flat = flattenPicture(new THREE.DataTexture(pixels, size, size), 0.5)
        const data = flat.image.data as Uint8Array
        const found = new Set<string>()

        for (let index = 0; index < size * size; index++) {
            found.add(`${data[index * 4]},${data[index * 4 + 1]},${data[index * 4 + 2]}`)
            if (index % size < 3) {
                expect(data[index * 4]).toBeGreaterThan(data[index * 4 + 1])
            }
        }

        expect(found.size).toBeLessThanOrEqual(6)
    })

    it('makes every part look the same in the cel view whatever was drawn before', () => {
        const renderer = createComponentRenderer()

        renderer.sync(createSceneFromPreset('blossom-tree'), STYLE, 'cel')

        for (const part of renderer.all()) {
            expect(part.mesh.material).toBe(part.materials.cel)

            if (part.mesh.geometry.getAttribute('color')) {
                expect(part.mesh.geometry.getAttribute('celColor')).toBeDefined()
            }
        }
    })
})

describe('the cartoon and comic views in the demo scenes', () => {
    const meshes = (scenery: ReturnType<typeof createMeadowScenery>) => {
        const found: THREE.Mesh[] = []

        scenery.group.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                found.push(object)
            }
        })

        return found
    }

    it('draws the meadow as the prop is drawn, and back again', () => {
        const scenery = createMeadowScenery()
        const lit = meshes(scenery).map((mesh) => mesh.material)

        scenery.setLook('cel')
        expect(meshes(scenery).every((mesh) => mesh.material instanceof THREE.MeshToonMaterial)).toBe(true)

        scenery.setLook('lit')
        expect(meshes(scenery).map((mesh) => mesh.material)).toEqual(lit)
        scenery.dispose()
    })

    it('counts grass and flowers as ground, so the meadow is not ringed tuft by tuft', () => {
        const scenery = createMeadowScenery()
        const colours = new Map<THREE.Mesh, string>()
        const fake = {
            render: () => {
                for (const mesh of meshes(scenery)) {
                    colours.set(mesh, (mesh.material as THREE.ShaderMaterial).uniforms.idColor.value.getHexString())
                }
            },
        } as unknown as THREE.WebGLRenderer

        scenery.drawIds(fake, new THREE.PerspectiveCamera())

        const land = idColour(LAND_ID).getHexString()
        const patches = meshes(scenery).filter((mesh) => mesh instanceof THREE.InstancedMesh)
        const standing = meshes(scenery).filter((mesh) => !(mesh instanceof THREE.InstancedMesh))

        expect(patches.every((mesh) => colours.get(mesh) === land)).toBe(true)
        expect(standing.every((mesh) => colours.get(mesh) !== land)).toBe(true)
        expect(meshes(scenery).every((mesh) => !(mesh.material instanceof THREE.ShaderMaterial))).toBe(true)
        scenery.dispose()
    })
})

describe('the soft cartoon light', () => {
    it('keeps flat bands with short soft steps between them', () => {
        expect(cartoonLevel(0.1)).toBeCloseTo(cartoonLevel(0.2), 3)
        expect(cartoonLevel(0.9)).toBeCloseTo(1, 3)
        expect(cartoonLevel(0.3)).toBeGreaterThan(cartoonLevel(0.2))
        expect(cartoonLevel(0.3)).toBeLessThan(cartoonLevel(0.45))
    })
})
