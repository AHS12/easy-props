/**
 * The shapes a game uses for walking into, drawn over the prop.
 *
 * See-through, so the prop shows through them, with their edges outlined so each
 * one reads as a solid. Violet, as nothing in a prop or a scene is, and it stays
 * clear of the Wind view's red and green.
 */

import * as THREE from 'three'
import type {CollisionShape} from '../../assets/shared/generator-types'
import {prismGeometry} from '../../core/export/pipeline/collision'

const COLOUR = '#b46cff'
const FILL_OPACITY = 0.22
const EDGE_OPACITY = 0.85

export interface CollisionView {
    readonly group: THREE.Group
    /** Replaces the shapes, or clears them with an empty list. */
    setShapes(shapes: readonly CollisionShape[]): void
    dispose(): void
}

export function createCollisionView(): CollisionView {
    const group = new THREE.Group()
    group.name = 'collision_shapes'

    // Drawn over the prop, so a shape inside a trunk still shows.
    const fill = new THREE.MeshBasicMaterial({color: COLOUR, transparent: true, opacity: FILL_OPACITY, depthWrite: false, depthTest: false})
    const edge = new THREE.LineBasicMaterial({color: COLOUR, transparent: true, opacity: EDGE_OPACITY, depthTest: false})

    const clear = () => {
        for (const child of [...group.children]) {
            group.remove(child)
            ;(child as THREE.Mesh | THREE.LineSegments).geometry.dispose()
        }
    }

    return {
        group,

        setShapes(shapes) {
            clear()

            for (const shape of shapes) {
                // The view draws the prop where it stands, so no pivot is taken off.
                const geometry = prismGeometry(shape, [0, 0, 0])
                const solid = new THREE.Mesh(geometry, fill)
                const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edge)

                solid.renderOrder = 990
                outline.renderOrder = 991
                group.add(solid, outline)
            }
        },

        dispose() {
            clear()
            fill.dispose()
            edge.dispose()
        },
    }
}
