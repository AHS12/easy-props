/**
 * Dark lines around shapes, drawn over the finished picture.
 *
 * Each part is drawn a second time, off screen, in a colour of its own. A
 * line goes wherever that colour changes and the part on the other side is
 * nearer. So a leaf crown gets a line around its outside, and between one
 * clump and the clump in front of it, but none among its own leaves, which a
 * line around each shape could never manage for cut-out leaf cards.
 *
 * The line always falls on the farther side, so a twig keeps its own colour
 * with a line beside it, rather than turning into one.
 */

import * as THREE from 'three'
import {VIEWPORT_COLORS} from './materials'

/** Line widths in screen pixels: the outside of a shape, and where shapes overlap. */
export const OUTER_LINE = 2
export const INNER_LINE = 1.25

/** Gaps in a crown narrower than this many pixels go without a line. */
export const HOLE_REACH = 5

/**
 * The colour index the ground shares with grass and flowers. Nothing standing on
 * it is ringed tuft by tuft, and the far edge of the ground against the sky
 * gets no line.
 */
export const LAND_ID = 0xfffff0

const ID_VERTEX = /* glsl */ `
    #include <common>
    uniform mat3 idUvTransform;
    varying vec2 vIdUv;

    void main() {
        vIdUv = (idUvTransform * vec3(uv, 1.0)).xy;
        #include <begin_vertex>
        #include <project_vertex>
    }
`

const ID_FRAGMENT = /* glsl */ `
    uniform vec3 idColor;
    uniform sampler2D idMap;
    uniform float idAlphaTest;
    varying vec2 vIdUv;

    void main() {
        #ifdef ID_CUT_OUT
            // A cut-out leaf is only its painted shape, here as on screen.
            if (texture2D(idMap, vIdUv).a < idAlphaTest) discard;
        #endif
        gl_FragColor = vec4(idColor, 1.0);
    }
`

/** The colour that stands for the n-th part, in 8-bit steps so it survives the trip exactly. */
export function idColour(index: number): THREE.Color {
    const n = (index % 0xfffffe) + 1

    return new THREE.Color((n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255)
}

/** What a part is drawn with in the off-screen pass. It takes `addLiveWind` like any other. */
export function createIdMaterial(
    index: number,
    map: THREE.Texture | null,
    alphaTest: number,
    side: THREE.Side,
): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
        vertexShader: ID_VERTEX,
        fragmentShader: ID_FRAGMENT,
        uniforms: {
            idColor: {value: idColour(index)},
            idMap: {value: map},
            idAlphaTest: {value: alphaTest},
            idUvTransform: {value: map?.matrix ?? new THREE.Matrix3()},
        },
        side,
        toneMapped: false,
    })

    setIdMap(material, map)

    return material
}

/** Gives the off-screen material a new texture, as a part's mesh is swapped. */
export function setIdMap(material: THREE.ShaderMaterial, map: THREE.Texture | null): void {
    const cutOut = map !== null && material.uniforms.idAlphaTest.value > 0

    if (cutOut !== ('ID_CUT_OUT' in material.defines)) {
        material.defines = cutOut ? {ID_CUT_OUT: ''} : {}
        material.needsUpdate = true
    }

    material.uniforms.idMap.value = map
    material.uniforms.idUvTransform.value = map?.matrix ?? new THREE.Matrix3()
}

const QUAD_VERTEX = /* glsl */ `
    varying vec2 vUv;

    void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`

const SAMPLES = 12

