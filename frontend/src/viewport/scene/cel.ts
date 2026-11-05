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
import {COMIC_LOOK, FLAT_COLOURS} from '../../assets/style/toon-looks'

const {sameColour: SAME_COLOUR, brightnessWeight: BRIGHTNESS_WEIGHT, lean: LEAN, maxTones: MAX_TONES, rounds: ROUNDS} = FLAT_COLOURS

/** Writes a number into a shader, where a whole number would be read as an integer. */
const glsl = (value: number) => value.toFixed(4)

let gradient: THREE.DataTexture | null = null

function bandTexture(): THREE.DataTexture {
    if (!gradient) {
        const bands = Uint8Array.from(COMIC_LOOK.bands, (band) => Math.round(band * 255))
        gradient = new THREE.DataTexture(bands, bands.length, 1, THREE.RedFormat)
        gradient.minFilter = THREE.NearestFilter
        gradient.magFilter = THREE.NearestFilter
        gradient.generateMipmaps = false
        gradient.needsUpdate = true
    }

    return gradient
}

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
 * `FLAT_COLOURS.sameColour` are joined. A clump of leaves with grain becomes one colour,
 * while a bush keeps its flowers apart from its leaves.
 *
 * A picture of a whole prop is not joined: the blended colours where leaves
 * meet the trunk would join tone to tone until the trunk was green.
 */
