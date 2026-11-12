/**
 * A tree's damage: a snapped top, broken limbs, a split trunk.
 *
 * Applied to the finished plan, so an undamaged tree is exactly as it was, and the
 * leaves that remain keep their colours: the crown's middle is worked out before.
 * A break is a jagged cut of the wood field that reaches only round its own point,
 * so breaking a limb never cuts into the trunk beside it.
 */

import {createSeededRandom, hashSeed} from '../../shared/random'
import type {PaintedEdits} from './edits'
import {distanceAlong, growsOn, isHeavyLimb, lengthOf, pointAlong, shortened} from './limb-path'
import type {PaintedTreeParameters} from './parameters'
import type {Clump, Limb, Vec3} from './plan'
import type {WoodCut} from './wood-field'

/** Snapped all the way, the trunk breaks this share of the way up. */
const LOWEST_SNAP = 0.15
/** How far splinters stand out of a break, and how far apart they are, against the wood's radius. */
const SPLINTER_LENGTH = 1.1
const SPLINTER_SPACING = 1.2
/** How far round its point a break reaches, against the radius there. */
const BREAK_REACH = 3
/**
 * Where a heavy limb breaks: where it has thinned to this share of its thickness at the
 * trunk. Still thick there, so the break is splintered wood rather than a thin spike.
 */
const LIMB_BREAK_THICK = 0.85
const LIMB_BREAK_THIN = 0.65
/** And never further out than this share of its length. */
const LIMB_BREAK_MOST = 0.5
/** How much a break leans off square, at most, in radians. */
const BREAK_LEAN = 0.35
/** Where a split runs on the trunk, as shares of its height, and how deep into it. */
const SPLIT_LOW = 0.15
const SPLIT_HIGH = 0.75
const SPLIT_DEPTH = 0.35

const SEED_SNAP = 91
const SEED_BREAKS = 92
const SEED_SPLIT = 93

export interface Damage {
    readonly limbs: readonly Limb[]
    readonly clumps: readonly Clump[]
    readonly cuts: readonly WoodCut[]
    /** A crack down the trunk, as from lightning, or null. */
    readonly split: Split | null
}

/** A narrow wedge into one side of the trunk, from `low` to `high`. */
export interface Split {
    readonly low: number
    readonly high: number
    /** Which way it faces, in radians about the trunk. */
    readonly azimuth: number
    /** How far into the trunk it reaches, as a share of the radius. */
    readonly depth: number
}

export const isDamaged = (tree: PaintedTreeParameters): boolean => tree.snapped > 0 || tree.brokenLimbs > 0 || tree.split > 0

/** A direction leaned off `direction` by up to `lean`, as the seed says. */
function leaned(direction: Vec3, lean: number, random: () => number): Vec3 {
    const tilt: Vec3 = [direction[0] + (random() - 0.5) * 2 * lean, direction[1] + (random() - 0.5) * 2 * lean, direction[2] + (random() - 0.5) * 2 * lean]
    const length = Math.hypot(...tilt) || 1

    return [tilt[0] / length, tilt[1] / length, tilt[2] / length]
}

/** How far along a limb it has thinned to `share` of its first thickness, past where it leaves the trunk. */
function whereThinned(limb: Limb, share: number): number {
    const target = limb.radii[0] * share
    const most = lengthOf(limb) * LIMB_BREAK_MOST
    let run = 0

    for (let index = 1; index < limb.points.length; index++) {
        const step = Math.hypot(
            limb.points[index][0] - limb.points[index - 1][0],
            limb.points[index][1] - limb.points[index - 1][1],
            limb.points[index][2] - limb.points[index - 1][2],
        )

        if (limb.radii[index] <= target) {
            const t = (limb.radii[index - 1] - target) / Math.max(limb.radii[index - 1] - limb.radii[index], 1e-9)

            return Math.min(run + step * t, most)
        }

        run += step
    }

    return most
}

function breakAt(limb: Limb, distance: number, random: () => number): WoodCut {
    const at = pointAlong(limb, distance)

    return {
        point: at.point,
        normal: leaned(at.direction, BREAK_LEAN, random),
        jag: at.radius * SPLINTER_LENGTH,
        grain: at.radius * SPLINTER_SPACING,
        reach: at.radius * BREAK_REACH,
    }
}

/** Which wood each clump grows on: the limb whose wood is nearest it, and how far along. */
function ownersOf(clumps: readonly Clump[], limbs: readonly Limb[]) {
    const wood = limbs.filter((limb) => !limb.key.startsWith('r') && limb.points.length > 1)

    return clumps.map((clump) => {
        let owner = wood[0]
        let best = {along: 0, away: Infinity}

        for (const limb of wood) {
            const found = distanceAlong(limb, clump.base)

            if (found.away < best.away) {
                owner = limb
                best = found
            }
        }

        return {owner, along: best.along}
    })
}

