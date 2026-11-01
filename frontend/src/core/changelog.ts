/**
 * Reading CHANGELOG.md, so What's new shows what the file says and there is one copy.
 *
 * It reads only the shapes that file uses: "## version (date)" starts a release,
 * "**Title**" a group, "- " an item that may carry on over indented lines, and any
 * other line is a note.
 */

export interface ChangelogGroup {
    readonly title: string | null
    readonly items: readonly string[]
}

export interface Release {
    readonly version: string
    readonly date: string
    readonly notes: readonly string[]
    readonly groups: readonly ChangelogGroup[]
}

export function parseChangelog(text: string): Release[] {
    const releases: {version: string; date: string; notes: string[]; groups: {title: string | null; items: string[]}[]}[] = []

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        const release = releases[releases.length - 1]
        const heading = /^##\s+(\S+)(?:\s+\((.+)\))?$/.exec(line)

        if (heading) {
            releases.push({version: heading[1], date: heading[2] ?? '', notes: [], groups: []})
        } else if (!release || line === '') {
            continue
        } else if (/^\*\*.+\*\*$/.test(line)) {
            release.groups.push({title: line.slice(2, -2), items: []})
        } else if (line.startsWith('- ')) {
            if (release.groups.length === 0) {
                release.groups.push({title: null, items: []})
            }

            release.groups[release.groups.length - 1].items.push(line.slice(2))
        } else {
            const items = release.groups[release.groups.length - 1]?.items

            // Indented under an item, it is the rest of that item.
            if (raw.startsWith(' ') && items && items.length > 0) {
                items[items.length - 1] += ` ${line}`
            } else {
                release.notes.push(line)
            }
        }
    }

    return releases
}

/** Whether What's new should open by itself: once per version, and never over a tour. */
export function whatsNewDue(state: {
    readonly loaded: boolean
    readonly wanted: boolean
    readonly seenVersion: string
    readonly version: string
    readonly tourSeen: boolean
    readonly tourOpen: boolean
}): boolean {
    return state.loaded && state.wanted && state.seenVersion !== state.version && state.tourSeen && !state.tourOpen
}
