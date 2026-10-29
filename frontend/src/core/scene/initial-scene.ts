/**
 * The scene graph starts with a single placeholder trunk.
 *
 * Milestone 2 replaces this with the real branching tree generator. Keeping
 * the placeholder in the graph rather than only in the viewport means
 * selection, the inspector, and the live region all work from day one.
 */

import {IDENTITY_TRANSFORM, type Scene} from './scene-model'

export const PLACEHOLDER_COMPONENT_ID = 'cmp-placeholder-trunk'

export function createInitialScene(): Scene {
    return {
        id: 'scene-1',
        assets: [
            {
                id: 'asset-1',
                kind: 'tree',
                generatorId: 'placeholder-tree',
                generatorVersion: 1,
                seed: 1,
                components: [
                    {
                        id: PLACEHOLDER_COMPONENT_ID,
                        type: 'trunk',
                        generatorId: 'placeholder-trunk',
                        generatorVersion: 1,
                        parentId: null,
                        transform: IDENTITY_TRANSFORM,
                        parameters: {height: 3, baseRadius: 0.36},
                        styleOverrides: null,
                        seed: 1,
                    },
                ],
            },
        ],
    }
}
