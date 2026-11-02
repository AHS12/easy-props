/**
 * Exporting many props, one after another.
 *
 * One prop is built, written and let go before the next starts, so memory stays
 * flat however long the list is. A prop that fails is noted and passed over.
 */

import {findBudgetTarget, type BudgetTargetId} from './budget'
import {buildExport, ExportCancelled} from './package'
import type {ExportFile, ExportSettings, ExportSource} from './types'

export interface BatchItem {
    /** Already safe to be a file name, and unique in the batch. */
    readonly name: string
    load(): Promise<ExportSource> | ExportSource
}

export interface BatchOptions {
    readonly settings: Omit<ExportSettings, 'name'>
    readonly budget: BudgetTargetId
    /** `name` is the prop's, for a batch that gives each prop a folder of its own. */
    write(files: readonly ExportFile[], name: string): Promise<void>
    readonly signal?: AbortSignal
    /** Called as each prop starts, and once more at the end. */
    onProgress?(done: number, total: number, current: string | null): void
}

export interface BatchSummary {
    readonly exported: number
    readonly total: number
    readonly bytes: number
    readonly overBudget: readonly {readonly name: string; readonly faces: number}[]
    readonly failures: readonly {readonly name: string; readonly message: string}[]
    readonly cancelled: boolean
}

export async function runBatch(items: readonly BatchItem[], options: BatchOptions): Promise<BatchSummary> {
    const {settings, signal, onProgress} = options
    const target = findBudgetTarget(options.budget)
    const overBudget: {name: string; faces: number}[] = []
    const failures: {name: string; message: string}[] = []
    let exported = 0
    let bytes = 0
    let cancelled = false

    for (const [index, item] of items.entries()) {
        if (signal?.aborted) {
            cancelled = true
            break
        }

        onProgress?.(index, items.length, item.name)

        try {
            const files = await buildExport(await item.load(), {...settings, name: item.name}, undefined, signal)
            const faces = Math.max(0, ...files.map((file) => file.faces ?? 0))

            await options.write(files, item.name)

            exported++
            bytes += files.reduce((sum, file) => sum + file.bytes.length, 0)

            if (faces > target.faces) {
                overBudget.push({name: item.name, faces})
            }
        } catch (error) {
            if (error instanceof ExportCancelled) {
                cancelled = true
                break
            }

            failures.push({name: item.name, message: error instanceof Error ? error.message : String(error)})
        }
    }

    onProgress?.(exported + failures.length, items.length, null)

    return {exported, total: items.length, bytes, overBudget, failures, cancelled}
}