const QUAD_FRAGMENT = /* glsl */ `
    uniform sampler2D ids;
    uniform sampler2D depths;
    uniform vec2 texel;
    uniform float outerLine;
    uniform float innerLine;
    uniform float holeReach;
    uniform vec3 ink;
    uniform vec3 land;
    uniform float strength;
    varying vec2 vUv;

    void main() {
        vec3 id = texture2D(ids, vUv).rgb;
        float depth = texture2D(depths, vUv).r;
        bool open = depth >= 1.0;
        float reach = open ? outerLine : innerLine;
        float hits = 0.0;
        float nearest = 1.0;

        for (int ring = 1; ring <= 2; ring++) {
            float radius = reach * float(ring) * 0.5;

            for (int i = 0; i < ${SAMPLES}; i++) {
                float angle = (float(i) + float(ring) * 0.5) * ${((Math.PI * 2) / SAMPLES).toFixed(6)};
                vec2 at = vUv + vec2(cos(angle), sin(angle)) * radius * texel;
                vec3 other = texture2D(ids, at).rgb;
                float otherDepth = texture2D(depths, at).r;

                // Only the farther side takes the line, so it sits beside a shape, not on it.
                bool horizon = open && distance(other, land) < 0.5 / 255.0;

                if (distance(other, id) > 0.5 / 255.0 && otherDepth < depth && !horizon) {
                    hits += 1.0;
                    nearest = min(nearest, otherDepth);
                }
            }
        }

        if (hits == 0.0) discard;

        // A gap among leaves, where something farther shows through, is ringed by
        // the nearer shape all round. A real edge has it on one side only. Lines
        // around every gap would speckle a crown, so gaps go without.
        float around = 0.0;

        for (int i = 0; i < 8; i++) {
            float angle = float(i) * ${(Math.PI / 4).toFixed(6)};
            vec2 at = vUv + vec2(cos(angle), sin(angle)) * holeReach * texel;

            if (distance(texture2D(ids, at).rgb, id) > 0.5 / 255.0 && texture2D(depths, at).r < depth) {
                around += 1.0;
            }
        }

        if (around >= 7.0) discard;

        // A few hits is the soft end of a line, which keeps it from looking stepped.
        gl_FragColor = vec4(ink, clamp(hits / 6.0, 0.0, 1.0) * strength);
        #include <colorspace_fragment>
        // At the depth of what it outlines, so anything in front still hides it.
        gl_FragDepth = nearest;
    }
`

/** How a view draws its lines. */
export interface LineStyle {
    /** Width, where 1 is the usual. */
    readonly weight: number
    /** How dark, from 0 for none to 1 for solid ink. */
    readonly strength: number
}

export interface InkLines {
    /**
     * Draws the lines over what is already on screen.
     *
     * @param drawIds Draws every outlined part in its own colour, to the target.
     */
    draw(renderer: THREE.WebGLRenderer, camera: THREE.Camera, drawIds: () => void, style?: LineStyle): void
    dispose(): void
}

export function createInkLines(): InkLines {
    const target = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        generateMipmaps: false,
        depthBuffer: true,
    })
    target.depthTexture = new THREE.DepthTexture(1, 1)

    const material = new THREE.ShaderMaterial({
        vertexShader: QUAD_VERTEX,
        fragmentShader: QUAD_FRAGMENT,
        uniforms: {
            ids: {value: target.texture},
            depths: {value: target.depthTexture},
            texel: {value: new THREE.Vector2()},
            outerLine: {value: OUTER_LINE},
            innerLine: {value: INNER_LINE},
            holeReach: {value: HOLE_REACH},
            ink: {value: new THREE.Color(VIEWPORT_COLORS.ink)},
            land: {value: idColour(LAND_ID)},
            strength: {value: 1},
        },
        transparent: true,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
    quad.frustumCulled = false
    const quadScene = new THREE.Scene()
    quadScene.add(quad)

    const size = new THREE.Vector2()
    const clearColour = new THREE.Color()

    return {
        draw(renderer, camera, drawIds, {weight, strength} = {weight: 1, strength: 1}) {
            renderer.getDrawingBufferSize(size)

            if (target.width !== size.x || target.height !== size.y) {
                target.setSize(size.x, size.y)
            }

            const pixelRatio = renderer.getPixelRatio() * weight
            material.uniforms.texel.value.set(1 / size.x, 1 / size.y)
            material.uniforms.outerLine.value = OUTER_LINE * pixelRatio
            material.uniforms.innerLine.value = INNER_LINE * pixelRatio
            material.uniforms.holeReach.value = HOLE_REACH * pixelRatio
            material.uniforms.strength.value = strength

            const previousTarget = renderer.getRenderTarget()
            const previousAlpha = renderer.getClearAlpha()
            const previousAutoClear = renderer.autoClear
            renderer.getClearColor(clearColour)

            renderer.setRenderTarget(target)
            renderer.setClearColor(0x000000, 1)
            renderer.clear()
            // Each piece draws in a pass of its own, and none may wipe the last.
            renderer.autoClear = false
            drawIds()
            renderer.autoClear = previousAutoClear

            renderer.setRenderTarget(previousTarget)
            renderer.setClearColor(clearColour, previousAlpha)
            renderer.autoClear = false
            renderer.render(quadScene, camera)
            renderer.autoClear = previousAutoClear
        },

        dispose() {
            target.depthTexture?.dispose()
            target.dispose()
            quad.geometry.dispose()
            material.dispose()
        },
    }
}
