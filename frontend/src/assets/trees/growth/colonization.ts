/**
 * Growing a skeleton by space colonization.
 *
 * The tree is grown towards a cloud of points that fills the crown (Runions et
 * al., 2007). A joint claims the points it can see, grows one child in the
 * direction they average out to, and the points it reaches stop existing. That
 * one rule produces limbs that seek out empty space, thick lower branches and a
 * crown that fills the volume it was given, none of which is written down
 * anywhere as a special case.
 *
 * Everything is deterministic: the same parameters and the same seed give the
 * same tree, joint for joint.
 */

import {createSeededRandom, hashSeed} from '../../shared/random'
import {sampleAttractors} from './envelope'
import type {GrowthParameters} from './parameters'
import {applyPipeModel, assignOrders} from './skeleton'
import type {Skeleton, SkeletonNode} from './skeleton'

/** The angle that turns each new child around its parent. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** The seed streams. Splitting them keeps a change in one from moving the other. */
const TRUNK_SEED = 0
const ATTRACTOR_SEED = 1

/** How many edges along a limb count as fully old, for the droop weighting. */
const DROOP_DEPTH = 14

/** How many rounds growth may take, so no parameter set can make this hang. */
const MAX_ROUNDS = 512

/** How many joints the trunk is allowed to have, whatever the step length. */
const MAX_TRUNK_SEGMENTS = 32

/**
 * How far past the top of the tree a limb may grow before it is left alone.
 *
 * A point that a limb has already climbed past can never be reached again,
 * because the pull towards the light outvotes it. Without a ceiling the last
 * few points would grow a twig that spirals out of the tree for ever.
 */
const CROWN_HEADROOM = 1.02

/** How much wider than the crown a limb may reach before it is left alone. */
const CROWN_OVERREACH = 1.1

/**
 * How many rounds a point may have a joint growing towards it.
 *
 * The pull towards the light can outvote a point that sits just behind a
 * limb's path, and a limb can then spiral around a point it keeps missing by a
 * couple of centimetres. A point that has been chased this long is dropped, so
 * a near miss costs a short stub instead of an endless knot of joints.
 */
function patienceRounds(perceptionRadius: number, stepLength: number): number {
    return Math.max(12, Math.ceil((perceptionRadius / stepLength) * 4))
}

/**
 * How thick a limb is while it is still growing.
 *
 * The real radius comes from the pipe model, which needs the finished tree, so
 * a growing joint is estimated from how deep it sits: close to the trunk a limb
 * is a good share of the trunk's thickness and it thins toward the tips. The
 * offset this drives is capped anyway, so a rough number is enough.
 */
function provisionalRadius(parameters: GrowthParameters, depth: number): number {
    const estimate = parameters.trunkRadius * Math.pow(0.86, depth)

    return Math.min(Math.max(estimate, parameters.minTwigRadius), parameters.trunkRadius)
}

/** Rounds a size up to a power of two, which turns a hash into a bucket index. */
function nextPowerOfTwo(size: number): number {
    let power = 16

    while (power < size) {
        power *= 2
    }

    return power
}

/**
 * Hashes a grid cell to a bucket.
 *
 * Collisions are harmless: a query tests the distance of everything it finds,
 * so a point from another cell merely costs one comparison and can never be
 * returned by mistake.
 */
function cellHash(x: number, y: number, z: number, mask: number): number {
    let hash = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)
    hash ^= hash >>> 13
    hash = Math.imul(hash, 0x5bd1e995)
    hash ^= hash >>> 15

    return (hash >>> 0) & mask
}

interface PointGrid {
    /** Writes the indices of every point within `radius` into `out`, and returns how many. */
    query(x: number, y: number, z: number, radius: number, out: Int32Array): number
}

/**
 * A uniform hash grid over a flat set of points.
 *
 * The growth loop asks "which points are near this new joint?" once per joint,
 * so the points are bucketed once and each question only walks the few buckets
 * the radius can reach. Buckets are a flat pair of typed arrays rather than a
 * map of arrays: nothing is allocated per query, and there is no string key to
 * build. The caller passes the output buffer in for the same reason.
 */
