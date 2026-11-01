/**
 * The land around a prop in the Meadow backdrop.
 *
 * Made by the same generators the props are, because an asset that looks fine alone
 * can still fail in a scene. It belongs to the view: it is never counted, picked or
 * exported. Grass repeats one patch per distance band, drawn as instances. The Grove
 * demo is the same land with trees added.
 */

import * as THREE from 'three'
import {buildBushCore, buildBushLeaves, type BushParameters} from '../../assets/bushes/bush-mesh'
import {bushDefaults} from '../../assets/bushes/bush-generator'
import {buildGrassMesh} from '../../assets/grass/blade-mesh'
import {grassDefaults} from '../../assets/grass/grass-generator'
import {buildPlantMesh} from '../../assets/plants/plant-mesh'
import {plantDefaults} from '../../assets/plants/plant-generator'
import {cutRockDefaults, type CutRockParameters} from '../../assets/rocks/cut-rock-generator'
import {buildRockMesh} from '../../assets/rocks/rock-mesh'
import {planRock} from '../../assets/rocks/rock-plan'
import {getLeafTexture} from '../../assets/shared/leaf-texture'
import {createSeededRandom, randomRange} from '../../assets/shared/random'
import {getStyleProfile} from '../../assets/style/style-profiles'
import {mergeParts} from '../../core/export/pipeline/merge'
import {sceneExportSource} from '../../core/export/scene-source'
import {createSceneFromPreset} from '../../core/scene/initial-scene'

const SEED = 5150
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const NEAR_PATCHES = 110
const FAR_PATCHES = 150
const FLOWER_CLUMPS = 22
const NEAR_REACH = 11
const FAR_REACH = 30
/** How much of a prop's width grass may grow into, so it stands in the grass and not in a clearing. */
const CLEARING_SHARE = 0.7
const TREE_DETAIL = 0.4
/** The room a tree needs from the prop: its crown may hang over, its trunk may not stand in it. */
const TREE_TRUNK_ROOM = 1.5

/** Where things stand. Nothing here overlaps, and a test holds that. */
export const SCENERY_BUSHES: readonly {width: number; height: number; seed: number; x: number; z: number; open: boolean}[] = [
    {width: 3, height: 2, seed: 21, x: 7.5, z: -8, open: false},
    {width: 2.2, height: 1.5, seed: 22, x: 3, z: -9, open: true},
    {width: 1.4, height: 1, seed: 23, x: 4, z: -3.5, open: false},
    {width: 3.4, height: 2.3, seed: 24, x: -5, z: -9, open: false},
    {width: 1.6, height: 1.1, seed: 25, x: -7, z: 2, open: true},
    {width: 2.6, height: 1.8, seed: 26, x: 12, z: 4, open: false},
]

export const SCENERY_ROCKS: readonly {x: number; z: number; seed: number; rock: Partial<CutRockParameters> & {width: number; depth: number}}[] = [
    {x: 9, z: -2.5, seed: 31, rock: {kind: 'outcrop', width: 6, height: 2.6, depth: 3.5, chunks: 5, moss: 0.85}},
    {x: -1, z: -6, seed: 32, rock: {width: 2.4, height: 1.3, depth: 2, moss: 0.6}},
    {x: 0.5, z: 4.5, seed: 33, rock: {width: 0.9, height: 0.45, depth: 0.7, chunks: 1, faces: 0.45, moss: 0.3}},
    {x: 16, z: -19, seed: 34, rock: {kind: 'cliff', width: 34, height: 22, depth: 12, chunks: 26, faces: 0.45, moss: 0.25}},
]

/** Behind the prop as the camera first sees it, with the blossom tree the largest. */
export const SCENERY_TREES: readonly {preset: string; x: number; z: number; scale: number}[] = [
    {preset: 'blossom-tree', x: 4.5, z: -12.5, scale: 1.25},
    {preset: 'spring-tree', x: -11, z: -12, scale: 1},
    {preset: 'oak', x: 17, z: -9, scale: 1},
    {preset: 'spring-tree', x: -15, z: 3, scale: 0.85},
    {preset: 'oak', x: 15, z: 13, scale: 0.9},
]

interface Placed {
    readonly x: number
    readonly z: number
    readonly radius: number
    readonly matrix: THREE.Matrix4
}

export interface MeadowScenery {
    readonly group: THREE.Group
    /** Clears anything standing where the prop is. */
    setClearing(radius: number): void
    /** Trees are the difference between the two demos. */
    setTrees(wanted: boolean): void
    dispose(): void
}

function placeAround(random: () => number, count: number, inner: number, outer: number, radius: number, scale: readonly [number, number]): Placed[] {
    return Array.from({length: count}, (_, i) => {
        const out = Math.sqrt(inner * inner + ((i + random()) / count) * (outer * outer - inner * inner))
        const azimuth = i * GOLDEN_ANGLE
        const x = Math.cos(azimuth) * out
        const z = Math.sin(azimuth) * out
        const size = randomRange(random, scale[0], scale[1])

        return {
            x,
            z,
            radius: radius * size,
            matrix: new THREE.Matrix4().compose(
                new THREE.Vector3(x, 0, z),
                new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2),
                new THREE.Vector3(size, size, size),
            ),
        }
    })
}

