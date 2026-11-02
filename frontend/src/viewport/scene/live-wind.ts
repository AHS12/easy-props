/**
 * Wind in the view: the prop moves as the engine kits' materials will move it.
 *
 * The movement is added to the materials the view already draws with, so
 * lighting, cut-out leaves and painted colours stay as they are. Each point is
 * weighed as the export weighs it, then moved by the Godot kit's sums, so what
 * is seen here is what the kit does with the file.
 */

import * as THREE from 'three'
import {WIND_MOTION} from '../../core/export/pipeline/wind'
import type {WindUniforms} from './wind-material'

export interface LiveWindUniforms {
    readonly time: THREE.IUniform<number>
    /** 0 holds the prop still. 1 is the kit's own strength. */
    readonly strength: THREE.IUniform<number>
}

export function createLiveWindUniforms(): LiveWindUniforms {
    return {time: {value: 0}, strength: {value: 0}}
}

const float = (value: number) => value.toFixed(4)
const [dx, dy, dz] = WIND_MOTION.direction

/** The weights repeat `windWeight`, and the movement the kit's `vertex()`. */
export const LIVE_WIND_VERTEX = /* glsl */ `
    if (windStrength > 0.0) {
        vec4 windWorld = modelMatrix * vec4(transformed, 1.0);
        vec3 windAt = windWorld.xyz - windPivot;
        float windOut = clamp(length(windAt.xz) / windReach, 0.0, 1.0);
        float windSway = pow(clamp(windAt.y / windHeight, 0.0, 1.0), 1.5) * (0.6 + 0.4 * windOut);
        float windFlutter = WIND_FOLIAGE * (0.5 + 0.5 * windOut);
        float windPhase = windPivot.x * 0.37 + windPivot.z * 0.53;
        float windWave = sin(windTime * ${float(WIND_MOTION.swaySpeed)} + windPhase)
            + 0.4 * sin(windTime * ${float(WIND_MOTION.swaySpeed * 2.3)} + windPhase);
        vec3 windPush = normalize(vec3(${float(dx)}, ${float(dy)}, ${float(dz)})) * windWave * windSway * ${float(WIND_MOTION.swayStrength)};
        transformed += (inverse(modelMatrix) * vec4(windPush * windStrength, 0.0)).xyz;
        float windLocal = windWorld.x * 3.1 + windWorld.y * 2.3 + windWorld.z * 3.7;
        transformed += normal * sin(windTime * ${float(WIND_MOTION.flutterSpeed)} + windLocal) * windFlutter
            * ${float(WIND_MOTION.flutterStrength)} * windStrength;
    }
`

const HEADER = /* glsl */ `
    uniform vec3 windPivot;
    uniform float windHeight;
    uniform float windReach;
    uniform float windTime;
    uniform float windStrength;
`

/** Makes a material move with the wind. Leaves flutter as well as sway; wood only sways. */
export function addLiveWind(
    material: THREE.Material,
    measured: WindUniforms,
    live: LiveWindUniforms,
    foliage: boolean,
): void {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.windPivot = measured.pivot
        shader.uniforms.windHeight = measured.height
        shader.uniforms.windReach = measured.reach
        shader.uniforms.windTime = live.time
        shader.uniforms.windStrength = live.strength
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${HEADER}`)
            .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>\n#define WIND_FOLIAGE ${foliage ? '1.0' : '0.0'}\n${LIVE_WIND_VERTEX}`,
            )
    }
    // Leaves and wood compile differently, so they cannot share a program.
    material.customProgramCacheKey = () => (foliage ? 'live-wind-leaves' : 'live-wind')
}

/** What a part's shadow is drawn with, so the shadow moves with it. */
export function createLiveWindDepthMaterial(
    measured: WindUniforms,
    live: LiveWindUniforms,
    foliage: boolean,
    map: THREE.Texture | null,
    alphaTest: number,
): THREE.MeshDepthMaterial {
    const material = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking, map, alphaTest})

    addLiveWind(material, measured, live, foliage)

    return material
}
