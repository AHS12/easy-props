/**
 * The collision shapes an export would write, for showing in the view.
 *
 * They come from the same functions the export uses, so what is shown is what
 * ships. A generator that offers its own shapes costs nothing to ask. Only one
 * that offers none has its parts built, as the export does.
 */

import type {CollisionShape} from '../../assets/shared/generator-types'
import type {StyleProfile} from '../../assets/style/style-profiles'
import type {Scene} from '../scene/scene-model'
import {APP_VERSION} from './export-preferences'
import {collisionShapes} from './pipeline/collision'
import {sceneExportSource} from './scene-source'

export async function collisionShapesOf(scene: Scene, style: StyleProfile): Promise<readonly CollisionShape[]> {
    if (scene.assets.length === 0) {
        return []
    }

    const source = sceneExportSource(scene, style, APP_VERSION)
    const offered = source.collision()

    if (offered.length > 0) {
        return collisionShapes(offered, [])
    }

    const parts = await source.buildAtDetail(1)
    const shapes = collisionShapes([], parts)

    for (const {part} of parts) {
        part.geometry.dispose()
    }

    return shapes
}
