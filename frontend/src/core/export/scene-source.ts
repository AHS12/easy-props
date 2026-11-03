/**
 * A scene, as something the export pipeline can read.
 *
 * It builds from the same components the viewport does, so hand edits survive,
 * and throws its geometry away with the export. This is the one place that
 * knows the pipeline's parts come from registered generators.
 */

import * as THREE from 'three'
import {SimplifyModifier} from 'three/examples/jsm/modifiers/SimplifyModifier.js'
import {createSeededRandom, hashSeed} from '../../assets/shared/random'
import {roleOfPart, type GeneratedPart, type PartGenerator} from '../../assets/shared/generator-types'
import type {SceneComponent} from '../../assets/shared/component-types'
import type {StyleProfile} from '../../assets/style/style-profiles'
import {findComponentGenerator} from '../../assets/component-generators'
import {findPropGenerator} from '../../assets/prop-generators'
import {materialColor} from '../../viewport/scene/component-renderer'
import type {Scene, SceneMaterials} from '../scene/scene-model'
import type {ExportSource, PlacedPart, Vec3} from './pipeline/types'
import {yieldIfBusy} from './pipeline/yield'

/** How much a part may grow to cover for the parts a lighter level leaves out. */
const MAX_THINNED_GROWTH = 1.25
/** The fewest corners simplifying leaves a part of wood. */
const MIN_SIMPLIFIED_VERTICES = 10

/** Fewer sides and rings, for a generator that only knows its style. */
function lightenStyle(style: StyleProfile, detail: number): StyleProfile {
    return {
        ...style,
        radialSegments: Math.max(3, Math.round(style.radialSegments * Math.sqrt(detail))),
        heightSegments: Math.max(1, Math.round(style.heightSegments * detail)),
    }
}

async function buildPart(
    generator: PartGenerator,
    parameters: object,
    component: SceneComponent,
    fullStyle: StyleProfile,
    detail: number,
): Promise<GeneratedPart> {
    const style = generator.scalesWithDetail ? fullStyle : lightenStyle(fullStyle, detail)
    const build = generator.dress ? generator.buildOffThread?.(parameters, style, detail) : null

    if (build) {
        return generator.dress!(await build, parameters)
    }

    return generator.generate(parameters, {
        random: createSeededRandom(component.seed),
        seed: component.seed,
        style,
        detail,
    })
}

/** Stable across levels, so a lighter level keeps some of the parts above it. */
function keepsPart(component: SceneComponent, detail: number): boolean {
    let hash = 0

    for (const char of component.id) {
        hash = hashSeed(hash, char.charCodeAt(0))
    }

    return createSeededRandom(hash)() < detail
}

function placeComponent(
    component: SceneComponent,
    part: GeneratedPart,
    materials: SceneMaterials,
    style: StyleProfile,
    growth: number,
): PlacedPart {
    const {position, rotation, scale} = component.transform
    const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...scale).multiplyScalar(growth),
    )
    const color = new THREE.Color(materialColor(part.material, materials))

    return {
        part,
        matrix: matrix.toArray(),
        tint: [color.r, color.g, color.b],
        flatShading: style.flatShading,
    }
}

export function sceneExportSource(scene: Scene, style: StyleProfile, appVersion: string): ExportSource {
    const asset = scene.assets[0]
    const treeGenerator = asset ? findPropGenerator(asset.generatorId) : undefined
    const treeParameters = () => treeGenerator!.validate(asset.parameters).parameters

    return {
        async buildAtDetail(detail) {
            const placed: PlacedPart[] = []

            for (const component of asset?.components ?? []) {
                const generator = findComponentGenerator(component.generatorId)

                if (!generator) {
                    continue
                }

                const parameters = generator.validate(component.parameters).parameters as object
                const part = await buildPart(generator, parameters, component, style, detail)

                await yieldIfBusy()

                // A generator that cannot lighten itself is lightened from outside:
                // its wood simplified, and fewer leaf masses, each larger, so the
                // outline holds.
                if (!generator.scalesWithDetail && roleOfPart(part) !== 'foliage' && detail < 1) {
                    const welded = part.geometry.getAttribute('position').count
                    // Enough is kept that a thin branch stays a branch, and reaches as far.
                    const removed = Math.min(Math.floor(welded * (1 - Math.sqrt(detail))), Math.max(welded - MIN_SIMPLIFIED_VERTICES, 0))
                    const simplified = await new SimplifyModifier().modify(part.geometry, removed)

                    part.geometry.dispose()
                    placed.push(placeComponent(component, {...part, geometry: simplified}, asset.materials, style, 1))
                    continue
                }

                if (!generator.scalesWithDetail && roleOfPart(part) === 'foliage' && detail < 1) {
                    if (!keepsPart(component, detail)) {
                        part.geometry.dispose()
                        continue
                    }

                    const growth = Math.min(1 / Math.sqrt(detail), MAX_THINNED_GROWTH)

                    placed.push(placeComponent(component, part, asset.materials, style, growth))
                    continue
                }

                placed.push(placeComponent(component, part, asset.materials, style, 1))
            }

            return placed
        },

        collision() {
            return treeGenerator?.collision?.(treeParameters(), asset.seed) ?? []
        },

        pivot(): Vec3 {
            return (treeGenerator?.pivot?.(treeParameters(), asset.seed) as Vec3 | undefined) ?? [0, 0, 0]
        },

        farAway() {
            return asset !== undefined && treeGenerator?.farAway?.(treeParameters()) === true
        },

        sways() {
            return treeGenerator?.still !== true
        },

        swaysEvenly() {
            return treeGenerator?.swaysEvenly === true
        },

        describe() {
            return {
                generator: asset?.generatorId ?? null,
                generatorVersion: treeGenerator?.version ?? null,
                seed: asset?.seed ?? null,
                style: style.id,
                parameters: asset?.parameters ?? {},
                appVersion,
            }
        },
    }
}
