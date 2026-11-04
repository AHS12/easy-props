import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {getStyleProfile} from '../assets/style/style-profiles'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {INK_SHARE, measureThickness, takesInk} from '../viewport/scene/cartoon'
import {createComponentRenderer} from '../viewport/scene/component-renderer'

const STYLE = getStyleProfile('low-poly')

const compile = (material: THREE.Material) => {
    const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>',
    } as unknown as THREE.WebGLProgramParametersWithUniforms

    material.onBeforeCompile(shader, undefined as never)

    return shader.vertexShader
}

describe('the cartoon edge on thin shapes', () => {
    it('knows a twig is only as thick as it is wide', () => {
        const twig = new THREE.CylinderGeometry(0.02, 0.02, 1, 8, 4, true)
        const thickness = measureThickness(twig)

        for (const value of thickness) {
            expect(value).toBeCloseTo(0.04, 2)
        }
    })

    it('treats a trunk as thick, so its edge keeps its full width', () => {
        const trunk = new THREE.CylinderGeometry(0.5, 0.5, 4, 12, 4, true)

        expect(Math.min(...measureThickness(trunk))).toBeGreaterThan(0.3)
    })

    it('gives grass and fern leaves no edge, since their light points at the sky', () => {
        const geometry = new THREE.BufferGeometry()

        expect(takesInk({geometry, material: 'painted', role: 'foliage', surface: {vertexColors: true}})).toBe(false)
        expect(takesInk({geometry, material: 'painted', role: 'solid', surface: {vertexColors: true}})).toBe(true)
        expect(takesInk({geometry, material: 'leaves'})).toBe(true)
    })

    it('keeps the edge narrower than the shape under it', () => {
        expect(INK_SHARE).toBeLessThan(0.5)
    })
})

describe('the cartoon view', () => {
    it('draws every part in hard bands of light', () => {
        const renderer = createComponentRenderer()

        renderer.sync(createSceneFromPreset('round-canopy'), STYLE, 'cartoon')

        for (const part of renderer.all()) {
            expect(part.mesh.material).toBeInstanceOf(THREE.MeshToonMaterial)
        }
    })

    it('shows the dark edge only in the cartoon view', () => {
        const renderer = createComponentRenderer()
        const scene = createSceneFromPreset('round-canopy')
        const inked = () => renderer.all().filter((part) => part.ink?.visible)

        renderer.sync(scene, STYLE, 'cartoon')
        expect(inked().length).toBeGreaterThan(0)

        renderer.sync(scene, STYLE, 'lit')
        expect(inked()).toHaveLength(0)
    })

    it('keeps the edge on a part as it sways in the wind', () => {
        const renderer = createComponentRenderer()

        renderer.sync(createSceneFromPreset('round-canopy'), STYLE, 'cartoon')

        const shader = compile(renderer.all().find((part) => part.ink)!.ink!.material as THREE.Material)

        expect(shader.indexOf('windStrength > 0.0')).toBeGreaterThan(-1)
        expect(shader.indexOf('inkPush')).toBeGreaterThan(shader.indexOf('windStrength > 0.0'))
    })

    it('leaves the part itself where it is, so it never hides behind its own edge', () => {
        const renderer = createComponentRenderer()

        renderer.sync(createSceneFromPreset('round-canopy'), STYLE, 'cartoon')

        expect(compile(renderer.all()[0].materials.cartoon)).not.toContain('inkPush')
    })
})
