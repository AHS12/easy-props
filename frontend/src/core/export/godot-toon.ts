/**
 * Godot materials for the Cartoon and Comic looks, written from the numbers the
 * view draws them with, so a prop in Godot looks as it did in the app.
 *
 * Each keeps the wind of the lit material it is made from, and replaces how
 * light falls: Cartoon in soft bands, Comic in one hard step to a deeper,
 * richer shadow colour. Lines come from a separate full-screen effect.
 */

import godotLeaves from '../../../engine-kits/godot/leaves.gdshader?raw'
import godotWood from '../../../engine-kits/godot/wood.gdshader?raw'
import {CARTOON_LOOK, COMIC_LOOK, INK_LINES} from '../../assets/style/toon-looks'

type Material = 'wood' | 'leaves'
type ToonLook = 'cartoon' | 'cel'

/** A number as Godot's shading language wants it: always with a point, so it is never read as whole. */
const number = (value: number) => {
    const text = String(Math.round(value * 10000) / 10000)

    return text.includes('.') ? text : `${text}.0`
}

const linearColour = (hex: string) => {
    const channel = (at: number) => {
        const value = parseInt(hex.slice(at, at + 2), 16) / 255

        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }

    return `vec3(${[1, 3, 5].map((at) => number(channel(at))).join(', ')})`
}

const LIT: Readonly<Record<Material, string>> = {wood: godotWood, leaves: godotLeaves}

/** The lit material's settings and wind, without its opening note or its colour. */
function windPart(material: Material): string {
    const body = LIT[material]
        .split('\n')
        .filter((line) => !line.startsWith('//'))
        .join('\n')

    return body.slice(0, body.indexOf('void fragment()')).trimEnd()
}

const CARTOON_LIGHT = /* glsl */ `
// The share of the light a surface turned this far toward it gets: flat bands
// joined by short soft steps.
float cartoon_level(float facing) {
	float level = ${number(CARTOON_LOOK.levels[0])};
${CARTOON_LOOK.steps
        .map((step, index) => {
            const rise = CARTOON_LOOK.levels[index + 1] - CARTOON_LOOK.levels[index]
            const half = CARTOON_LOOK.softness / 2

            return `\tlevel += ${number(rise)} * smoothstep(${number(step - half)}, ${number(step + half)}, facing);`
        })
        .join('\n')}
	return level;
}

void light() {
	DIFFUSE_LIGHT += cartoon_level(dot(NORMAL, LIGHT) * 0.5 + 0.5) * ATTENUATION * LIGHT_COLOR / PI;
}
`

const CARTOON_FRAGMENT: Readonly<Record<Material, string>> = {
    wood: /* glsl */ `
void fragment() {
	ALBEDO = COLOR.rgb * texture(bark_texture, UV).rgb;
	NORMAL_MAP = texture(relief_texture, UV).rgb;
	NORMAL_MAP_DEPTH = relief_strength;
}
`,
    leaves: /* glsl */ `
void fragment() {
	vec4 dab = texture(dab_texture, UV);
	ALBEDO = COLOR.rgb * dab.rgb;
	ALPHA = dab.a;
	ALPHA_SCISSOR_THRESHOLD = cut_off;
}
`,
}

const COMIC_SETTINGS = /* glsl */ `
uniform float colour_boost : hint_range(1.0, 2.0) = ${number(COMIC_LOOK.vivid)};
uniform float shadow_darkness : hint_range(0.0, 1.0) = ${number(COMIC_LOOK.shadowDarkness)};

const vec3 WEIGHTS = vec3(0.2126, 0.7152, 0.0722);

// One colour per face, so a part's flat colours meet at a crisp edge.
varying flat vec3 face_colour;
// The shadow colour as a share of the lit one, handed from fragment() to light().
varying vec3 shade_share;
`

