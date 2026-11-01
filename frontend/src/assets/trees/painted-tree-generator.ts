/**
 * A stylized tree, painted rather than assembled.
 *
 * A heavy blended trunk, a few limbs that end in thin dark whips, and big soft
 * masses of leaves with a brush-stroke edge. Colour is stored per vertex and
 * the shading normals are part of the mesh, so the look travels with the
 * exported file instead of depending on a shader.
 */

import {IDENTITY_TRANSFORM} from '../shared/component-types'
import type {CollisionShape, GeneratedComponent, PropGenerator} from '../shared/generator-types'
import {
    paintedTreeDefaults,
    paintedTreeParameterSpecs,
    planPaintedTree,
    validatePaintedTreeParameters,
    type Limb,
    type PaintedTreeParameters,
} from './painted'

/** A chord may stray this far from its limb, as a share of the limb's radius. */
const COLLISION_STRAY = 0.6

/** A limb as the fewest straight runs that stay inside it. */
function collisionRuns(limb: Limb): CollisionShape[] {
    const split = (from: number, to: number): number[] => {
        const a = limb.points[from]
        const b = limb.points[to]
        const chord = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
        const lengthSquared = Math.max(chord[0] ** 2 + chord[1] ** 2 + chord[2] ** 2, 1e-9)
        let worst = -1
        let worstStray = 0

        for (let at = from + 1; at < to; at++) {
            const p = limb.points[at]
            const d = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
            const t = (d[0] * chord[0] + d[1] * chord[1] + d[2] * chord[2]) / lengthSquared
            const stray =
                Math.hypot(d[0] - chord[0] * t, d[1] - chord[1] * t, d[2] - chord[2] * t) /
                Math.max(limb.radii[at], 0.01)

            if (stray > worstStray) {
                worstStray = stray
                worst = at
            }
        }

        return worstStray > COLLISION_STRAY ? [...split(from, worst).slice(0, -1), ...split(worst, to)] : [from, to]
    }

    const stops = split(0, limb.points.length - 1)

    return stops.slice(0, -1).map((from, index) => ({
        start: limb.points[from],
        end: limb.points[stops[index + 1]],
        startRadius: limb.radii[from],
        endRadius: limb.radii[stops[index + 1]],
    }))
}

function typeOf(limb: Limb): GeneratedComponent['type'] {
    if (limb.level === 0) {
        return 'trunk'
    }

    return limb.key.startsWith('r') ? 'root' : 'branch'
}

export const paintedTreeGenerator: PropGenerator<PaintedTreeParameters> = {
    id: 'painted-tree',
    version: 3,
    label: 'Painted tree',
    parameters: paintedTreeParameterSpecs,
    paintsOwnColours: true,

    createDefaultParameters() {
        return paintedTreeDefaults
    },

    validate(parameters) {
        return validatePaintedTreeParameters(parameters)
    },

    // The trunk and heavy limbs, not the roots: nothing walks into a root.
    collision(parameters, seed) {
        return planPaintedTree(parameters, seed)
            .limbs.filter((limb) => limb.level < 2 && !limb.key.startsWith('r'))
            .flatMap(collisionRuns)
    },

    pivot(parameters, seed) {
        return planPaintedTree(parameters, seed).limbs[0].points[0]
    },

    generate(parameters, context) {
        const {seed} = context
        const plan = planPaintedTree(parameters, seed)

        const bark: GeneratedComponent = {
            id: 'cmp-bark-0',
            type: 'bark',
            generatorId: 'painted-bark',
            generatorVersion: 2,
            parentId: null,
            transform: IDENTITY_TRANSFORM,
            parameters: {tree: parameters, seed},
            seed,
            slot: 'bark',
        }

        const clumps = plan.clumps.map(
            (clump): GeneratedComponent => ({
                id: `cmp-clump-${clump.key}`,
                type: 'foliage-cluster',
                generatorId: 'painted-clump',
                generatorVersion: 2,
                parentId: bark.id,
                transform: {...IDENTITY_TRANSFORM, position: clump.centre},
                parameters: {
                    tree: parameters,
                    seed,
                    key: clump.key,
                    base: clump.base,
                    kind: clump.kind,
                    sizeScale: clump.edit.sizeScale ?? 1,
                    flattenScale: clump.edit.flattenScale ?? 1,
                    fullnessScale: clump.edit.fullnessScale ?? 1,
                    leafSizeScale: clump.edit.leafSizeScale ?? 1,
                    lumpinessScale: clump.edit.lumpinessScale ?? 1,
                    colour: clump.edit.colour ?? null,
                },
                seed: clump.seed,
                slot: `clump-${clump.key}`,
            }),
        )

        // Twigs are too fine to aim at, and too many to be worth a part each.
        const limbs = plan.limbs
            .filter((limb) => limb.level < 3)
            .map(
                (limb): GeneratedComponent => ({
                    id: `cmp-limb-${limb.key}`,
                    type: typeOf(limb),
                    generatorId: 'painted-limb',
                    generatorVersion: 1,
                    parentId: bark.id,
                    transform: IDENTITY_TRANSFORM,
                    parameters: {
                        tree: parameters,
                        seed,
                        key: limb.key,
                        base: limb.controlBase,
                        // World positions, which the 'world' spine layout reads
                        // directly: this limb's handles.
                        spine: limb.controls.map((point, index) => ({
                            t: limb.controlTs[index],
                            x: point[0],
                            y: point[1],
                            z: point[2],
                        })),
                        worldSpine: true,
                        lengthScale: limb.lengthScale,
                        thicknessScale: limb.thicknessScale,
                    },
                    seed,
                    slot: `limb-${limb.key}`,
                }),
            )

        return [bark, ...clumps, ...limbs]
    },
}
