/**
 * The Wind shading mode: the numbers an export writes, drawn on the prop.
 *
 * The shader repeats `windWeight` from the export pipeline, because it has to
 * read a position after the part's own transform. A test holds the two together.
 */

import * as THREE from 'three'
import type {PaintedSurface, PropGenerator} from '../../assets/shared/generator-types'

export interface WindUniforms {
    readonly pivot: THREE.IUniform<THREE.Vector3>
    readonly height: THREE.IUniform<number>
    readonly reach: THREE.IUniform<number>
}

export function createWindUniforms(): WindUniforms {
    return {pivot: {value: new THREE.Vector3()}, height: {value: 1}, reach: {value: 1}}
}

export const WIND_VERTEX = /* glsl */ `
    varying vec3 vPlaced;
    varying vec2 vUv;

    void main() {
        #ifdef HAS_UV
        vUv = uv;
        #else
        vUv = vec2(0.0);
        #endif
        vec4 placed = modelMatrix * vec4(position, 1.0);
        vPlaced = placed.xyz;
        gl_Position = projectionMatrix * viewMatrix * placed;
    }
`

export const WIND_FRAGMENT = /* glsl */ `
    uniform vec3 pivot;
    uniform float height;
    uniform float reach;
    uniform sampler2D cutOut;
    uniform float cutOff;
    uniform float foliage;
    varying vec3 vPlaced;
    varying vec2 vUv;

    void main() {
        if (cutOff > 0.0 && texture2D(cutOut, vUv).a < cutOff) discard;
        vec3 at = vPlaced - pivot;
        float outward = clamp(length(at.xz) / reach, 0.0, 1.0);
        float sway = pow(clamp(at.y / height, 0.0, 1.0), 1.5) * (0.6 + 0.4 * outward);
        float flutter = foliage * (0.5 + 0.5 * outward);
        gl_FragColor = vec4(sway, flutter, 0.15, 1.0);
        #include <colorspace_fragment>
    }
`

export function createWindMaterial(
    shared: WindUniforms,
    foliage: boolean,
    surface: PaintedSurface | undefined,
): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: WIND_VERTEX,
        fragmentShader: WIND_FRAGMENT,
        defines: surface?.map ? {HAS_UV: 1} : {},
        uniforms: {
            ...shared,
            cutOut: {value: surface?.map ?? null},
            cutOff: {value: surface?.map ? (surface.alphaTest ?? 0) : 0},
            foliage: {value: foliage ? 1 : 0},
        },
    })
}

/** Sizes the heatmap to the prop on show. A proxy has no say: it is never drawn. */
export function measureWind(
    uniforms: WindUniforms,
    rendered: Iterable<{readonly mesh: THREE.Mesh}>,
    generator: PropGenerator | undefined,
    asset: {readonly parameters: unknown; readonly seed: number},
): void {
    const box = new THREE.Box3()
    const part = new THREE.Box3()

    for (const {mesh} of rendered) {
        if (mesh.userData.isProxy) {
            continue
        }

        mesh.updateWorldMatrix(true, false)
        mesh.geometry.computeBoundingBox()
        part.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld)
        box.union(part)
    }

    if (box.isEmpty()) {
        return
    }

    const validated = generator?.validate(asset.parameters).parameters
    const pivot = (validated && generator?.pivot?.(validated, asset.seed)) ?? [0, 0, 0]

    uniforms.pivot.value.set(pivot[0], pivot[1], pivot[2])
    uniforms.height.value = Math.max(box.max.y - pivot[1], 1e-3)
    uniforms.reach.value = Math.max(
        Math.hypot(box.max.x - pivot[0], box.max.z - pivot[2]),
        Math.hypot(box.min.x - pivot[0], box.min.z - pivot[2]),
        1e-3,
    )
}
