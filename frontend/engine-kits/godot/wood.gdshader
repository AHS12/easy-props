// easy-props wood. Paint comes from the vertex colours, movement from UV2.
// UV2.x is sway, from 0 at the base to 1 at the far tips.
shader_type spatial;

uniform float sway_strength = 0.25;
uniform float sway_speed = 1.1;
uniform vec3 wind_direction = vec3(1.0, 0.0, 0.3);

void vertex() {
	vec3 world = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float phase = world.x * 0.37 + world.z * 0.53;
	float wave = sin(TIME * sway_speed + phase) + 0.4 * sin(TIME * sway_speed * 2.3 + phase);
	VERTEX += (inverse(MODEL_MATRIX) * vec4(normalize(wind_direction), 0.0)).xyz * wave * UV2.x * sway_strength;
}

void fragment() {
	ALBEDO = COLOR.rgb;
	ROUGHNESS = 0.85;
}
