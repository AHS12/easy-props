/**
 * A thread that does its share of building a bark.
 *
 * It rebuilds the plan and the field from the tree's settings rather than being
 * sent them: both are pure, and quick against the sculpting they make possible.
 */

import {assembleBark, listBarkCells, prepareBark, sculptBarkCells, type BarkContext} from './bark-mesh'
import type {BarkJob, BarkTask, BarkTaskResult} from './bark-pool'
import {planPaintedTree} from './plan'

let lastKey = ''
let lastContext: BarkContext | null = null

function contextFor({tree, seed, detail}: BarkJob): BarkContext {
    const key = JSON.stringify([tree, seed, detail])

    if (!lastContext || key !== lastKey) {
        lastContext = prepareBark(planPaintedTree(tree, seed), tree, seed, detail)
        lastKey = key
    }

    return lastContext
}

function run(task: BarkTask): {result: BarkTaskResult; transfer: Transferable[]} {
    const context = contextFor(task.job)

    switch (task.kind) {
        case 'cells': {
            const cells = listBarkCells(context)

            return {result: {kind: 'cells', cells}, transfer: [cells.buffer]}
        }

        case 'sculpt': {
            const chunk = sculptBarkCells(context, task.cells)

            return {
                result: {kind: 'sculpt', chunk},
                transfer: [
                    chunk.crossedEdges.buffer,
                    chunk.vertexCells.buffer,
                    chunk.positions.buffer,
                    chunk.normals.buffer,
                    chunk.colors.buffer,
                ],
            }
        }

        case 'assemble': {
            const arrays = assembleBark(context, task.cells, task.chunks)

            return {
                result: {kind: 'assemble', arrays},
                transfer: [
                    arrays.positions.buffer,
                    arrays.normals.buffer,
                    arrays.colors.buffer,
                    arrays.indices.buffer,
                ],
            }
        }
    }
}

self.onmessage = (event: MessageEvent<{id: number; task: BarkTask}>) => {
    const {id, task} = event.data

    try {
        const {result, transfer} = run(task)

        self.postMessage({id, result}, {transfer})
    } catch (error) {
        self.postMessage({id, error: String(error)})
    }
}
