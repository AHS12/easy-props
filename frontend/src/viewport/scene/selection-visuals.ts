/**
 * Selection feedback in the viewport.
 *
 * Selection is never carried by colour alone: the selected object gets an
 * outline. The emissive lift stays very low so the material keeps its own
 * colour — a green tree is a bark problem, not a selection signal.
 */

import * as THREE from 'three'
import type {SelectionState} from '../../core/selection/selection'
import type {ViewportScene} from './create-scene'
import {VIEWPORT_COLORS} from './materials'

const SELECTED_EMISSIVE_INTENSITY = 0.05
const HOVERED_EMISSIVE_INTENSITY = 0.14

export function applySelectionVisuals(viewport: ViewportScene, selection: SelectionState): void {
    const {mesh, outline, componentId} = viewport.placeholder
    const material = mesh.material as THREE.MeshStandardMaterial

    const isSelected = selection.selectedId === componentId
    const isHovered = selection.hoveredId === componentId

    outline.visible = isSelected

    if (isSelected || isHovered) {
        material.emissive.set(VIEWPORT_COLORS.selection)
        material.emissiveIntensity = isSelected
            ? SELECTED_EMISSIVE_INTENSITY
            : HOVERED_EMISSIVE_INTENSITY
    } else {
        material.emissive.set('#000000')
        material.emissiveIntensity = 0
    }
}
