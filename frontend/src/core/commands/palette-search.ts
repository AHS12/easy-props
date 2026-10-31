/**
 * How the palette ranks what you type.
 *
 * Pure, so it can be tested without a screen. Enter runs the top row, which is why
 * a typo-tolerant match always ranks below any exact one, and why the start of a
 * word beats a match inside one: "move" must never put "Remove part" first.
 */

/** Words people type for what the app calls something else. */
const SYNONYMS: Readonly<Record<string, string>> = {
    lod: 'detail level',
    poly: 'detail faces',
    triangles: 'faces detail',
    tris: 'faces detail',
    delete: 'remove',
    reset: 'restore',
    colour: 'color',
    color: 'colour',
    fps: 'frame limit',
    preferences: 'settings',
    options: 'settings',
}

export interface Searchable {
    readonly label: string
    readonly keywords?: string
}

/** True when the word is within one typing slip of the target. */
function closeTo(word: string, target: string): boolean {
    if (word.length < 4 || Math.abs(word.length - target.length) > 1) {
        return false
    }

    let i = 0
    let j = 0
    let slips = 0

    while (i < word.length && j < target.length) {
        if (word[i] === target[j]) {
            i += 1
            j += 1
            continue
        }

        slips += 1

        if (slips > 1) {
            return false
        }

        // A swapped pair is one slip.
        if (word[i] === target[j + 1] && word[i + 1] === target[j]) {
            i += 2
            j += 2
        } else if (word.length > target.length) {
            i += 1
        } else if (word.length < target.length) {
            j += 1
        } else {
            i += 1
            j += 1
        }
    }

    return slips + (word.length - i) + (target.length - j) <= 1
}

function scoreWord(word: string, label: string, parts: readonly string[], all: readonly string[], haystack: string): number {
    if (label.startsWith(word)) {
        return 8
    }

    if (parts.some((part) => part.startsWith(word))) {
        return 6
    }

    if (all.some((part) => part.startsWith(word))) {
        return 3
    }

    if (haystack.includes(word)) {
        return 2
    }

    return all.some((part) => closeTo(word, part)) ? 0.5 : -1
}

/** How well an entry answers the query. Negative for not at all. */
export function scoreEntry(entry: Searchable, query: string): number {
    const label = entry.label.toLowerCase()
    const parts = label.split(/[\s:()…-]+/).filter(Boolean)
    const haystack = `${label} ${(entry.keywords ?? '').toLowerCase()}`
    const all = haystack.split(/[\s:()…-]+/).filter(Boolean)
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

    let total = 0

    for (const word of words) {
        let score = scoreWord(word, label, parts, all, haystack)
        const synonym = SYNONYMS[word]

        if (synonym) {
            // Only the name counts here: a group called "Bark detail" is not about LODs.
            const viaSynonym = synonym.split(' ').some((other) => parts.some((part) => part.startsWith(other)))

            // The word means this feature, so it beats a passing mention elsewhere.
            score = Math.max(score, viaSynonym ? 6.5 : -1)
        }

        if (score < 0) {
            return -1
        }

        total += score
    }

    return total
}

/**
 * Entries matching the query, best first.
 *
 * Use only breaks near-ties: a command you run a lot rises above a similar one,
 * and never above a clearly better match.
 */
export function rankEntries<T extends Searchable>(
    entries: readonly T[],
    query: string,
    usageOf: (entry: T) => number = () => 0,
): readonly T[] {
    const scored = entries
        .map((entry) => ({entry, score: scoreEntry(entry, query)}))
        .filter(({score}) => score >= 0)
    // Typo tolerance is for when nothing else answers. Beside a real match it is noise.
    const real = scored.filter(({score}) => score >= 1)

    return (real.length > 0 ? real : scored)
        .map(({entry, score}) => ({entry, score: score + Math.min(usageOf(entry), 20) * 0.01}))
        .sort((a, b) => b.score - a.score)
        .map(({entry}) => entry)
}

/** What a leading character limits the search to. */
export type PaletteSection = 'Actions' | 'Controls' | 'Presets' | 'Saved props' | 'Settings'

const PREFIXES: Readonly<Record<string, PaletteSection>> = {'>': 'Actions', '#': 'Controls', '@': 'Presets'}

export function parsePrefix(query: string): {readonly section: PaletteSection | null; readonly text: string} {
    const section = PREFIXES[query[0]] ?? null

    return section ? {section, text: query.slice(1)} : {section: null, text: query}
}
