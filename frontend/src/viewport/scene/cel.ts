/**
 * The Comic view, often called cel shading: flat colours, hard shadows that deepen rather than
 * grey, and bold lines, as in a comic or an anime-style game.
 *
 * Like the Cartoon view, this is how an engine would draw the prop, so none of
 * it reaches the file. The painted grain a prop carries for the lit view is
 * set aside here: each part keeps only its few main colours.
 */

import * as THREE from 'three'
import type {GeneratedPart} from '../../assets/shared/generator-types'

/** Shadow and lit. Two steps read as cel; a third starts to read as painted. */
const BANDS = [80, 255]

/**
 * Where the light falls between the shadow colour and the lit colour, measured
 * as how bright a point is next to its own colour. Tuned by eye.
 */
const SHADE_LEVEL = 0.55
const LIT_LEVEL = 1.05

/** How much richer colours are than the painted ones. */
const VIVID = 1.2

/**
 * How far a leaf card's light follows the round shape of its whole clump
 * rather than its own small lumps, which would speckle light and shade.
 */
const ROUNDING = 0.85

/** Tones nearer than this count as one colour. Grain and shade fall within it; a flower does not. */
export const SAME_COLOUR = 0.3

const MAX_TONES = 6
const ROUNDS = 8

let gradient: THREE.DataTexture | null = null

function bandTexture(): THREE.DataTexture {
    if (!gradient) {
        gradient = new THREE.DataTexture(new Uint8Array(BANDS), BANDS.length, 1, THREE.RedFormat)
        gradient.minFilter = THREE.NearestFilter
        gradient.magFilter = THREE.NearestFilter
        gradient.generateMipmaps = false
        gradient.needsUpdate = true
    }

    return gradient
}

const distanceSquared = (a: ArrayLike<number>, ai: number, b: ArrayLike<number>, bi: number) =>
    (a[ai] - b[bi]) ** 2 + (a[ai + 1] - b[bi + 1]) ** 2 + (a[ai + 2] - b[bi + 2]) ** 2

/** How much brightness counts next to hue when deciding two tones are one colour. */
const BRIGHTNESS_WEIGHT = 0.3

/**
 * How different two tones look as colours. Brightness counts for little: a
 * dark inner leaf and a sunny outer one are the same orange, and the Comic view
 * draws light and shade itself. A flower is a different hue and stays apart.
 */
function toneDistance(a: readonly number[], b: readonly number[]): number {
    const sumA = a[0] + a[1] + a[2] + 1e-4
    const sumB = b[0] + b[1] + b[2] + 1e-4
    const hue = Math.hypot(a[0] / sumA - b[0] / sumB, a[1] / sumA - b[1] / sumB, a[2] / sumA - b[2] / sumB)

    return Math.hypot(hue, ((sumA - sumB) / 3) * BRIGHTNESS_WEIGHT)
}

/**
 * A part's painted colours, each moved to the nearest of the part's few main
 * colours.
 *
 * The main colours are found by grouping, then groups closer than
 * `SAME_COLOUR` are joined. A clump of leaves with grain becomes one colour,
 * while a bush keeps its flowers apart from its leaves.
 */
