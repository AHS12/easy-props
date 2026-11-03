/**
 * Drawing the far-away card's pictures with WebGL.
 *
 * It borrows the thumbnails' renderer, as a browser keeps only a few contexts
 * alive, and draws into a target of its own so the canvas is never touched.
 * Each view is drawn at twice the size and shrunk, which softens its edges into
 * a see-through amount an engine can cut out cleanly.
 */

import * as THREE from 'three'
import {getRenderer} from './tree-thumbnail'
import {FAR_VIEWS, finishPictures, type FarFrame, type FarPainter} from './pipeline/far'
import type {MergedMesh} from './pipeline/merge'

const SUPERSAMPLE = 2

const VERTEX = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vColour;
    varying vec3 vNormal;

    void main() {
        vUv = uv;
        vColour = color;
        vNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`

/** The prop's own colours, unlit, since the engine lights the card. */
const COLOUR = /* glsl */ `
    uniform sampler2D map;
    uniform float cutoff;
    varying vec2 vUv;
    varying vec3 vColour;

    vec3 toSrgb(vec3 linear) {
        return mix(linear * 12.92, 1.055 * pow(linear, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, linear));
    }

    void main() {
        vec4 texel = texture2D(map, vUv);

        if (texel.a < cutoff) {
            discard;
        }

        gl_FragColor = vec4(toSrgb(clamp(texel.rgb * vColour, 0.0, 1.0)), 1.0);
    }
`

/** Which way the surface faces, against the card side's own right, up and out. */
const RELIEF = /* glsl */ `
    uniform sampler2D map;
    uniform float cutoff;
    uniform vec3 right;
    uniform vec3 facing;
    varying vec2 vUv;
    varying vec3 vNormal;

    void main() {
        if (texture2D(map, vUv).a < cutoff) {
            discard;
        }

        // Not flipped for the side seen: leaves carry soft directions out of their clump,
        // whichever way each card happens to face, and wood shows only its outside.
        vec3 normal = normalize(vNormal);
        vec3 local = vec3(dot(normal, right), normal.y, dot(normal, facing));

        // Nothing on a card can face away from whoever sees it.
        local.z = max(local.z, 0.1);
        gl_FragColor = vec4(normalize(local) * 0.5 + 0.5, 1.0);
    }
`

/** Averages each block of samples, by how solid each is, so edges don't darken. */
function shrinkInto(
    source: Uint8Array,
    sourceSize: number,
    target: Uint8Array,
    targetSize: number,
    left: number,
    bottom: number,
    keepAlpha: boolean,
): void {
    const cell = sourceSize / SUPERSAMPLE

    for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
            const sum = [0, 0, 0]
            let weight = 0

            for (let dy = 0; dy < SUPERSAMPLE; dy++) {
                for (let dx = 0; dx < SUPERSAMPLE; dx++) {
                    const at = ((y * SUPERSAMPLE + dy) * sourceSize + x * SUPERSAMPLE + dx) * 4
                    const alpha = source[at + 3] / 255

                    sum[0] += source[at] * alpha
                    sum[1] += source[at + 1] * alpha
                    sum[2] += source[at + 2] * alpha
                    weight += alpha
                }
            }

            const at = ((bottom + y) * targetSize + left + x) * 4

            for (let channel = 0; channel < 3; channel++) {
                target[at + channel] = weight > 0 ? Math.round(sum[channel] / weight) : 0
            }

            target[at + 3] = keepAlpha ? Math.round((weight / (SUPERSAMPLE * SUPERSAMPLE)) * 255) : 0
        }
    }
}

function pictureMaterial(fragment: string, mesh: MergedMesh, extra: Record<string, THREE.IUniform> = {}): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: fragment,
        vertexColors: true,
        side: THREE.DoubleSide,
        uniforms: {
            map: {value: mesh.material.map},
            // Wood has no cut-out, but nothing is drawn where nothing is.
            cutoff: {value: Math.max(mesh.material.alphaTest, 1e-3)},
            ...extra,
        },
    })
}

export const webglFarPainter: FarPainter = {
    async paint(meshes, frame: FarFrame, viewSize) {
        const renderer = getRenderer()

        if (!renderer || renderer.getContext().isContextLost()) {
            return null
        }

        const drawn = viewSize * SUPERSAMPLE
        const size = viewSize * 2
        const colour = new Uint8Array(size * size * 4)
        const relief = new Uint8Array(size * size * 4)
        const samples = new Uint8Array(drawn * drawn * 4)
        const target = new THREE.WebGLRenderTarget(drawn, drawn, {depthBuffer: true})
        const scene = new THREE.Scene()
        const right = {value: new THREE.Vector3()}
        const facing = {value: new THREE.Vector3()}
        const colourMaterials = meshes.map((mesh) => pictureMaterial(COLOUR, mesh))
        const reliefMaterials = meshes.map((mesh) => pictureMaterial(RELIEF, mesh, {right, facing}))
        const drawnMeshes = meshes.map((mesh) => new THREE.Mesh(mesh.geometry, colourMaterials[0]))
        const distance = frame.reach + 1
        const camera = new THREE.OrthographicCamera(-frame.reach, frame.reach, frame.top, frame.bottom, 0.01, distance + frame.reach + 1)
        const clearColour = renderer.getClearColor(new THREE.Color())
        const clearAlpha = renderer.getClearAlpha()
        const previousTarget = renderer.getRenderTarget()

        scene.add(...drawnMeshes)

        try {
            renderer.setClearColor(0x000000, 0)

            for (const view of FAR_VIEWS) {
                const [x, , z] = view.facing

                camera.position.set(x * distance, 0, z * distance)
                camera.up.set(0, 1, 0)
                camera.lookAt(0, 0, 0)
                camera.updateProjectionMatrix()
                right.value.set(...view.right)
                facing.value.set(...view.facing)

                for (const [pass, materials, picture] of [
                    ['colour', colourMaterials, colour],
                    ['relief', reliefMaterials, relief],
                ] as const) {
                    drawnMeshes.forEach((mesh, index) => (mesh.material = materials[index]))
                    renderer.setRenderTarget(target)
                    renderer.clear()
                    renderer.render(scene, camera)
                    renderer.readRenderTargetPixels(target, 0, 0, drawn, drawn, samples)
                    shrinkInto(samples, drawn, picture, size, view.cell[0] * viewSize, view.cell[1] * viewSize, pass === 'colour')
                }
            }
        } catch {
            return null
        } finally {
            renderer.setRenderTarget(previousTarget)
            renderer.setClearColor(clearColour, clearAlpha)
            scene.clear()
            target.dispose()

            for (const material of [...colourMaterials, ...reliefMaterials]) {
                material.dispose()
            }
        }

        finishPictures(colour, relief, size)

        return {size, colour, relief}
    },
}
