import * as THREE from 'three'
import {afterEach, describe, expect, it} from 'vitest'
import godotLeaves from '../../engine-kits/godot/leaves.gdshader?raw'
import godotWood from '../../engine-kits/godot/wood.gdshader?raw'
import {getStyleProfile} from '../assets/style/style-profiles'
import {WIND_MOTION} from '../core/export/pipeline/wind'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {useSettingsStore} from '../store/settings-store'
import {useUiStore, windWanted} from '../store/ui-store'
import {createComponentRenderer} from '../viewport/scene/component-renderer'
import {LIVE_WIND_VERTEX} from '../viewport/scene/live-wind'

const STYLE = getStyleProfile('detailed')

/** The uniforms a part's lit material would hand its shader. */
function windOf(renderer: ReturnType<typeof createComponentRenderer>) {
    const material = renderer.all()[0].materials.lit
    const shader = {uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>'} as unknown as THREE.WebGLProgramParametersWithUniforms

    material.onBeforeCompile(shader, undefined as never)

    return {
        strength: (shader.uniforms.windStrength as THREE.IUniform<number>).value,
        vertexShader: shader.vertexShader,
    }
}

const kitDefault = (text: string, name: string) => Number(new RegExp(`uniform float ${name} = ([0-9.]+);`).exec(text)?.[1])

describe('wind in the view', () => {
    afterEach(() => {
        useSettingsStore.getState().setValue('wind', false)
        useUiStore.setState({windChosen: false})
    })

    it("moves by the Godot kit's own numbers", () => {
        for (const kit of [godotWood, godotLeaves]) {
            expect(kitDefault(kit, 'sway_strength')).toBe(WIND_MOTION.swayStrength)
            expect(kitDefault(kit, 'sway_speed')).toBe(WIND_MOTION.swaySpeed)
            expect(kit).toContain(`uniform vec3 wind_direction = vec3(${WIND_MOTION.direction.map((n) => n.toFixed(1)).join(', ')});`)
        }

        expect(kitDefault(godotLeaves, 'flutter_strength')).toBe(WIND_MOTION.flutterStrength)
        expect(kitDefault(godotLeaves, 'flutter_speed')).toBe(WIND_MOTION.flutterSpeed)
    })

    it('weighs each point as the export does', () => {
        expect(LIVE_WIND_VERTEX).toContain('pow(clamp(windAt.y / windHeight, 0.0, 1.0), 1.5) * (0.6 + 0.4 * windOut)')
        expect(LIVE_WIND_VERTEX).toContain('WIND_FOLIAGE * (0.5 + 0.5 * windOut)')
    })

    it('leaves the prop exactly as it was while off', () => {
        const renderer = createComponentRenderer()

        renderer.sync(createSceneFromPreset('round-bush'), STYLE, 'lit')

        const {strength, vertexShader} = windOf(renderer)

        expect(strength).toBe(0)
        expect(vertexShader).toContain('if (windStrength > 0.0)')
    })

    it('moves a bush, but never a rock', () => {
        const bush = createComponentRenderer()
        const rock = createComponentRenderer()

        bush.sync(createSceneFromPreset('round-bush'), STYLE, 'lit')
        rock.sync(createSceneFromPreset('boulder'), STYLE, 'lit')
        bush.setWind(1, 2)
        rock.setWind(1, 2)

        expect(windOf(bush).strength).toBe(1)
        expect(windOf(rock).strength).toBe(0)
    })

    it('holds still in the Wind view, which shows the numbers', () => {
        const renderer = createComponentRenderer()

        renderer.sync(createSceneFromPreset('round-bush'), STYLE, 'wind')
        renderer.setWind(1, 2)

        expect(windOf(renderer).strength).toBe(0)
    })

    it('flutters leaves, while wood only sways', () => {
        const renderer = createComponentRenderer()

        renderer.sync(createSceneFromPreset('round-canopy'), STYLE, 'lit')

        const flutter = (role: string) => {
            const part = renderer.all().find(({mesh}) => mesh.userData.role === role)!
            const shader = {uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>'} as unknown as THREE.WebGLProgramParametersWithUniforms

            part.materials.lit.onBeforeCompile(shader, undefined as never)

            return shader.vertexShader.includes('#define WIND_FOLIAGE 1.0')
        }

        expect(flutter('foliage')).toBe(true)
        expect(flutter('solid')).toBe(false)
    })

    it('waits to be switched on again when the computer asks for less motion', () => {
        useSettingsStore.getState().setValue('wind', true)
        expect(windWanted()).toBe(true)

        useSettingsStore.getState().setValue('reduceMotion', true)
        expect(windWanted()).toBe(false)

        useUiStore.getState().setWind(true)
        expect(windWanted()).toBe(true)

        useSettingsStore.getState().setValue('reduceMotion', false)
    })
})