export function flattenColours(colours: ArrayLike<number>): Float32Array {
    const count = Math.floor(colours.length / 3)
    const flat = new Float32Array(count * 3)

    if (count === 0) {
        return flat
    }

    // Start from the colours most unlike each other, so a few flowers among
    // many leaves still get a tone of their own.
    let tones: number[][] = [[colours[0], colours[1], colours[2]]]
    const gap = new Float32Array(count).fill(Infinity)

    while (tones.length < MAX_TONES) {
        const latest = tones[tones.length - 1]
        let farthest = -1
        let farthestGap = 1e-6

        for (let index = 0; index < count; index++) {
            gap[index] = Math.min(gap[index], distanceSquared(colours, index * 3, latest, 0))
            if (gap[index] > farthestGap) {
                farthestGap = gap[index]
                farthest = index
            }
        }

        if (farthest < 0) {
            break
        }

        tones.push([colours[farthest * 3], colours[farthest * 3 + 1], colours[farthest * 3 + 2]])
    }

    const nearestTone = (index: number) => {
        let best = 0
        let bestDistance = Infinity

        for (let tone = 0; tone < tones.length; tone++) {
            const d = distanceSquared(colours, index * 3, tones[tone], 0)
            if (d < bestDistance) {
                bestDistance = d
                best = tone
            }
        }

        return best
    }

    const settle = () => {
        for (let round = 0; round < ROUNDS; round++) {
            const sums = tones.map(() => [0, 0, 0, 0])

            for (let index = 0; index < count; index++) {
                const sum = sums[nearestTone(index)]
                sum[0] += colours[index * 3]
                sum[1] += colours[index * 3 + 1]
                sum[2] += colours[index * 3 + 2]
                sum[3] += 1
            }

            tones = sums.filter((sum) => sum[3] > 0).map((sum) => [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3], sum[3]])
        }
    }

    settle()

    // Join tones that are really one colour with grain, weighted by how much of the part each covers.
    let joined = true
    while (joined && tones.length > 1) {
        joined = false

        for (let a = 0; a < tones.length && !joined; a++) {
            for (let b = a + 1; b < tones.length && !joined; b++) {
                if (toneDistance(tones[a], tones[b]) < SAME_COLOUR) {
                    const wa = tones[a][3]
                    const wb = tones[b][3]
                    const w = wa + wb
                    const mixed = [0, 1, 2].map((k) => (tones[a][k] * wa + tones[b][k] * wb) / w)
                    // The darker half is shade painted in for the lit view, and the Comic
                    // view draws shade itself, so the joined tone keeps the lighter half's brightness.
                    const brighter = Math.max(tones[a][0] + tones[a][1] + tones[a][2], tones[b][0] + tones[b][1] + tones[b][2])
                    const lift = brighter / Math.max(mixed[0] + mixed[1] + mixed[2], 1e-4)
                    tones[a] = [...mixed.map((value) => Math.min(value * lift, 1)), w]
                    tones.splice(b, 1)
                    joined = true
                }
            }
        }
    }

    for (let index = 0; index < count; index++) {
        const tone = tones[nearestTone(index)]
        flat[index * 3] = tone[0]
        flat[index * 3 + 1] = tone[1]
        flat[index * 3 + 2] = tone[2]
    }

    return flat
}

/** Gives a part's shape its flattened colours once, the first time the Comic view shows it. */
export function ensureFlatColours(geometry: THREE.BufferGeometry): void {
    const colour = geometry.getAttribute('color')

    if (!colour || geometry.getAttribute('celColor')) {
        return
    }

    const values = new Float32Array(colour.count * 3)
    for (let index = 0; index < colour.count; index++) {
        values[index * 3] = colour.getX(index)
        values[index * 3 + 1] = colour.getY(index)
        values[index * 3 + 2] = colour.getZ(index)
    }

    geometry.setAttribute('celColor', new THREE.BufferAttribute(flattenColours(values), 3))
}

export function createCelMaterial(
    part: GeneratedPart,
    color: THREE.ColorRepresentation,
    flatShading: boolean,
): THREE.MeshToonMaterial {
    const surface = part.surface
    const material = new THREE.MeshToonMaterial({
        color: new THREE.Color(color),
        gradientMap: bandTexture(),
        vertexColors: surface?.vertexColors ?? false,
        map: surface?.map ?? null,
        alphaTest: surface?.alphaTest ?? 0,
    })

    Object.assign(material, {flatShading: surface ? false : flatShading})
    material.userData.celCentre = {value: new THREE.Vector3()}
    material.userData.celRound = surface?.map && (surface.alphaTest ?? 0) > 0 ? ROUNDING : 0

    return material
}

/**
 * The Comic version of a material the view already draws with, such as the
 * scenery's. It is finished, so give it no wind afterwards.
 */
export function celFromStandard(standard: THREE.MeshStandardMaterial, geometry: THREE.BufferGeometry): THREE.MeshToonMaterial {
    const material = new THREE.MeshToonMaterial({
        color: standard.color,
        gradientMap: bandTexture(),
        vertexColors: standard.vertexColors,
        map: standard.map,
        alphaTest: standard.alphaTest,
        side: standard.side,
    })

    material.userData.celCentre = {value: new THREE.Vector3()}
    material.userData.celRound = standard.map && standard.alphaTest > 0 ? ROUNDING : 0
    if (standard.vertexColors) {
        ensureFlatColours(geometry)
    }
    centreCelLight(material, geometry)
    addCelLook(material)

    return material
}

