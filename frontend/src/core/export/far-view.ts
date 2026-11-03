/**
 * The far-away card an export would write, for showing in the view.
 *
 * It is drawn by the same functions from the same full-detail meshes, so what
 * is judged here is what ships.
 */

import type {StyleProfile} from '../../assets/style/style-profiles'
import type {StandIn} from '../../viewport/scene/component-renderer'
import type {Scene} from '../scene/scene-model'
import {APP_VERSION} from './export-preferences'
import {buildFarCard} from './pipeline/far'
import {mergeParts} from './pipeline/merge'
import {sceneExportSource} from './scene-source'

/** Null for a prop that offers no card, or when it can't be drawn. */
export async function farCardOf(scene: Scene, style: StyleProfile): Promise<StandIn | null> {
    const source = sceneExportSource(scene, style, APP_VERSION)

    if (source.farAway?.() !== true) {
        return null
    }

    const pivot = source.pivot()
    const parts = await source.buildAtDetail(1)
    const merged = mergeParts(parts, 'far', pivot)

    for (const {part} of parts) {
        part.geometry.dispose()
    }

    try {
        const card = await buildFarCard(merged, 'far')

        return card ? {geometry: card.geometry, material: card.material, pivot} : null
    } finally {
        for (const {geometry, material} of merged) {
            geometry.dispose()
            material.dispose()
        }
    }
}
