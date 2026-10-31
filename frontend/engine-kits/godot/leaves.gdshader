// easy-props leaves. Paint comes from the vertex colours, the outline from the
// dab texture, movement from UV2: UV2.x is sway and UV2.y is flutter.
// Keep the sway settings the same as wood.gdshader, or leaves slide off their twigs.
shader_type spatial;

uniform sampler2D dab_texture : source_color, filter_linear_mipmap;
uniform float cut_off = 0.5;
uniform float sway_strength = 0.25;
uniform float sway_speed = 1.1;
uniform float flutter_strength = 0.04;
uniform float flutter_speed = 5.0;
uniform vec3 wind_direction = vec3(1.0, 0.0, 0.3);

void vertex() {
	vec3 world = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float phase = world.x * 0.37 + world.z * 0.53;
	float wave = sin(TIME * sway_speed + phase) + 0.4 * sin(TIME * sway_speed * 2.3 + phase);
	VERTEX += (inverse(MODEL_MATRIX) * vec4(normalize(wind_direction), 0.0)).xyz * wave * UV2.x * sway_strength;

	float local = VERTEX.x * 3.1 + VERTEX.y * 2.3 + VERTEX.z * 3.7;
	VERTEX += NORMAL * sin(TIME * flutter_speed + local) * UV2.y * flutter_strength;
}

void fragment() {
	vec4 dab = texture(dab_texture, UV);
	ALBEDO = COLOR.rgb * dab.rgb;
	ALPHA = dab.a;
	ALPHA_SCISSOR_THRESHOLD = cut_off;
	ROUGHNESS = 1.0;
}