/** Where a part's leaves take their round light from: the middle of its shape. */
export function centreCelLight(material: THREE.MeshToonMaterial, geometry: THREE.BufferGeometry): void {
    if (!geometry.boundingSphere) {
        geometry.computeBoundingSphere()
    }

    material.userData.celCentre.value.copy(geometry.boundingSphere!.center)
}

const CEL_COLOUR_VARYING = '#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )\n    flat varying vec4 vColor;\n#endif'

/**
 * Turns a toon material into the cel look. Call it after anything else that
 * changes the material's shader, such as the wind, which it keeps.
 */
export function addCelLook(material: THREE.Material): void {
    const before = material.onBeforeCompile
    const beforeKey = material.customProgramCacheKey.bind(material)

    material.onBeforeCompile = (shader, renderer) => {
        before.call(material, shader, renderer)
        shader.uniforms.celShade = {value: SHADE_LEVEL}
        shader.uniforms.celLit = {value: LIT_LEVEL}
        shader.uniforms.celVivid = {value: VIVID}
        shader.uniforms.celCentre = material.userData.celCentre ?? {value: new THREE.Vector3()}
        shader.uniforms.celRound = {value: material.userData.celRound ?? 0}
        shader.uniforms.celLeaves = {value: material.userData.celRound > 0 ? 1 : 0}
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nattribute vec3 celColor;\nuniform vec3 celCentre;\nuniform float celRound;')
            // One colour per face: a part's main colours meet at a crisp edge,
            // where blending between points would grade moss into stone.
            .replace(
                '#include <color_pars_vertex>',
                CEL_COLOUR_VARYING.replace(
                    'defined( USE_COLOR_ALPHA )',
                    'defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )',
                ),
            )
            .replace(
                '#include <beginnormal_vertex>',
                '#include <beginnormal_vertex>\nif (celRound > 0.0) {\n    objectNormal = normalize(mix(objectNormal, normalize(position - celCentre), celRound));\n}',
            )
            .replace(
                '#include <color_vertex>',
                '#include <color_vertex>\n#ifdef USE_COLOR\n    vColor.rgb = celColor;\n#endif',
            )
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <color_pars_fragment>', CEL_COLOUR_VARYING)
            .replace(
                '#include <common>',
                '#include <common>\nuniform float celShade;\nuniform float celLit;\nuniform float celVivid;\nuniform float celLeaves;',
            )
            // A leaf texture keeps its cut-out shape, but not its grain. Other
            // textures, such as the moss on a rock, are the colours themselves.
            .replace(
                '#include <map_fragment>',
                '#ifdef USE_MAP\n    vec4 celSample = texture2D(map, vMapUv);\n    diffuseColor *= celLeaves > 0.0 ? vec4(1.0, 1.0, 1.0, celSample.a) : celSample;\n#endif',
            )
            .replace(
                '#include <opaque_fragment>',
                /* glsl */ `
                vec3 celWeights = vec3(0.2126, 0.7152, 0.0722);
                vec3 celBase = diffuseColor.rgb;
                vec3 celRich = max(mix(vec3(dot(celBase, celWeights)), celBase, celVivid), 0.0);
                float celLight = dot(outgoingLight - totalEmissiveRadiance, celWeights) / max(dot(celBase, celWeights), 0.0001);
                // One sharp step: the sky's soft fill would otherwise grade each band.
                float celMiddle = (celShade + celLit) * 0.5;
                float celAmount = smoothstep(celMiddle - 0.03, celMiddle + 0.03, celLight);
                // Shade deepens a colour and makes it richer, as a painter would, rather than greying it.
                vec3 celShadow = pow(celRich, vec3(1.7)) * 0.8;
                outgoingLight = mix(celShadow, celRich, celAmount) + totalEmissiveRadiance;
                #include <opaque_fragment>`,
            )
    }
    material.customProgramCacheKey = () => `cel-${beforeKey()}`
}
