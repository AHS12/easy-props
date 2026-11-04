/**
 * What Home and Your props say about a saved prop: its name, the icon of its
 * kind, and how long ago it was saved, in the fewest words that are still true.
 */

import {Box, Brush, TreePine, type LucideIcon} from 'lucide-react'
import type {PropFamily} from '../assets/trees/presets'
import {calendarDaysBetween} from '../core/library/prop-summary'
import type {SavedTree} from '../platform/library'

export const FAMILY_ICONS: Readonly<Record<PropFamily, LucideIcon>> = {tree: TreePine, rock: Box, bush: Brush}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** How long ago a prop was saved, in the fewest words that are still true. */
export function savedLabel(savedAt: string, now: Date = new Date()): string {
    const saved = new Date(savedAt)
    const elapsed = now.getTime() - saved.getTime()

    if (Number.isNaN(elapsed) || elapsed < MINUTE) {
        return 'just now'
    }

    const minutes = Math.floor(elapsed / MINUTE)

    if (minutes < 60) {
        return `${minutes} min ago`
    }

    const hours = Math.floor(elapsed / HOUR)

    if (hours < 24) {
        return hours === 1 ? '1 hour ago' : `${hours} hours ago`
    }

    if (calendarDaysBetween(saved, now) === 1) {
        return 'yesterday'
    }

    return new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'short'}).format(saved)
}

export function displayName(tree: SavedTree): string {
    const name = typeof tree.name === 'string' ? tree.name.trim() : ''

    return name === '' ? 'Untitled prop' : name
}