function buildPointGrid(points: Float64Array, count: number, cellSize: number): PointGrid {
    const bucketCount = nextPowerOfTwo(Math.max(16, count * 2))
    const mask = bucketCount - 1
    const head = new Int32Array(bucketCount)
    const next = new Int32Array(Math.max(count, 1))
    const inverse = 1 / cellSize

    head.fill(-1)
    next.fill(-1)

    for (let index = 0; index < count; index++) {
        const at = index * 3
        const bucket = cellHash(
            Math.floor(points[at] * inverse),
            Math.floor(points[at + 1] * inverse),
            Math.floor(points[at + 2] * inverse),
            mask,
        )

        next[index] = head[bucket]
        head[bucket] = index
    }

    return {
        query(x, y, z, radius, out) {
            const radiusSquared = radius * radius
            const minX = Math.floor((x - radius) * inverse)
            const maxX = Math.floor((x + radius) * inverse)
            const minY = Math.floor((y - radius) * inverse)
            const maxY = Math.floor((y + radius) * inverse)
            const minZ = Math.floor((z - radius) * inverse)
            const maxZ = Math.floor((z + radius) * inverse)

            let found = 0

            for (let cellX = minX; cellX <= maxX; cellX++) {
                for (let cellY = minY; cellY <= maxY; cellY++) {
                    for (let cellZ = minZ; cellZ <= maxZ; cellZ++) {
                        let index = head[cellHash(cellX, cellY, cellZ, mask)]

                        while (index >= 0) {
                            const at = index * 3
                            const dx = points[at] - x
                            const dy = points[at + 1] - y
                            const dz = points[at + 2] - z

                            if (dx * dx + dy * dy + dz * dz <= radiusSquared) {
                                out[found] = index
                                found++
                            }

                            index = next[index]
                        }
                    }
                }
            }

            return found
        },
    }
}

/**
 * Grows a tree skeleton.
 *
 * A trunk is raised from the ground to where the crown starts, then space
 * colonization takes over from the top of it. The trunk is a plain rise with a
 * slight lean and curve, both drawn from the seed, so two seeds give trees that
 * stand differently before a single branch has grown.
 */