export function createMeadowScenery(): MeadowScenery {
    const random = createSeededRandom(SEED)
    const group = new THREE.Group()
    const geometries: THREE.BufferGeometry[] = []
    const solid = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1})
    const leaves = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1, map: getLeafTexture(), alphaTest: 0.5})
    const zero = new THREE.Matrix4().makeScale(0, 0, 0)
    const instanced: {mesh: THREE.InstancedMesh; places: readonly Placed[]}[] = []
    const single: {mesh: THREE.Object3D; x: number; z: number; radius: number}[] = []
    const treeMaterials: THREE.Material[] = []

    group.name = 'meadow_scenery'

    const keep = (geometry: THREE.BufferGeometry) => {
        geometries.push(geometry)

        return geometry
    }

    const addInstances = (geometry: THREE.BufferGeometry, places: readonly Placed[]) => {
        const mesh = new THREE.InstancedMesh(keep(geometry), solid, places.length)

        mesh.frustumCulled = false
        group.add(mesh)
        instanced.push({mesh, places})
    }

    addInstances(
        buildGrassMesh({...grassDefaults, blades: 260, height: 0.8, dryness: 0.12, flowers: 8}, 11, 1),
        placeAround(random, NEAR_PATCHES, 0, NEAR_REACH, 1, [0.9, 1.2]),
    )
    addInstances(
        buildGrassMesh({...grassDefaults, blades: 70, clumps: 5, height: 0.75, bladeWidth: 0.1, smoothness: 2, dryness: 0.08}, 12, 1),
        placeAround(random, FAR_PATCHES, NEAR_REACH - 1, FAR_REACH, 1.2, [1.2, 1.7]),
    )
    addInstances(
        buildPlantMesh({...plantDefaults, stems: 14, width: 0.9, height: 0.55}, 13, 1),
        placeAround(random, FLOWER_CLUMPS, 1, 9, 0.5, [0.9, 1.3]),
    )

    const addSolid = (mesh: THREE.Object3D, x: number, z: number, radius: number, turn: number) => {
        mesh.position.set(x, 0, z)
        mesh.rotation.y = turn
        group.add(mesh)
        single.push({mesh, x, z, radius})
    }

    const addBush = (width: number, height: number, seed: number, x: number, z: number, open: boolean) => {
        const bush: BushParameters = {
            ...bushDefaults,
            width,
            height,
            depth: width * 0.9,
            leafSize: width * 0.07,
            lobes: 6,
            inside: open ? 'open' : 'solid',
            fullness: open ? 1.3 : bushDefaults.fullness,
        }
        const pair = new THREE.Group()

        pair.add(new THREE.Mesh(keep(buildBushCore(bush, seed, 1)), solid), new THREE.Mesh(keep(buildBushLeaves(bush, seed, 1)), leaves))
        addSolid(pair, x, z, width / 2, seed)
    }

    const addRock = (x: number, z: number, seed: number, rock: Partial<typeof cutRockDefaults>) => {
        const whole = {...cutRockDefaults, ...rock}

        addSolid(new THREE.Mesh(keep(buildRockMesh(planRock(whole, seed), whole, seed, 1)), solid), x, z, Math.max(whole.width, whole.depth) / 2, 0)
    }

    for (const {width, height, seed, x, z, open} of SCENERY_BUSHES) {
        addBush(width, height, seed, x, z, open)
    }

    for (const {x, z, seed, rock} of SCENERY_ROCKS) {
        addRock(x, z, seed, rock)
    }

    const trees = new THREE.Group()
    let treesStarted = false
    let disposed = false
    const treeSingles: typeof single = []

    /** Real trees from the presets, at their lighter level. They take a moment, so they arrive when ready. */
    const loadTrees = async () => {
        for (const {preset, x, z, scale} of SCENERY_TREES) {
            const parts = await sceneExportSource(createSceneFromPreset(preset), getStyleProfile('detailed'), 'view').buildAtDetail(TREE_DETAIL)

            if (disposed) {
                return
            }

            const tree = new THREE.Group()

            for (const {geometry, material} of mergeParts(parts, preset, [0, 0, 0])) {
                keep(geometry)
                treeMaterials.push(material)
                tree.add(new THREE.Mesh(geometry, material))
            }

            for (const {part} of parts) {
                part.geometry.dispose()
            }

            tree.position.set(x, 0, z)
            tree.scale.setScalar(scale)
            tree.rotation.y = x + z
            tree.visible = Math.hypot(x, z) > clearing + TREE_TRUNK_ROOM
            trees.add(tree)
            treeSingles.push({mesh: tree, x, z, radius: TREE_TRUNK_ROOM})
        }
    }

    group.add(trees)

    let clearing = 0

    const setClearing = (radius: number) => {
        clearing = radius

        for (const {mesh, places} of instanced) {
            places.forEach((place, index) => {
                const clear = Math.hypot(place.x, place.z) < radius * CLEARING_SHARE + place.radius * 0.3

                mesh.setMatrixAt(index, clear ? zero : place.matrix)
            })
            mesh.instanceMatrix.needsUpdate = true
        }

        for (const {mesh, x, z, radius: own} of [...single, ...treeSingles]) {
            mesh.visible = Math.hypot(x, z) > radius + own
        }
    }

    setClearing(0)

    return {
        group,
        setClearing,
        setTrees(wanted) {
            trees.visible = wanted

            if (wanted && !treesStarted) {
                treesStarted = true
                void loadTrees()
            }
        },
        dispose() {
            disposed = true

            for (const geometry of geometries) {
                geometry.dispose()
            }

            for (const {mesh} of instanced) {
                mesh.dispose()
            }

            for (const material of treeMaterials) {
                material.dispose()
            }

            solid.dispose()
            leaves.dispose()
        },
    }
}
