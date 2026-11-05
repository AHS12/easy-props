/**
 * Builds a bark on background threads, so the interface never waits for it.
 *
 * The cells are listed once, sculpted in slices across the pool, and joined in
 * their original order, which makes the result the same as `buildBark`'s, down
 * to the last vertex. If workers cannot start, the same bark is built here on
 * the main thread instead: slower, never wrong.
 */

import type * as THREE from 'three'
import {barkGeometry, buildBark, type BarkArrays, type BarkChunk} from './bark-mesh'
import {buildLowPolyWood, facesToGeometry, lowPolyCrown, rememberCrown} from './low-poly-surface'
import type {PaintedTreeParameters} from './parameters'
import {planPaintedTree} from './plan'

export interface BarkJob {
    readonly tree: PaintedTreeParameters
    readonly seed: number
    readonly detail: number
}

export type BarkTask =
    | {readonly kind: 'low-poly-wood'; readonly job: BarkJob}
    | {readonly kind: 'low-poly-crown'; readonly job: BarkJob}
    | {readonly kind: 'cells'; readonly job: BarkJob}
    | {readonly kind: 'sculpt'; readonly job: BarkJob; readonly cells: Int32Array}
    | {
          readonly kind: 'assemble'
          readonly job: BarkJob
          readonly cells: Int32Array
          readonly chunks: readonly BarkChunk[]
      }

export type BarkTaskResult =
    | {readonly kind: 'low-poly-wood'; readonly wood: {positions: Float32Array; normals: Float32Array; colors: Float32Array}}
    | {readonly kind: 'low-poly-crown'; readonly crownKeys: readonly string[]; readonly crownFaces: readonly Float32Array[]}
    | {readonly kind: 'cells'; readonly cells: Int32Array}
    | {readonly kind: 'sculpt'; readonly chunk: BarkChunk}
    | {readonly kind: 'assemble'; readonly arrays: BarkArrays}

/** Real cores, not threads: the second thread of a core adds little to this. */
const MAX_WORKERS = 8
/** More slices than workers, because some slices hold far more surface. */
const SLICES_PER_WORKER = 3

interface Pending {
    readonly task: BarkTask
    readonly transfer: Transferable[]
    readonly resolve: (result: BarkTaskResult) => void
    readonly reject: (error: Error) => void
}

interface Pool {
    readonly size: number
    run(task: BarkTask, transfer?: Transferable[]): Promise<BarkTaskResult>
}

/** A number of threads chosen in settings, or null for automatic. */
let chosenSize: number | null = null

export function setBarkThreads(count: number | null): void {
    chosenSize = count
}

function createPool(onBroken: () => void): Pool {
    const size =
        chosenSize ?? Math.min(MAX_WORKERS, Math.max(2, Math.floor((navigator.hardwareConcurrency || 4) / 2)))
    const workers: Worker[] = []
    const idle: Worker[] = []
    const waiting: Pending[] = []
    const running = new Map<number, Pending>()
    let nextId = 0
    let broken = false

    const pump = () => {
        while (idle.length > 0 && waiting.length > 0) {
            const worker = idle.pop()!
            const pending = waiting.shift()!
            const id = nextId++

            running.set(id, pending)
            worker.postMessage({id, task: pending.task}, pending.transfer)
        }
    }

    const breakPool = () => {
        if (broken) {
            return
        }

        broken = true
        onBroken()

        for (const worker of workers) {
            worker.terminate()
        }

        for (const pending of [...running.values(), ...waiting]) {
            pending.reject(new Error('The bark workers stopped.'))
        }

        running.clear()
        waiting.length = 0
    }

    for (let index = 0; index < size; index++) {
        const worker = new Worker(new URL('./bark-worker.ts', import.meta.url), {type: 'module'})

        worker.onmessage = (event: MessageEvent<{id: number; result?: BarkTaskResult; error?: string}>) => {
            const {id, result, error} = event.data
            const pending = running.get(id)

            running.delete(id)
            idle.push(worker)

            if (result) {
                pending?.resolve(result)
            } else {
                pending?.reject(new Error(error))
            }

            pump()
        }
        worker.onerror = breakPool
        worker.onmessageerror = breakPool
        workers.push(worker)
        idle.push(worker)
    }

    return {
        size,
        run(task, transfer = []) {
            if (broken) {
                return Promise.reject(new Error('The bark workers stopped.'))
            }

            return new Promise((resolve, reject) => {
                waiting.push({task, transfer, resolve, reject})
                pump()
            })
        },
    }
}

