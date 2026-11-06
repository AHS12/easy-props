/**
 * Low-poly grass, in the style of the low-poly flowers: fewer, wider blades, each
 * folded down its middle like a flower's leaf, every face one flat colour.
 *
 * A blade keeps its bend: it rises from the root to a keel partway up, where its
 * two edges stand out, then narrows to the tip. The halves either side of the
 * keel are a shade apart, so the fold shows.
 */

import {addDaisy, addStem, facesToGeometry, pushBothSides, STEM_THICKER, type Faces} from '../plants/low-poly-plant'
import {createSeededRandom, hashSeed, randomRange} from '../shared/random'
import {FLOWER_ROWS, GRASS_ROWS, rampOf} from '../style/own-colours'
import {DRY_RAMP, GRASS_RAMPS, PETAL_RAMPS, STEM_RAMP} from '../style/palettes'
import {colourRamp} from '../style/ramp'
import {bladePoint, bladesAtDetail, FLOWER_STEM, flowerStems, planGrass, type GrassParameters} from './blade-mesh'

type Vec3 = readonly [number, number, number]

/** The share of blades a low-poly patch keeps, at full detail. */
const BLADE_SHARE = 0.33
/** Blades left widen to cover the ground the rest covered, but no further than this. */
const MAX_WIDENING = 5
/** The widest a blade may be before it is widened, against Blade width: as wide as an ordinary blade gets. */
const STANDOUT_WIDTH = 1.3
/** Where the keel sits, from root to tip, and how far its edges stand up. */
const KEEL_AT = 0.35
const FOLD = 0.45
const FOLD_SHADE = 0.1
const LOW_VALUE = 0.25
const HIGH_VALUE = 0.72
const CLUMP_VALUE = 0.2
const BLADE_VALUE = 0.05

const add = (a: Vec3, b: Vec3, t = 1): Vec3 => [a[0] + b[0] * t, a[1] + b[1] * t, a[2] + b[2] * t]

export function buildLowPolyGrassMesh(grass: GrassParameters, seed: number, detail: number) {
    const all = planGrass(grass, seed)
    // Its blades are already few, so a lighter level drops them gently, or the patch falls apart.
    const wanted = Math.max(1, Math.round(all.length * BLADE_SHARE * Math.sqrt(detail)))
    const blades = wanted < all.length ? bladesAtDetail(all, wanted) : all
    const widening = Math.min(all.length / blades.length, MAX_WIDENING)
    const lush = colourRamp(rampOf(grass.palette, GRASS_RAMPS, grass, GRASS_ROWS))
    const dry = colourRamp(DRY_RAMP)
    const faces: Faces = {positions: [], normals: [], colors: []}

    for (const blade of blades) {
        const random = createSeededRandom(hashSeed(seed, Math.floor(blade.priority * 1e9)))
        const paint = blade.clump.dry ? dry : lush
        const offset = (blade.clump.hue - 0.5) * CLUMP_VALUE * (grass.variation * 2) + randomRange(random, -BLADE_VALUE, BLADE_VALUE)
        const side: Vec3 = [-Math.sin(blade.facing), 0, Math.cos(blade.facing)]
        const root = bladePoint(blade, 0)
        const keel = bladePoint(blade, KEEL_AT)
        const tip = bladePoint(blade, 1)
        // A standout rises taller, but widened as wide as the rest it would tower as a spike.
        const half = Math.min(blade.width, grass.bladeWidth * STANDOUT_WIDTH) * widening * 0.5
        // The edges stand up from the keel, square to the blade, so the fold opens to the sky.
        const toward = [tip[0] - root[0], tip[1] - root[1], tip[2] - root[2]]
        const length = Math.hypot(toward[0], toward[1], toward[2]) || 1
        const up: Vec3 = [-(toward[0] / length) * (toward[1] / length), 1 - (toward[1] / length) ** 2, -(toward[2] / length) * (toward[1] / length)]
        const left = add(add(keel, side, half), up, half * FOLD)
        const right = add(add(keel, side, -half), up, half * FOLD)

        pushBothSides(faces, root, left, keel, paint(LOW_VALUE + offset))
        pushBothSides(faces, root, keel, right, paint(LOW_VALUE + offset - FOLD_SHADE))
        pushBothSides(faces, left, tip, keel, paint(HIGH_VALUE + offset))
        pushBothSides(faces, keel, tip, right, paint(HIGH_VALUE + offset - FOLD_SHADE))
    }

    const petal = colourRamp(rampOf(grass.flowerColour, PETAL_RAMPS, grass, FLOWER_ROWS))
    const green = colourRamp(STEM_RAMP)

    for (const {path, across, random} of flowerStems(grass, seed, detail)) {
        addStem(faces, path, FLOWER_STEM * STEM_THICKER, green, random)
        addDaisy(faces, path.point(1), path.tangent(1), across, petal, random)
    }

    const geometry = facesToGeometry(faces)

    geometry.computeBoundingSphere()

    return geometry
}
