/**
 * Deciding what a restore does, before anything moves.
 *
 * A restore never replaces anything: a prop that differs from the one saved
 * here comes in as a second copy, named so you can tell them apart, and a
 * palette of the same name with other colours is kept beside yours.
 */

import {savedPalette, type SavedPalette} from '../settings/settings-spec'

/** How a prop in a backup compares with the saved prop of the same id. */
export type HeldStatus = 'new' | 'same' | 'different'

export interface HeldToRestore {
    readonly id: string
    readonly name: string
    readonly status: HeldStatus
}

/** What Go needs to bring one prop in. */
export interface RestoreChoice {
    readonly id: string
    /** Set when the prop comes in beside the saved one, as a second copy. */
    readonly copyId: string
    readonly copyContents: string
}

export const FROM_BACKUP = '(from backup)'

/** "Old oak (from backup)", or "Old oak (from backup) 2" when that's taken. */
export function backupCopyName(name: string, taken: ReadonlySet<string>): string {
    const base = `${name} ${FROM_BACKUP}`

    if (!taken.has(base)) {
        return base
    }

    let count = 2

    while (taken.has(`${base} ${count}`)) {
        count += 1
    }

    return `${base} ${count}`
}

/** The prop file's text with a new name, every other key kept as it was. */
export function renamedProp(text: string, name: string): string {
    const document = JSON.parse(text) as Record<string, unknown>

    return `${JSON.stringify({...document, name}, null, 2)}\n`
}

/**
 * What to restore for the ticked props. Props already here, byte for byte, are
 * left out whatever the ticks say. One that differs comes in under a new id and
 * a name of its own, read from `textOf`.
 */
export function planRestore(
    held: readonly HeldToRestore[],
    ticked: ReadonlySet<string>,
    savedNames: readonly string[],
    textOf: (id: string) => string,
    newId: () => string,
): RestoreChoice[] {
    const taken = new Set(savedNames)

    return held
        .filter((prop) => ticked.has(prop.id) && prop.status !== 'same')
        .map((prop) => {
            if (prop.status === 'new') {
                return {id: prop.id, copyId: '', copyContents: ''}
            }

            const name = backupCopyName(prop.name, taken)

            taken.add(name)

            return {id: prop.id, copyId: newId(), copyContents: renamedProp(textOf(prop.id), name)}
        })
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

const sameColours = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((colour, index) => colour.toLowerCase() === b[index].toLowerCase())

/**
 * Your palettes with the backup's merged in by name: a new name is added, the
 * same name and colours is skipped, and the same name with other colours is
 * added as "Forest (from backup)". A damaged palettes file adds nothing.
 */
export function mergePalettes(
    current: readonly SavedPalette[],
    backupText: string,
    newId: () => string,
): {palettes: SavedPalette[]; added: number} {
    let entries: unknown

    try {
        entries = JSON.parse(backupText)
    } catch {
        return {palettes: [...current], added: 0}
    }

    const incoming = Array.isArray(entries) ? entries.flatMap(savedPalette) : []
    const palettes = [...current]
    let added = 0

    for (const palette of incoming) {
        const named = palettes.filter((mine) => mine.set === palette.set && sameName(mine.name, palette.name))

        if (named.some((mine) => sameColours(mine.colours, palette.colours))) {
            continue
        }

        const taken = new Set(palettes.filter((mine) => mine.set === palette.set).map((mine) => mine.name))
        const name = named.length === 0 ? palette.name : backupCopyName(palette.name, taken)

        palettes.push({...palette, id: palettes.some((mine) => mine.id === palette.id) ? newId() : palette.id, name})
        added += 1
    }

    return {palettes, added}
}
