/**
 * The index of saved props: each one's summary, kept so a page of props doesn't
 * read every file on every visit.
 *
 * It is a shortcut, never the truth. An entry is trusted only while its file's
 * size and time saved are the ones it was read at, and a damaged index is
 * simply built again from the files.
 */

import {z} from 'zod'
import type {PropSummary} from './prop-summary'

export const PROPS_INDEX_VERSION = 1

export interface IndexedFile {
    readonly id: string
    readonly size: number
    readonly savedAt: string
}

interface IndexEntry {
    readonly size: number
    readonly savedAt: string
    readonly summary: PropSummary
}

export type PropsIndex = Readonly<Record<string, IndexEntry>>

const summarySchema = z.object({
    name: z.string(),
    kind: z.enum(['tree', 'rock', 'bush']).nullable(),
    presetId: z.string().nullable(),
    presetName: z.string().nullable(),
    seed: z.number().nullable(),
    createdAt: z.string().nullable(),
})

const indexSchema = z.object({
    version: z.literal(PROPS_INDEX_VERSION),
    props: z.record(z.string(), z.object({size: z.number(), savedAt: z.string(), summary: summarySchema})),
})

/** The index in a file, or an empty one when it's missing, damaged or from another version. */
export function parsePropsIndex(text: string | null): PropsIndex {
    if (!text) {
        return {}
    }

    try {
        const result = indexSchema.safeParse(JSON.parse(text))

        return result.success ? result.data.props : {}
    } catch {
        return {}
    }
}

export function serializePropsIndex(index: PropsIndex): string {
    return JSON.stringify({version: PROPS_INDEX_VERSION, props: index})
}

/**
 * The summary of every file, reading only those the index can't vouch for.
 * Files that are gone drop out of the index. `changed` says whether it's worth
 * writing back.
 */
export async function refreshPropsIndex(
    index: PropsIndex,
    files: readonly IndexedFile[],
    read: (id: string) => Promise<PropSummary>,
): Promise<{index: PropsIndex; summaries: ReadonlyMap<string, PropSummary>; changed: boolean}> {
    const next: Record<string, IndexEntry> = {}
    const summaries = new Map<string, PropSummary>()
    let changed = Object.keys(index).some((id) => !files.some((file) => file.id === id))

    await Promise.all(
        files.map(async (file) => {
            const known = index[file.id]

            if (known && known.size === file.size && known.savedAt === file.savedAt) {
                next[file.id] = known
                summaries.set(file.id, known.summary)
                return
            }

            const summary = await read(file.id)

            changed = true
            next[file.id] = {size: file.size, savedAt: file.savedAt, summary}
            summaries.set(file.id, summary)
        }),
    )

    return {index: next, summaries, changed}
}