const COMIC_COLOURS = /* glsl */ `
// Colours are made richer, and shade deepens them rather than greying them, as a
// painter would. A grey only darkens: richer colour would turn a faint cast blue.
float colourful(vec3 base) {
	float top = max(max(base.r, base.g), base.b);
	float saturation = (top - min(min(base.r, base.g), base.b)) / max(top, 0.0001);
	return smoothstep(${number(COMIC_LOOK.colourful[0])}, ${number(COMIC_LOOK.colourful[1])}, saturation);
}

vec3 rich_colour(vec3 base) {
	float luma = dot(base, WEIGHTS);
	return max(mix(vec3(luma), base, mix(1.0, colour_boost, colourful(base))), 0.0);
}

vec3 shadow_colour(vec3 rich) {
	float luma = max(dot(rich, WEIGHTS), 0.0001);
	vec3 grey = rich * pow(luma, ${number(COMIC_LOOK.greyShadowDepth)});
	return mix(grey, pow(rich, vec3(${number(COMIC_LOOK.shadowDepth)})), colourful(rich)) * shadow_darkness;
}

void light() {
	vec3 sun = LIGHT_COLOR / PI;
	float strength = dot(sun, WEIGHTS);
	vec3 tinted = mix(vec3(strength), sun, ${number(COMIC_LOOK.tint)});
	// One sharp step from shadow to lit, where the surface turns away or a shadow falls.
	float lit = smoothstep(-${number(COMIC_LOOK.stepSoftness)}, ${number(COMIC_LOOK.stepSoftness)}, dot(NORMAL, LIGHT)) * step(0.5, ATTENUATION);
	if (LIGHT_IS_DIRECTIONAL) {
		DIFFUSE_LIGHT += mix(shade_share * strength, tinted, lit);
	} else {
		DIFFUSE_LIGHT += tinted * lit * ATTENUATION;
	}
}
`

const COMIC_FRAGMENT: Readonly<Record<Material, string>> = {
    // A grey print, such as the strokes on bark, is set in two flat tones. Other
    // prints, such as moss on a rock, are the colours themselves. The relief is
    // left out: Comic draws its shapes flat.
    wood: /* glsl */ `
vec3 two_tone(vec3 print) {
	float top = max(max(print.r, print.g), print.b);
	if (top - min(min(print.r, print.g), print.b) < ${number(COMIC_LOOK.greyPrint)}) {
		return vec3(top < ${number(COMIC_LOOK.strokeLevel)} ? ${number(COMIC_LOOK.strokeTone)} : 1.0);
	}
	return print;
}

void fragment() {
	vec3 rich = rich_colour(face_colour * two_tone(texture(bark_texture, UV).rgb));
	ALBEDO = rich;
	shade_share = shadow_colour(rich) / max(rich, vec3(0.001));
	SPECULAR = 0.0;
}
`,
    // The leaf picture keeps its cut-out shape, but not its grain.
    leaves: /* glsl */ `
void fragment() {
	vec3 rich = rich_colour(face_colour);
	ALBEDO = rich;
	ALPHA = texture(dab_texture, UV).a;
	ALPHA_SCISSOR_THRESHOLD = cut_off;
	shade_share = shadow_colour(rich) / max(rich, vec3(0.001));
	SPECULAR = 0.0;
}
`,
}

const NOTES: Readonly<Record<ToonLook, Record<Material, string>>> = {
    cartoon: {
        wood: '// easy-props wood, Cartoon look: light falls in soft bands. Wind as in wood.gdshader.',
        leaves: '// easy-props leaves, Cartoon look: light falls in soft bands. Wind as in leaves.gdshader.',
    },
    cel: {
        wood: '// easy-props wood, Comic look: flat colours and one hard step to a deeper shadow colour.\n// Use it with props exported with Look: Comic. Wind as in wood.gdshader.',
        leaves: '// easy-props leaves, Comic look: flat colours and one hard step to a deeper shadow colour.\n// Use it with props exported with Look: Comic. Wind as in leaves.gdshader.',
    },
}

