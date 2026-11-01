/** The steps of getting the view ready, as the loading screen tells them. */

export type LoadStep = 'view' | 'prop' | 'draw' | 'scene'

/** How far along the bar is heading during each step. */
export const LOAD_SHARE: Record<LoadStep, number> = {view: 0.3, prop: 0.7, draw: 0.95, scene: 0.85}

export function loadStepLabel(step: LoadStep, name: string): string {
    switch (step) {
        case 'view':
            return 'Setting up the view…'
        case 'prop':
            return `Building ${name}…`
        case 'draw':
            return 'Almost ready…'
        case 'scene':
            return 'Building the scene…'
    }
}
