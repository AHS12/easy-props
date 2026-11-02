import {describe, expect, it, vi} from 'vitest'
import {getStyleProfile} from '../assets/style/style-profiles'

// Writing a real file needs a canvas for the textures, which tests don't have. The
// node names are all that's needed, so the file is just those names.
vi.mock('../core/export/glb-exporter', () => ({
    writeGLB: async (nodes: readonly {name: string}[]) => new TextEncoder().encode(nodes.map(({name}) => name).join('\n')).buffer,
}))
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {collisionShapesOf} from '../core/export/collision-view'
import {buildExport} from '../core/export/pipeline/package'
import {sceneExportSource} from '../core/export/scene-source'
import {useUiStore} from '../store/ui-store'
import {findCommand} from '../core/commands/commands'

const STYLE = getStyleProfile('detailed')

/** How many shapes an export writes, read from the files it makes. */
async function exportedShapes(presetId: string): Promise<number> {
    const files = await buildExport(sceneExportSource(createSceneFromPreset(presetId), STYLE, 'test'), {
        name: 'prop',
        engine: 'godot',
        levels: 1,
        collision: true,
        wind: false,
        join: false,
    })
    const shapes = files.find((file) => file.name === 'prop_collision.glb')

    if (!shapes) {
        return 0
    }

    const text = new TextDecoder().decode(shapes.bytes)

    return text.match(/-convcolonly/g)?.length ?? 0
}

describe('the collision shapes in the view', () => {
    it.each(['blossom-tree', 'round-canopy', 'boulder', 'round-bush', 'grass-tuft', 'daisies'])(
        'are the shapes an export of %s writes',
        async (presetId) => {
            const shown = await collisionShapesOf(createSceneFromPreset(presetId), STYLE)

            expect(shown.length).toBe(await exportedShapes(presetId))
        },
        20000,
    )

    it('come from a tree, a rock and a bush', async () => {
        for (const presetId of ['blossom-tree', 'round-canopy', 'boulder', 'round-bush']) {
            expect((await collisionShapesOf(createSceneFromPreset(presetId), STYLE)).length).toBeGreaterThan(0)
        }
    })

    it('are none for grass, which nothing stops you walking through', async () => {
        expect(await collisionShapesOf(createSceneFromPreset('grass-tuft'), STYLE)).toEqual([])
    })

    it('are turned on and off from the View commands', () => {
        const command = findCommand('toggle-collision')!

        expect(command.label).toBe('Show what you can walk into')
        expect(useUiStore.getState().showCollision).toBe(false)
        command.run(undefined as never)
        expect(useUiStore.getState().showCollision).toBe(true)
        command.run(undefined as never)
        expect(useUiStore.getState().showCollision).toBe(false)
    })
})