export function growSkeleton(parameters: GrowthParameters, seed: number): Skeleton {
    const random = createSeededRandom(hashSeed(seed, TRUNK_SEED))
    const height = Math.max(0.1, parameters.height)
    const maxNodes = Math.max(2, Math.min(20000, Math.round(parameters.maxNodes)))
    const stepLength = Math.max(0.01, parameters.stepLength)
    const perceptionRadius = Math.max(0.01, parameters.perceptionRadius)
    const killDistance = Math.max(0.001, parameters.killDistance)
    const reachForLight = parameters.reachForLight
    const droop = parameters.droop
    const crownBase = Math.min(Math.max(parameters.crownBaseFraction, 0), 0.95) * height
    const widestReach = Math.max(parameters.crownWidth, 0.01) * 0.5 * CROWN_OVERREACH

    const positions = new Float64Array(maxNodes * 3)
    const directions = new Float64Array(maxNodes * 3)
    const parents = new Int32Array(maxNodes)
    const depths = new Int32Array(maxNodes)
    const children = new Int32Array(maxNodes)

    parents.fill(-1)

    let nodeCount = 0

    const addNode = (
        x: number,
        y: number,
        z: number,
        parentId: number,
        dx: number,
        dy: number,
        dz: number,
        depth: number,
    ): number => {
        const index = nodeCount
        const at = index * 3

        nodeCount++

        positions[at] = x
        positions[at + 1] = y
        positions[at + 2] = z
        directions[at] = dx
        directions[at + 1] = dy
        directions[at + 2] = dz
        parents[index] = parentId
        depths[index] = depth

        return index
    }

    // --- The trunk ------------------------------------------------------
    const segments =
        crownBase <= 1e-3
            ? 0
            : Math.max(2, Math.min(MAX_TRUNK_SEGMENTS, Math.round(crownBase / stepLength)))
    const trunkNodes = segments + 1

    // The lean and the curve are two seeded angles, so a tree keeps its stance
    // between sessions and two seeds stand differently.
    const leanAngle = random() * Math.PI * 2
    const curveAngle = leanAngle + Math.PI / 2
    const lean = (0.015 + random() * 0.04) * crownBase
    const curve = (random() - 0.5) * 0.06 * crownBase

    const trunkPositions = new Float64Array(trunkNodes * 3)

    for (let index = 0; index < trunkNodes; index++) {
        const t = trunkNodes === 1 ? 0 : index / (trunkNodes - 1)
        const offset = lean * t * t + lean * 0.25 * t
        const sway = curve * t * t

        trunkPositions[index * 3] = Math.cos(leanAngle) * offset + Math.cos(curveAngle) * sway
        trunkPositions[index * 3 + 1] = crownBase * t
        trunkPositions[index * 3 + 2] = Math.sin(leanAngle) * offset + Math.sin(curveAngle) * sway
    }

    for (let index = 0; index < trunkNodes; index++) {
        const nextIndex = Math.min(index + 1, trunkNodes - 1)
        const previousIndex = Math.max(index - 1, 0)
        const at = index * 3
        const ax = trunkPositions[nextIndex * 3] - trunkPositions[previousIndex * 3]
        const ay = trunkPositions[nextIndex * 3 + 1] - trunkPositions[previousIndex * 3 + 1]
        const az = trunkPositions[nextIndex * 3 + 2] - trunkPositions[previousIndex * 3 + 2]
        const length = Math.sqrt(ax * ax + ay * ay + az * az)

        addNode(
            trunkPositions[at],
            trunkPositions[at + 1],
            trunkPositions[at + 2],
            index === 0 ? -1 : index - 1,
            length > 1e-9 ? ax / length : 0,
            length > 1e-9 ? ay / length : 1,
            length > 1e-9 ? az / length : 0,
            0,
        )
    }

    // --- The crown ------------------------------------------------------
    const attractors = sampleAttractors(parameters, createSeededRandom(hashSeed(seed, ATTRACTOR_SEED)))
    const attractorCount = attractors.length
    const attractorPoints = new Float64Array(attractorCount * 3)

    for (let index = 0; index < attractorCount; index++) {
        const point = attractors[index]

        attractorPoints[index * 3] = point[0]
        attractorPoints[index * 3 + 1] = point[1]
        attractorPoints[index * 3 + 2] = point[2]
    }

    const grid = buildPointGrid(attractorPoints, attractorCount, perceptionRadius)
    const near = new Int32Array(Math.max(attractorCount, 1))

    const reachable = new Uint8Array(attractorCount)
    const owner = new Int32Array(attractorCount)
    const ownerDistance = new Float64Array(attractorCount)
    const patience = new Int32Array(attractorCount)
    const limit = patienceRounds(perceptionRadius, stepLength)

    owner.fill(-1)
    ownerDistance.fill(Number.POSITIVE_INFINITY)

    // Per joint, the sum of the unit directions it is pulled in. Zeroed only
    // where it was written last round, so the loop never clears the whole tree.
    const pulls = new Float64Array(maxNodes * 3)
    const touched = new Int32Array(maxNodes)
    const marked = new Uint8Array(maxNodes)

    let touchedCount = 0
    let alive = attractorCount
    let frontier: number[] = [trunkNodes - 1]
    let rounds = 0

    while (frontier.length > 0 && alive > 0 && nodeCount < maxNodes && rounds < MAX_ROUNDS) {
        rounds++

        // Every attractor belongs to the nearest joint that can see it. Since
        // a joint's position never changes, checking each joint once as it is
        // born finds the true nearest joint without rescanning the tree.
        for (let f = 0; f < frontier.length; f++) {
            const joint = frontier[f]
            const at = joint * 3
            const x = positions[at]
            const y = positions[at + 1]
            const z = positions[at + 2]
            const found = grid.query(x, y, z, perceptionRadius, near)

            for (let k = 0; k < found; k++) {
                const attractor = near[k]

                if (reachable[attractor] === 1) {
                    continue
                }

                const point = attractor * 3
                const dx = attractorPoints[point] - x
                const dy = attractorPoints[point + 1] - y
                const dz = attractorPoints[point + 2] - z
                const distance = dx * dx + dy * dy + dz * dz

                if (distance < ownerDistance[attractor]) {
                    ownerDistance[attractor] = distance
                    owner[attractor] = joint
                }
            }
        }

        for (let k = 0; k < touchedCount; k++) {
            const joint = touched[k]
            const at = joint * 3

            pulls[at] = 0
            pulls[at + 1] = 0
            pulls[at + 2] = 0
            marked[joint] = 0
        }

        touchedCount = 0

        // Sum the pull each joint feels towards the attractors it owns. This
        // walks the attractors, not the tree, so it costs the same at every
        // size of tree.
        for (let attractor = 0; attractor < attractorCount; attractor++) {
            if (reachable[attractor] === 1) {
                continue
            }

            const joint = owner[attractor]

            if (joint < 0) {
                continue
            }

            if (patience[attractor]++ >= limit) {
                reachable[attractor] = 1
                owner[attractor] = -1
                alive--

                continue
            }

            const point = attractor * 3
            const at = joint * 3
            const dx = attractorPoints[point] - positions[at]
            const dy = attractorPoints[point + 1] - positions[at + 1]
            const dz = attractorPoints[point + 2] - positions[at + 2]
            const length = Math.sqrt(dx * dx + dy * dy + dz * dz)

            if (length < 1e-9) {
                continue
            }

            const inverse = 1 / length

            if (marked[joint] === 0) {
                marked[joint] = 1
                touched[touchedCount] = joint
                touchedCount++
            }

            pulls[at] += dx * inverse
            pulls[at + 1] += dy * inverse
            pulls[at + 2] += dz * inverse
        }

        // Every joint that sees light grows one child.
        const grown: number[] = []

        for (let k = 0; k < touchedCount; k++) {
            if (nodeCount >= maxNodes) {
                break
            }

            const joint = touched[k]
            const at = joint * 3
            const depth = depths[joint]
            const sag = droop * Math.min(1, depth / DROOP_DEPTH)

            let dx = pulls[at]
            let dy = pulls[at + 1] + reachForLight - sag
            let dz = pulls[at + 2]
            const length = Math.sqrt(dx * dx + dy * dy + dz * dz)

            if (length < 1e-9) {
                continue
            }

            const inverse = 1 / length

            dx *= inverse
            dy *= inverse
            dz *= inverse

            const x = positions[at]
            const y = positions[at + 1]
            const z = positions[at + 2]

            // A limb that has left the crown it was given has nothing left to
            // find: the points still alive are ones it has already grown past,
            // and chasing them would walk a stray twig out of the tree for
            // ever. Stopping here is what ends the growth.
            if (y > height * CROWN_HEADROOM) {
                continue
            }

            if (x * x + z * z > widestReach * widestReach) {
                continue
            }

            // Children leave from the side of a limb, not its centre line, and
            // each one turns a golden angle around it. Without the turn,
            // successive children of one joint would stack in a flat fan.
            const angle = children[joint] * GOLDEN_ANGLE
            const tx = directions[at]
            const ty = directions[at + 1]
            const tz = directions[at + 2]

            const axisX = Math.abs(ty) < 0.9 ? 0 : 1
            const axisY = Math.abs(ty) < 0.9 ? 1 : 0
            const sideX = axisY * tz
            const sideY = -axisX * tz
            const sideZ = axisX * ty - axisY * tx
            const sideLength = Math.sqrt(sideX * sideX + sideY * sideY + sideZ * sideZ)

            let perpX = 1
            let perpY = 0
            let perpZ = 0

            if (sideLength > 1e-9) {
                perpX = sideX / sideLength
                perpY = sideY / sideLength
                perpZ = sideZ / sideLength
            }

            const binormalX = ty * perpZ - tz * perpY
            const binormalY = tz * perpX - tx * perpZ
            const binormalZ = tx * perpY - ty * perpX
            const cos = Math.cos(angle)
            const sin = Math.sin(angle)
            const offset = Math.min(provisionalRadius(parameters, depth) * 0.9, stepLength * 0.6)

            const childX = x + dx * stepLength + (perpX * cos + binormalX * sin) * offset
            const childY = y + dy * stepLength + (perpY * cos + binormalY * sin) * offset
            const childZ = z + dz * stepLength + (perpZ * cos + binormalZ * sin) * offset

            children[joint]++

            const childId = addNode(
                childX,
                childY,
                childZ,
                joint,
                dx,
                dy,
                dz,
                depth + 1,
            )

            // The child's own direction is the direction it actually left in.
            const offsetX = childX - x
            const offsetY = childY - y
            const offsetZ = childZ - z
            const edgeLength = Math.sqrt(
                offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ,
            )

            if (edgeLength > 1e-9) {
                const edgeInverse = 1 / edgeLength

                directions[childId * 3] = offsetX * edgeInverse
                directions[childId * 3 + 1] = offsetY * edgeInverse
                directions[childId * 3 + 2] = offsetZ * edgeInverse
            }

            grown.push(childId)

            // Points the new limb has reached stop existing. The test is
            // against the whole edge and not just its end, so a limb that
            // sweeps past a point collects it instead of leaving it to lure a
            // twig out of the way later on. That is what keeps the number of
            // twigs down and stops the last few points from growing a tail of
            // joints that runs away from the crown.
            const edgeX = childX - x
            const edgeY = childY - y
            const edgeZ = childZ - z
            const edgeSquared = edgeX * edgeX + edgeY * edgeY + edgeZ * edgeZ
            const middleX = x + edgeX * 0.5
            const middleY = y + edgeY * 0.5
            const middleZ = z + edgeZ * 0.5
            const reached = grid.query(
                middleX,
                middleY,
                middleZ,
                killDistance + Math.sqrt(edgeSquared) * 0.5,
                near,
            )

            for (let m = 0; m < reached; m++) {
                const attractor = near[m]

                if (reachable[attractor] === 1) {
                    continue
                }

                const point = attractor * 3
                const toX = attractorPoints[point] - x
                const toY = attractorPoints[point + 1] - y
                const toZ = attractorPoints[point + 2] - z
                const along =
                    edgeSquared > 1e-12
                        ? Math.min(
                              1,
                              Math.max(
                                  0,
                                  (toX * edgeX + toY * edgeY + toZ * edgeZ) / edgeSquared,
                              ),
                          )
                        : 0
                const gapX = toX - edgeX * along
                const gapY = toY - edgeY * along
                const gapZ = toZ - edgeZ * along

                if (gapX * gapX + gapY * gapY + gapZ * gapZ > killDistance * killDistance) {
                    continue
                }

                reachable[attractor] = 1
                owner[attractor] = -1
                alive--
            }
        }

        frontier = grown
    }

    const raw: SkeletonNode[] = []

    for (let index = 0; index < nodeCount; index++) {
        const at = index * 3

        raw.push({
            id: index,
            parentId: parents[index] >= 0 ? parents[index] : null,
            position: [positions[at], positions[at + 1], positions[at + 2]],
            radius: 0,
            order: 0,
            direction: [directions[at], directions[at + 1], directions[at + 2]],
        })
    }

    const nodes = applyPipeModel(
        assignOrders(raw),
        parameters.pipeExponent,
        parameters.minTwigRadius,
        parameters.trunkRadius,
    )

    return {nodes, parameters, seed}
}
