/**
 * First-run guidance.
 *
 * The coach marks show once and are never seen again. They are a local
 * preference, not part of the project.
 */

const STORAGE_KEY = 'easy-props.coachMarksSeen'

export function hasSeenCoachMarks(): boolean {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
        return false
    }
}

export function rememberCoachMarks(): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
        // Storage may be unavailable. The marks will show again next time.
    }
}