let pool: Pool | null = null
let unavailable = false

function getPool(): Pool | null {
    if (unavailable || typeof Worker === 'undefined') {
        return null
    }

    if (!pool) {
        try {
            pool = createPool(() => {
                unavailable = true
                pool = null
            })
        } catch {
            unavailable = true
        }
    }

    return pool
}

/** Whether a bark can be built off the main thread at all. */
export const canBuildBarkOffThread = () => getPool() !== null

async function buildWithPool(active: Pool, job: BarkJob): Promise<THREE.BufferGeometry> {
    const listed = await active.run({kind: 'cells', job})
    const cells = (listed as {cells: Int32Array}).cells
    const cellCount = cells.length / 3
    const slices = Math.max(1, Math.min(active.size * SLICES_PER_WORKER, cellCount))
    const sculpted = await Promise.all(
        Array.from({length: slices}, (_, index) => {
            const slice = cells.slice(
                Math.floor((index * cellCount) / slices) * 3,
                Math.floor(((index + 1) * cellCount) / slices) * 3,
            )

            return active.run({kind: 'sculpt', job, cells: slice}, [slice.buffer])
        }),
    )
    const chunks = sculpted.map((result) => (result as {chunk: BarkChunk}).chunk)
    const assembled = await active.run({kind: 'assemble', job, cells, chunks}, [
        cells.buffer,
        ...chunks.flatMap((chunk) => [
            chunk.crossedEdges.buffer,
            chunk.vertexCells.buffer,
            chunk.positions.buffer,
            chunk.normals.buffer,
            chunk.colors.buffer,
        ]),
    ])

    return barkGeometry((assembled as {arrays: BarkArrays}).arrays)
}

/** A bark, built on the pool if it can be. Never rejects for want of workers. */
export async function buildBarkOffThread(job: BarkJob): Promise<THREE.BufferGeometry> {
    const active = getPool()

    if (active) {
        try {
            return await buildWithPool(active, job)
        } catch (error) {
            console.warn('Building the bark on the main thread instead.', error)
        }
    }

    return buildBark(planPaintedTree(job.tree, job.seed), job.tree, job.seed, job.detail)
}

/**
 * A low-poly tree's wood, built on one thread of the pool while its crown is
 * worked out on another. The crown is kept here, so the clumps that follow
 * find it ready.
 */
export async function buildLowPolyOffThread(job: BarkJob): Promise<THREE.BufferGeometry> {
    const active = getPool()

    if (active) {
        try {
            const [wood, crown] = (await Promise.all([
                active.run({kind: 'low-poly-wood', job}),
                active.run({kind: 'low-poly-crown', job}),
            ])) as [Extract<BarkTaskResult, {kind: 'low-poly-wood'}>, Extract<BarkTaskResult, {kind: 'low-poly-crown'}>]

            rememberCrown(job.tree, job.seed, job.detail, {
                faces: new Map(crown.crownKeys.map((key, index) => [key, crown.crownFaces[index]])),
            })

            return facesToGeometry(wood.wood)
        } catch (error) {
            console.warn('Building the low-poly tree on the main thread instead.', error)
        }
    }

    const plan = planPaintedTree(job.tree, job.seed)

    lowPolyCrown(plan, job.tree, job.seed, job.detail)

    return buildLowPolyWood(plan, job.tree, job.seed, job.detail)
}
