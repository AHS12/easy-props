/**
 * Walking along a limb: points and directions at a distance, cutting one short, and
 * which limbs are the heavy ones that leave the trunk.
 */

import {isHeavyLimbKey} from './edits'
import {normalize, type Limb, type Vec3} from './plan'

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

export const lengthOf = (limb: Limb): number =>
    limb.points.slice(1).reduce((sum, point, index) => sum + Math.hypot(...sub(point, limb.points[index])), 0)

/** The point, direction and thickness `distance` along a limb. */
export function pointAlong(limb: Limb, distance: number): {point: Vec3; direction: Vec3; radius: number} {
    let run = 0

    for (let index = 1; index < limb.points.length; index++) {
        const a = limb.points[index - 1]
        const b = limb.points[index]
        const step = Math.hypot(...sub(b, a))

        if (run + step >= distance || index === limb.points.length - 1) {
            const t = Math.min(Math.max((distance - run) / Math.max(step, 1e-9), 0), 1)

            return {point: lerp(a, b, t), direction: normalize(sub(b, a)), radius: limb.radii[index - 1] + (limb.radii[index] - limb.radii[index - 1]) * t}
        }

        run += step
    }

    return {point: limb.points[0], direction: [0, 1, 0], radius: limb.radii[0]}
}

/** How far along a limb the point of it nearest `point` is. */
export function distanceAlong(limb: Limb, point: Vec3): {along: number; away: number} {
    let run = 0
    let best = {along: 0, away: Infinity}

    for (let index = 1; index < limb.points.length; index++) {
        const a = limb.points[index - 1]
        const ab = sub(limb.points[index], a)
        const step = Math.hypot(...ab)
        const t = step < 1e-9 ? 0 : Math.min(Math.max((sub(point, a)[0] * ab[0] + sub(point, a)[1] * ab[1] + sub(point, a)[2] * ab[2]) / (step * step), 0), 1)
        const away = Math.hypot(...sub(point, lerp(a, limb.points[index], t)))

        if (away < best.away) {
            best = {along: run + step * t, away}
        }

        run += step
    }

    return best
}

/** A limb cut short at `length` along it, from its start. */
export function shortened(limb: Limb, length: number): Limb {
    const points: Vec3[] = [limb.points[0]]
    const radii: number[] = [limb.radii[0]]
    let run = 0

    for (let index = 1; index < limb.points.length; index++) {
        const step = Math.hypot(...sub(limb.points[index], limb.points[index - 1]))

        if (run + step >= length) {
            const t = (length - run) / Math.max(step, 1e-9)

            points.push(lerp(limb.points[index - 1], limb.points[index], t))
            radii.push(limb.radii[index - 1] + (limb.radii[index] - limb.radii[index - 1]) * t)
            break
        }

        run += step
        points.push(limb.points[index])
        radii.push(limb.radii[index])
    }

    return {...limb, points, radii}
}

export const isRoot = (limb: Limb): boolean => limb.key.startsWith('r')

/** The heavy limbs that leave the trunk: a branching tree's big limbs, a conifer's spokes. */
export const isHeavyLimb = (limb: Limb): boolean => isHeavyLimbKey(limb.key) && limb.points.length > 1

/** True for a limb that grows on `parent`, at any depth. */
export const growsOn = (limb: Limb, parent: Limb): boolean => limb.key.startsWith(`${parent.key}b`) || limb.key.startsWith(`${parent.key}t`)
