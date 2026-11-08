/**
 * What Report a problem can fill in from where the person is, so they don't
 * have to look it up: the version, and the prop that went wrong.
 */

import {findPreset} from '../../assets/trees/presets'
import type {Scene} from '../scene/scene-model'
import {BUG_ACTIONS} from './report-forms'

type BugAction = (typeof BUG_ACTIONS)[number]

export interface ReportPlace {
    /** Home, Your props, or the editor. */
    readonly onHome: boolean
    readonly exporting: boolean
    readonly exportingMany: boolean
    readonly partSelected: boolean
}

/** A first guess at What were you doing?, which the person can change. */
export function guessAction(place: ReportPlace): BugAction {
    if (place.exportingMany) {
        return 'Exporting many props at once'
    }

    if (place.exporting) {
        return 'Exporting one prop'
    }

    if (place.onHome) {
        return 'Browsing the home page or my saved props'
    }

    return place.partSelected ? 'Selecting or changing one part of a prop' : 'Shaping a prop with the sliders'
}

const LOOK_NAMES: Readonly<Record<string, string>> = {cartoon: 'Cartoon look', cel: 'Comic look'}

/**
 * The open prop in a line: its preset, seed, and anything that changes what it
 * looks like. Null with no prop open.
 */
export function propLine(scene: Scene, presetId: string, shading: string): string | null {
    const asset = scene.assets[0]

    if (!asset) {
        return null
    }

    const parts = [findPreset(presetId)?.name ?? 'Own prop', `seed ${asset.seed}`]

    if (asset.parameters.build === 'low-poly') {
        parts.push('Low-poly')
    }

    if (LOOK_NAMES[shading]) {
        parts.push(LOOK_NAMES[shading])
    }

    return parts.join(', ')
}