export function flattenColours(colours: ArrayLike<number>, join = true): Float32Array {
    const count = Math.floor(colours.length / 3)
    const flat = new Float32Array(count * 3)

    if (count === 0) {
        return flat
    }

    // Grouped by colour, with brightness counting for little, as tones are
    // joined. Grouped by plain distance, a dark brown trunk and a dark green
    // leaf would share a group and come out olive.
    const features = new Float32Array(count * 4)
    for (let index = 0; index < count; index++) {
        const r = colours[index * 3]
        const g = colours[index * 3 + 1]
        const b = colours[index * 3 + 2]
        const sum = r + g + b + 1e-4
        features.set([r / sum, g / sum, b / sum, (sum / 3) * BRIGHTNESS_WEIGHT], index * 4)
    }

    const featureGap = (index: number, centre: ArrayLike<number>) =>
        (features[index * 4] - centre[0]) ** 2 +
        (features[index * 4 + 1] - centre[1]) ** 2 +
        (features[index * 4 + 2] - centre[2]) ** 2 +
        (features[index * 4 + 3] - centre[3]) ** 2

    // Start from the colours most unlike each other, so a few flowers among
    // many leaves still get a tone of their own.
    let centres: Float32Array[] = [features.slice(0, 4)]
    const gap = new Float32Array(count).fill(Infinity)

    while (centres.length < MAX_TONES) {
        const latest = centres[centres.length - 1]
        let farthest = -1
        let farthestGap = 1e-6

        for (let index = 0; index < count; index++) {
            gap[index] = Math.min(gap[index], featureGap(index, latest))
            if (gap[index] > farthestGap) {
                farthestGap = gap[index]
                farthest = index
            }
        }

        if (farthest < 0) {
            break
        }

        centres.push(features.slice(farthest * 4, farthest * 4 + 4))
    }

    const nearestCentre = (index: number) => {
        let best = 0
        let bestDistance = Infinity

        for (let centre = 0; centre < centres.length; centre++) {
            const d = featureGap(index, centres[centre])
            if (d < bestDistance) {
                bestDistance = d
                best = centre
            }
        }

        return best
    }

    let tones: number[][] = []

    for (let round = 0; round < ROUNDS; round++) {
        // Each group's colour, its place in the grouping, and how much of the part it covers.
        const sums = centres.map(() => new Float64Array(8))

        for (let index = 0; index < count; index++) {
            const sum = sums[nearestCentre(index)]
            for (let k = 0; k < 3; k++) {
                sum[k] += colours[index * 3 + k]
            }
            for (let k = 0; k < 4; k++) {
                sum[3 + k] += features[index * 4 + k]
            }
            sum[7] += 1
        }

        const used = sums.filter((sum) => sum[7] > 0)
        centres = used.map((sum) => Float32Array.from([sum[3], sum[4], sum[5], sum[6]], (value) => value / sum[7]))
        tones = used.map((sum) => [sum[0] / sum[7], sum[1] / sum[7], sum[2] / sum[7], sum[7]])
    }

    // Join tones that are really one colour with grain, weighted by how much of the part each covers.
    let joined = join
    while (joined && tones.length > 1) {
        joined = false

        for (let a = 0; a < tones.length && !joined; a++) {
            for (let b = a + 1; b < tones.length && !joined; b++) {
                if (toneDistance(tones[a], tones[b]) < SAME_COLOUR) {
                    const wa = tones[a][3]
                    const wb = tones[b][3]
                    const w = wa + wb
                    const sumA = tones[a][0] + tones[a][1] + tones[a][2]
                    const sumB = tones[b][0] + tones[b][1] + tones[b][2]
                    const lighter = sumA >= sumB ? tones[a] : tones[b]
                    // The darker half is shade painted in for the lit view, and the Comic
                    // view draws shade itself, so the joined tone keeps the lighter half's
                    // brightness, and leans to its colour. Stone is painted deep blue in
                    // shade and pale on top, and an even mix lifted to the top's
                    // brightness is a vivid blue that the rock never shows.
                    const mixed = [0, 1, 2].map((k) => ((tones[a][k] * wa + tones[b][k] * wb) / w) * (1 - LEAN) + lighter[k] * LEAN)
                    const lift = Math.max(sumA, sumB) / Math.max(mixed[0] + mixed[1] + mixed[2], 1e-4)
                    tones[a] = [...mixed.map((value) => Math.min(value * lift, 1)), w]
                    tones.splice(b, 1)
                    joined = true
                }
            }
        }
    }

    // Matched by colour as the joining was, not by plain distance, or a dark
    // green leaf would land on the brown of the trunk.
    const nearestColour = (index: number) => {
        const colour = [colours[index * 3], colours[index * 3 + 1], colours[index * 3 + 2]]
        let best = tones[0]
        let bestDistance = Infinity

        for (const tone of tones) {
            const d = toneDistance(colour, tone)
            if (d < bestDistance) {
                bestDistance = d
                best = tone
            }
        }

        return best
    }

    for (let index = 0; index < count; index++) {
        const tone = nearestColour(index)
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
    material.userData.celRound = surface?.map && (surface.alphaTest ?? 0) > 0 ? COMIC_LOOK.rounding : 0

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
    material.userData.celRound = standard.map && standard.alphaTest > 0 ? COMIC_LOOK.rounding : 0
    if (standard.vertexColors) {
        ensureFlatColours(geometry)
    }
    centreCelLight(material, geometry)
    addCelLook(material)

    return material
}

/**
 * The Comic version of a far-away card. Its picture is cut to a few flat
 * colours, as the prop's own parts are, and its relief keeps the light falling
 * across the crown, so the shadow side is a hard band. Give it wind, then
 * `addCelLook`.
 */
export function celCardFromStandard(standard: THREE.MeshStandardMaterial): THREE.MeshToonMaterial {
    const material = new THREE.MeshToonMaterial({
        color: standard.color,
        gradientMap: bandTexture(),
        map: standard.map instanceof THREE.DataTexture ? flattenPicture(standard.map, standard.alphaTest) : standard.map,
        normalMap: standard.normalMap,
        alphaTest: standard.alphaTest,
        side: standard.side,
    })

    material.userData.celCentre = {value: new THREE.Vector3()}
    material.userData.celRound = 0

    return material
}

const toLinear = (byte: number) => {
    const value = byte / 255

    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

const toByte = (linear: number) => {
    const value = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055

    return Math.round(Math.min(Math.max(value, 0), 1) * 255)
}

/**
 * A copy of a picture with each shown pixel moved to one of its few main
 * colours, found as for a part's painted colours. The cut-away pixels keep
 * theirs, so the edge of the shape blends as it did.
 */
export function flattenPicture(picture: THREE.DataTexture, cutoff: number): THREE.DataTexture {
    const {data, width, height} = picture.image as {data: Uint8Array; width: number; height: number}
    const shown: number[] = []
    const colours: number[] = []

    for (let index = 0; index < width * height; index++) {
        if (data[index * 4 + 3] >= cutoff * 255) {
            shown.push(index)
            colours.push(toLinear(data[index * 4]), toLinear(data[index * 4 + 1]), toLinear(data[index * 4 + 2]))
        }
    }

    const flat = flattenColours(colours, false)
    const pixels = new Uint8Array(data)

    shown.forEach((index, at) => {
        pixels[index * 4] = toByte(flat[at * 3])
        pixels[index * 4 + 1] = toByte(flat[at * 3 + 1])
        pixels[index * 4 + 2] = toByte(flat[at * 3 + 2])
    })

    const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat)
    texture.colorSpace = picture.colorSpace
    texture.wrapS = picture.wrapS
    texture.wrapT = picture.wrapT
    texture.magFilter = picture.magFilter
    texture.minFilter = picture.minFilter
    texture.generateMipmaps = picture.generateMipmaps
    texture.flipY = picture.flipY
    texture.needsUpdate = true

    return texture
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
        shader.uniforms.celShade = {value: COMIC_LOOK.shadeLevel}
        shader.uniforms.celLit = {value: COMIC_LOOK.litLevel}
        shader.uniforms.celVivid = {value: COMIC_LOOK.vivid}
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
                /* glsl */ `
                #ifdef USE_MAP
                    vec4 celSample = texture2D(map, vMapUv);
                    float celPrintTop = max(max(celSample.r, celSample.g), celSample.b);
                    float celPrintBottom = min(min(celSample.r, celSample.g), celSample.b);
                    if (celLeaves > 0.0) {
                        celSample.rgb = vec3(1.0);
                    }
                    #ifndef USE_ALPHATEST
                        // A grey print, such as the strokes on bark, is set in two flat
                        // tones: its strokes are faint grain in this view otherwise. A
                        // cut-out picture, such as a far-away card, is its own colours.
                        else if (celPrintTop - celPrintBottom < ${glsl(COMIC_LOOK.greyPrint)}) {
                            celSample.rgb = vec3(celPrintTop < ${glsl(COMIC_LOOK.strokeLevel)} ? ${glsl(COMIC_LOOK.strokeTone)} : 1.0);
                        }
                    #endif
                    diffuseColor *= celSample;
                #endif`,
            )
            .replace(
                '#include <opaque_fragment>',
                /* glsl */ `
                vec3 celWeights = vec3(0.2126, 0.7152, 0.0722);
                vec3 celBase = diffuseColor.rgb;
                float celBaseLuma = max(dot(celBase, celWeights), 0.0001);
                vec3 celLightColour = outgoingLight - totalEmissiveRadiance;
                float celLight = dot(celLightColour, celWeights) / celBaseLuma;
                // A grey stone with a faint cool cast should stay grey. Richer colour
                // and deeper shade would turn that cast into blue, so they are kept
                // for colours that are clearly colours.
                float celTop = max(max(celBase.r, celBase.g), celBase.b);
                float celSaturation = (celTop - min(min(celBase.r, celBase.g), celBase.b)) / max(celTop, 0.0001);
                float celColourful = smoothstep(${glsl(COMIC_LOOK.colourful[0])}, ${glsl(COMIC_LOOK.colourful[1])}, celSaturation);
                vec3 celRich = max(mix(vec3(celBaseLuma), celBase, mix(1.0, celVivid, celColourful)), 0.0);
                // The lit view's sun is warm, and that warmth is what makes a cool
                // stone read as grey there, so the lit side keeps the light's tint.
                vec3 celTint = celLightColour / max(celBase, vec3(0.02));
                celTint = clamp(celTint / max(dot(celTint, celWeights), 0.0001), ${glsl(COMIC_LOOK.tintRange[0])}, ${glsl(COMIC_LOOK.tintRange[1])});
                // One sharp step: the sky's soft fill would otherwise grade each band.
                float celMiddle = (celShade + celLit) * 0.5;
                float celAmount = smoothstep(celMiddle - ${glsl(COMIC_LOOK.stepSoftness)}, celMiddle + ${glsl(COMIC_LOOK.stepSoftness)}, celLight);
                // Shade deepens a colour and makes it richer, as a painter would,
                // rather than greying it. A grey only darkens.
                float celRichLuma = max(dot(celRich, celWeights), 0.0001);
                vec3 celShadow = mix(celRich * pow(celRichLuma, ${glsl(COMIC_LOOK.greyShadowDepth)}), pow(celRich, vec3(${glsl(COMIC_LOOK.shadowDepth)})), celColourful) * ${glsl(COMIC_LOOK.shadowDarkness)};
                outgoingLight = mix(celShadow, celRich * mix(vec3(1.0), celTint, ${glsl(COMIC_LOOK.tint)}), celAmount) + totalEmissiveRadiance;
                #include <opaque_fragment>`,
            )
    }
    material.customProgramCacheKey = () => `cel-${beforeKey()}`
}
