/**
 * The Milestone 1 placeholder object.
 *
 * A single hand-built trunk, standing in for the real tree generator that
 * arrives in Milestone 2. It exists so the viewport, lighting, picking, and
 * selection can be proven before any generator is written.
 *
 * Its geometry is derived from the scene graph, not the other way around.
 */

import * as THREE from 'three'
import type {StyleProfile} from '../../assets/style/style-profiles'
import {PLACEHOLDER_COMPONENT_ID} from '../../core/scene/initial-scene'
import {findComponent, type Scene} from '../../core/scene/scene-model'
import {createSurfaceMaterial, MATERIAL_COLORS, VIEWPORT_COLORS} from './materials'

export interface PlaceholderParameters {
    /** Height of the trunk in metres. */
    readonly height: number
    /** Radius at the base in metres. */
    readonly baseRadius: number
}

export interface PlaceholderObject {
    readonly group: THREE.Group
    readonly mesh: THREE.Mesh
    readonly outline: THREE.Mesh
    readonly componentId: string
    dispose(): void
}

export const DEFAULT_PLACEHOLDER_PARAMETERS: PlaceholderParameters = {
    height: 3,
    baseRadius: 0.36,
}

/**
 * Reads the placeholder's parameters out of the scene graph.
 *
 * The scene graph is the source of truth; the mesh follows it.
 */
export function readPlaceholderParameters(scene: Scene): PlaceholderParameters {
    const component = findComponent(scene, PLACEHOLDER_COMPONENT_ID)
    const parameters = component?.parameters ?? {}

    return {
        height:
            typeof parameters.height === 'number'
                ? parameters.height
                : DEFAULT_PLACEHOLDER_PARAMETERS.height,
        baseRadius:
            typeof parameters.baseRadius === 'number'
                ? parameters.baseRadius
                : DEFAULT_PLACEHOLDER_PARAMETERS.baseRadius,
    }
}

/**
 * Trunk silhouette as (radius factor, height factor) pairs.
 *
 * A flared base that tapers to a thinner tip, so the shape reads as a tree
 * rather than a cylinder.
 */
const TRUNK_PROFILE: readonly (readonly [number, number])[] = [
    [0.0, 0.0],
    [1.0, 0.0],
    [0.86, 0.1],
    [0.7, 0.33],
    [0.56, 0.63],
    [0.47, 0.9],
    [0.42, 1.0],
]

function createTrunkGeometry(
    radialSegments: number,
    parameters: PlaceholderParameters,
    radiusScale: number,
): THREE.LatheGeometry {
    const points = TRUNK_PROFILE.map(
        ([radius, height]) =>
            new THREE.Vector2(parameters.baseRadius * radius * radiusScale, parameters.height * height),
    )

    const geometry = new THREE.LatheGeometry(points, radialSegments)
    geometry.computeVertexNormals()

    return geometry
}

export function createPlaceholder(
    profile: StyleProfile,
    parameters: PlaceholderParameters,
): PlaceholderObject {
    const group = new THREE.Group()
    group.name = 'placeholder'

    const material = createSurfaceMaterial(MATERIAL_COLORS.bark, profile.flatShading)

    const mesh = new THREE.Mesh(createTrunkGeometry(profile.radialSegments, parameters, 1), material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = 'trunk_placeholder'
    mesh.userData.componentId = PLACEHOLDER_COMPONENT_ID
    group.add(mesh)

    const outlineMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(VIEWPORT_COLORS.selection),
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.95,
    })

    const outline = new THREE.Mesh(
        createTrunkGeometry(profile.radialSegments, parameters, 1.07),
        outlineMaterial,
    )
    outline.name = 'trunk_placeholder_outline'
    outline.visible = false
    outline.userData.isHelper = true
    group.add(outline)

    return {
        group,
        mesh,
        outline,
        componentId: PLACEHOLDER_COMPONENT_ID,
        dispose() {
            mesh.geometry.dispose()
            outline.geometry.dispose()
            material.dispose()
            outlineMaterial.dispose()
        },
    }
}