/** A Cartoon or Comic material for wood or leaves, as Godot shader text. */
export function godotToonShader(look: ToonLook, material: Material): string {
    const header = NOTES[look][material]

    if (look === 'cartoon') {
        return `${header}\n${windPart(material)}\n${CARTOON_FRAGMENT[material]}${CARTOON_LIGHT}`
    }

    // The settings go before vertex(), which hands each face its colour.
    const wind = windPart(material).replace('void vertex() {', `${COMIC_SETTINGS.trim()}\n\nvoid vertex() {\n\tface_colour = COLOR.rgb;`)

    return `${header}\n${wind}\n${COMIC_COLOURS}${COMIC_FRAGMENT[material]}`
}

/**
 * Dark lines around shapes, drawn over the whole picture. Like the app's, a
 * line goes on the farther side of an edge, and gaps among leaves go without.
 * It reads the depth of what is drawn, which Godot's Forward+ renderer offers.
 */
export function godotOutlineShader(): string {
    const {weight, strength} = COMIC_LOOK.lines

    return /* glsl */ `// easy-props outline: dark lines around shapes, for the Cartoon and Comic looks.
// Put it on a 2 by 2 QuadMesh that is a child of the camera. Needs the Forward+ renderer.
shader_type spatial;
render_mode unshaded, fog_disabled, depth_draw_never, cull_disabled;

uniform sampler2D depth_texture : hint_depth_texture, filter_nearest;
uniform vec3 ink_colour : source_color = ${linearColour(INK_LINES.colour)};
// In pixels. Comic is ${number(INK_LINES.outer * weight)} and Cartoon ${number(INK_LINES.outer * CARTOON_LOOK.lines.weight)}.
uniform float line_width : hint_range(0.5, 8.0) = ${number(INK_LINES.outer * weight)};
// How dark, from 0 for none to 1 for solid ink. Comic is ${number(strength)} and Cartoon ${number(CARTOON_LOOK.lines.strength)}.
uniform float line_strength : hint_range(0.0, 1.0) = ${number(strength)};
// How far behind, as a share of its distance, a surface must be to be outlined.
uniform float depth_gap : hint_range(0.001, 0.5) = 0.1;
// Gaps narrower than this many pixels, such as among leaves, go without a line.
uniform float gap_size : hint_range(0.0, 16.0) = ${number(INK_LINES.holeReach)};

void vertex() {
	POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

float distance_at(vec2 uv, mat4 inverse_projection) {
	// Kept on the screen: past its edge the depth reads as near, which would line the border.
	uv = clamp(uv, vec2(0.001), vec2(0.999));
	float depth = texture(depth_texture, uv).r;
	vec4 view = inverse_projection * vec4(uv * 2.0 - 1.0, depth, 1.0);
	return -view.z / view.w;
}

void fragment() {
	vec2 texel = 1.0 / VIEWPORT_SIZE;
	float here = distance_at(SCREEN_UV, INV_PROJECTION_MATRIX);
	float hits = 0.0;
	for (int i = 0; i < 12; i++) {
		float angle = float(i) * PI / 6.0;
		float other = distance_at(SCREEN_UV + vec2(cos(angle), sin(angle)) * line_width * texel, INV_PROJECTION_MATRIX);
		// Only the farther side takes the line, so it sits beside a shape, not on it.
		if (here - other > depth_gap * other) {
			hits += 1.0;
		}
	}
	if (hits == 0.0) {
		discard;
	}
	// A gap with something nearer all round it is a hole among leaves, not an edge.
	float around = 0.0;
	for (int i = 0; i < 8; i++) {
		float angle = float(i) * PI / 4.0;
		float other = distance_at(SCREEN_UV + vec2(cos(angle), sin(angle)) * gap_size * texel, INV_PROJECTION_MATRIX);
		if (here - other > depth_gap * other) {
			around += 1.0;
		}
	}
	if (around >= 7.0) {
		discard;
	}
	ALBEDO = ink_colour;
	ALPHA = clamp(hits / 6.0, 0.0, 1.0) * line_strength;
}
`
}
