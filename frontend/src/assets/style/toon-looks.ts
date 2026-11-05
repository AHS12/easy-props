/**
 * The numbers behind the Cartoon and Comic looks, kept in one place so the
 * view and an engine's shaders made at export draw a prop the same way.
 *
 * Everything here was tuned by eye in the view. Brightness and colour values
 * are linear, from 0 to 1.
 */

/** The soft look: a few bands of light with soft steps between them, and the painted grain kept. */
export const CARTOON_LOOK = {
    /** Shadow, mid and lit. */
    levels: [0.42, 0.7, 1],
    /** Where light moves from one band to the next. */
    steps: [0.3, 0.62],
    /** How wide each soft step is, as a share of the whole range. Wider reads as painted, narrower as hard. */
    softness: 0.09,
    /** Thin and soft, as a painter might pencil them. */
    lines: {weight: 0.75, strength: 0.45},
} as const

/** The hard look, often called cel shading: flat colours, hard shadows that deepen rather than grey, and ink lines. */
export const COMIC_LOOK = {
    /** Shadow and lit. Two steps read as cel; a third starts to read as painted. */
    bands: [80 / 255, 1],
    /** Where the light falls between shadow and lit, as how bright a point is next to its own colour. */
    shadeLevel: 0.55,
    litLevel: 1.05,
    /** Half the width of the one step between shadow and lit. */
    stepSoftness: 0.03,
    /** How much richer colours are than the painted ones. */
    vivid: 1.2,
    /**
     * How colourful a colour must be before it gets richer colour and deeper
     * shade, between these two. A grey with a faint cast would turn blue.
     */
    colourful: [0.3, 0.6],
    /** How far shade deepens a colour, and a grey. */
    shadowDepth: 1.7,
    greyShadowDepth: 0.7,
    shadowDarkness: 0.8,
    /** How far the lit side keeps the light's tint, and the most it may tint. */
    tint: 0.6,
    tintRange: [0.7, 1.4],
    /**
     * How far a leaf card's light follows the round shape of its whole clump
     * rather than its own small lumps, which would speckle light and shade.
     */
    rounding: 0.85,
    /** A grey print darker than this is a stroke, and is drawn at this tone. Its plain ground stays at 1. */
    strokeLevel: 0.8,
    strokeTone: 0.62,
    /** A print counts as grey when its brightest and dimmest channels are closer than this. */
    greyPrint: 0.02,
    /** Bold ink. */
    lines: {weight: 1.5, strength: 1},
} as const

/** How a part's painted colours are cut to its few main colours in the Comic look. */
export const FLAT_COLOURS = {
    /** Tones nearer than this count as one colour. Grain and shade fall within it; a flower does not. */
    sameColour: 0.3,
    /** How much brightness counts next to hue when deciding two tones are one colour. */
    brightnessWeight: 0.3,
    /** How far a joined tone leans to the colour of its lighter half, from 0 for an even mix to 1. */
    lean: 0.75,
    maxTones: 6,
    rounds: 8,
} as const

/** The dark lines both looks draw around shapes. */
export const INK_LINES = {
    colour: '#1c1814',
    /** Widths in screen pixels at a weight of 1: the outside of a shape, and where shapes overlap. */
    outer: 2,
    inner: 1.25,
    /** Gaps in a crown narrower than this many pixels go without a line. */
    holeReach: 5,
} as const

const smoothstep = (edge0: number, edge1: number, x: number) => {
    const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)

    return t * t * (3 - 2 * t)
}

/** How bright the Cartoon look draws each amount of light: flat bands joined by short soft steps. */
export function cartoonLevel(light: number): number {
    const {levels, steps, softness} = CARTOON_LOOK
    let level: number = levels[0]

    steps.forEach((step, index) => {
        level += (levels[index + 1] - levels[index]) * smoothstep(step - softness / 2, step + softness / 2, light)
    })

    return level
}
