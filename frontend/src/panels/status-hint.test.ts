import {describe, expect, it} from 'vitest'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {EMPTY_SELECTION} from '../core/selection/selection'
import {hintFor} from './status-hint'

const scene = createSceneFromPreset('blossom-tree')
const clump = scene.assets[0].components.find((part) => part.generatorId === 'painted-clump')!
const base = {status: {state: 'ready' as const}, moveTool: false, selection: EMPTY_SELECTION, scene}

describe('the status hint', () => {
    it('follows the camera scheme', () => {
        expect(hintFor(base, 'easy-props')).toContain('Left drag to orbit')
        expect(hintFor(base, 'blender')).toContain('Middle drag to orbit')
    })

    it('changes with the selection and the tool', () => {
        const selection = {selectedId: clump.id, hoveredId: null}

        expect(hintFor({...base, selection}, 'easy-props')).toContain('G to move')
        expect(hintFor({...base, selection, moveTool: true}, 'easy-props')).toContain('Drag an arrow')
        expect(hintFor({...base, moveTool: true}, 'easy-props')).toContain('Click a part')
    })

    it('puts a status message first', () => {
        expect(hintFor({...base, status: {state: 'busy', message: 'Working'}}, 'easy-props')).toBe('Working')
    })
})
