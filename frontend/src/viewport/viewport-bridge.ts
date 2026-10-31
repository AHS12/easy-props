/**
 * How the rest of the app asks the view to do something.
 *
 * Three.js objects stay out of the stores, so menus and commands reach the camera
 * through this one registered handle. Before a view exists these do nothing.
 */

export type ViewAngle = 'front' | 'side' | 'top' | 'perspective'

export interface ViewportHandle {
    /** Frames the selected part, or the whole prop when nothing is selected. */
    frame(): void
    setView(angle: ViewAngle): void
    /** What the stats overlay shows. */
    stats(): {readonly drawCalls: number; readonly size: readonly [number, number, number]}
}

let handle: ViewportHandle | null = null

export function registerViewport(next: ViewportHandle | null): void {
    handle = next
}

export const viewportHandle = () => handle