export function applyDamage(limbs: readonly Limb[], clumps: readonly Clump[], tree: PaintedTreeParameters, seed: number, edits: PaintedEdits): Damage {
    const handBroken = Object.values(edits.limbs).some((edit) => edit.broken)

    if (!isDamaged(tree) && !handBroken) {
        return {limbs, clumps, cuts: [], split: null}
    }

    const owners = ownersOf(clumps, limbs)
    const cuts: WoodCut[] = []
    // Where each limb now ends, as a distance along it. Gone entirely is -1.
    const endsAt = new Map<string, number>()
    const trunk = limbs[0]

    if (tree.snapped > 0 && trunk?.level === 0) {
        const random = createSeededRandom(hashSeed(seed, SEED_SNAP))
        const length = lengthOf(trunk)
        const at = length * (1 - (1 - LOWEST_SNAP) * tree.snapped)
        const cut = breakAt(trunk, at, random)

        cuts.push(cut)
        endsAt.set(trunk.key, at)

        // Everything that left the trunk above the break went with it.
        for (const limb of limbs) {
            if (limb !== trunk && !limb.key.startsWith('r') && distanceAlong(trunk, limb.points[0]).along > at - cut.reach! / BREAK_REACH) {
                endsAt.set(limb.key, -1)
            }
        }
    }

    const breaks = createSeededRandom(hashSeed(seed, SEED_BREAKS))

    for (const limb of limbs.filter(isHeavyLimb)) {
        // Each limb draws its numbers whether or not it breaks, so more Broken limbs only adds breaks.
        const chance = breaks()
        const where = breaks()
        const leanRandom = createSeededRandom(hashSeed(seed, SEED_BREAKS, Math.round(where * 1e6)))

        if (endsAt.get(limb.key) === -1 || (chance >= tree.brokenLimbs && !edits.limbs[limb.key]?.broken)) {
            continue
        }

        // Out past the trunk it leaves, so the break shows.
        const at = Math.max(whereThinned(limb, LIMB_BREAK_THICK + (LIMB_BREAK_THIN - LIMB_BREAK_THICK) * where), Math.min(limb.radii[0] * 1.8, lengthOf(limb) * LIMB_BREAK_MOST))

        cuts.push(breakAt(limb, at, leanRandom))
        endsAt.set(limb.key, at)
    }

    // What grew past a break went with it, and so did all that grew on that. Parents
    // have shorter keys, so they're settled first.
    const gone = new Set<string>()

    for (const limb of [...limbs].sort((a, b) => a.key.length - b.key.length)) {
        if (endsAt.get(limb.key) === -1) {
            gone.add(limb.key)
            continue
        }

        for (const parent of limbs) {
            if (parent === limb || !growsOn(limb, parent)) {
                continue
            }

            const end = endsAt.get(parent.key)

            if (gone.has(parent.key) || (end !== undefined && distanceAlong(parent, limb.points[0]).along > end)) {
                gone.add(limb.key)
                break
            }
        }
    }

    const kept = limbs
        .filter((limb) => !gone.has(limb.key))
        .map((limb) => {
            const end = endsAt.get(limb.key)

            // Kept a little past the break, so the jagged cut has wood to go through.
            return end !== undefined && end > 0 ? shortened(limb, end + pointAlong(limb, end).radius * (SPLINTER_LENGTH + 0.4)) : limb
        })
    const keptKeys = new Set(kept.map((limb) => limb.key))

    const keptClumps = clumps.filter((_, index) => {
        const {owner, along} = owners[index]
        const end = endsAt.get(owner.key)

        if (!keptKeys.has(owner.key) && owner.key !== trunk?.key) {
            return false
        }

        return end === undefined || (end > 0 && along <= end)
    })

    let split: Split | null = null

    if (tree.split > 0 && trunk?.level === 0) {
        const random = createSeededRandom(hashSeed(seed, SEED_SPLIT))
        const top = trunk.points[trunk.points.length - 1][1]
        const low = top * (SPLIT_LOW + random() * 0.15)

        split = {
            low,
            high: low + (top * SPLIT_HIGH - low) * (0.4 + 0.6 * tree.split),
            azimuth: random() * Math.PI * 2,
            depth: SPLIT_DEPTH * (0.5 + 0.5 * tree.split),
        }
    }

    return {limbs: kept, clumps: keptClumps, cuts, split}
}
