/**
 * What the Your props page knows about a saved prop without opening it.
 *
 * Reading is shallow and forgiving, as the gallery's always was: a folder with
 * one broken file still lists the rest, and the broken one is listed too.
 */

import {familyOfProp, findPreset, type PropFamily} from '../../assets/trees/presets'

export interface PropSummary {
    readonly name: string
    /** Null for a file that can't be read, which belongs to no kind. */
    readonly kind: PropFamily | null
    readonly presetId: string | null
    readonly presetName: string | null
    readonly seed: number | null
    /** ISO timestamp from the file, or null when it doesn't say. */
    readonly createdAt: string | null
}

export const UNREADABLE_NAME = 'Unreadable prop'

const UNREADABLE: PropSummary = {
    name: UNREADABLE_NAME,
    kind: null,
    presetId: null,
    presetName: null,
    seed: null,
    createdAt: null,
}

const textOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

export function summarizeProp(contents: string): PropSummary {
    let parsed: unknown

    try {
        parsed = JSON.parse(contents)
    } catch {
        return UNREADABLE
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return UNREADABLE
    }

    const document = parsed as Record<string, unknown>
    const assets = (document.scene as {assets?: unknown} | null | undefined)?.assets
    const asset: unknown = Array.isArray(assets) ? assets[0] : undefined

    if (!asset || typeof asset !== 'object') {
        return UNREADABLE
    }

    const {generatorId, seed} = asset as Record<string, unknown>
    const presetId = textOf(document.preset)

    return {
        name: textOf(document.name)?.trim() ?? 'Untitled prop',
        kind: familyOfProp(presetId, textOf(generatorId)),
        presetId,
        presetName: presetId ? (findPreset(presetId)?.name ?? null) : null,
        seed: typeof seed === 'number' && Number.isFinite(seed) ? seed : null,
        createdAt: textOf(document.createdAt),
    }
}

export type PropSort = 'changed' | 'name' | 'made'

/** The fields sorting, grouping and search need. */
export interface ListedProp {
    readonly id: string
    readonly name: string
    readonly savedAt: string
    readonly createdAt: string | null
    readonly presetName: string | null
}

const collator = new Intl.Collator(undefined, {sensitivity: 'base', numeric: true})

const timeOf = (iso: string | null): number => {
    const time = iso ? Date.parse(iso) : Number.NaN

    return Number.isNaN(time) ? 0 : time
}

/** Newest first for both dates, so the prop you touched last leads. Ties go by name. */
export function sortProps<T extends ListedProp>(props: readonly T[], sort: PropSort): T[] {
    const byName = (left: T, right: T) => collator.compare(left.name, right.name) || left.id.localeCompare(right.id)

    return [...props].sort((left, right) => {
        switch (sort) {
            case 'name':
                return byName(left, right)
            case 'made':
                return timeOf(right.createdAt ?? right.savedAt) - timeOf(left.createdAt ?? left.savedAt) || byName(left, right)
            default:
                return timeOf(right.savedAt) - timeOf(left.savedAt) || byName(left, right)
        }
    })
}

export type TimeGroup = 'Today' | 'This week' | 'This month' | 'Earlier'

const DAY = 24 * 60 * 60 * 1000

/** Whole calendar days between two moments, so a clock change is still one day. */
export function calendarDaysBetween(from: Date, to: Date): number {
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate())

    return Math.round((end.getTime() - start.getTime()) / DAY)
}

export function timeGroupOf(savedAt: string, now: Date): TimeGroup {
    const days = calendarDaysBetween(new Date(timeOf(savedAt)), now)

    if (days <= 0) {
        return 'Today'
    }

    if (days < 7) {
        return 'This week'
    }

    return days < 31 ? 'This month' : 'Earlier'
}

/** Props already sorted by Last changed, split into runs under a heading each. */
export function groupByTime<T extends ListedProp>(props: readonly T[], now: Date): {group: TimeGroup; props: T[]}[] {
    const groups: {group: TimeGroup; props: T[]}[] = []

    for (const prop of props) {
        const group = timeGroupOf(prop.savedAt, now)
        const last = groups.at(-1)

        if (last?.group === group) {
            last.props.push(prop)
        } else {
            groups.push({group, props: [prop]})
        }
    }

    return groups
}

/** A name or the preset it started from, so "oak" still finds an oak renamed "Big one". */
export function matchesSearch(prop: ListedProp, needle: string): boolean {
    const wanted = needle.trim().toLowerCase()

    return (
        wanted === '' ||
        prop.name.toLowerCase().includes(wanted) ||
        (prop.presetName?.toLowerCase().includes(wanted) ?? false)
    )
}
