/** The steps of getting the view ready, as the loading screen tells them. */

export type LoadStep = 'view' | 'prop' | 'draw' | 'previews' | 'scene' | 'low-poly' | 'normal'

/** How far along the bar is heading during each step. */
export const LOAD_SHARE: Record<LoadStep, number> = {view: 0.3, prop: 0.7, draw: 0.9, previews: 0.97, scene: 0.85, 'low-poly': 0.7, normal: 0.7}

export function loadStepLabel(step: LoadStep, name: string): string {
    switch (step) {
        case 'view':
            return 'Setting up the view…'
        case 'prop':
            return `Building ${name}…`
        case 'draw':
            return 'Almost ready…'
        case 'previews':
            return 'Drawing the previews…'
        case 'scene':
            return 'Building the scene…'
        case 'low-poly':
            return 'Switching to Low-poly…'
        case 'normal':
            return 'Switching to Normal…'
    }
}
