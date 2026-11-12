/**
 * The colours a set of props is matched to.
 *
 * Each kind of prop has its own palettes, so a set can't put a tree and a bush on one
 * leaf palette. It matches each colour setting the props share: every tree on one
 * Palette and one Bark colour, every rock on one Stone, every flower on one colour.
 *
 * A prop is matched by building it again with its colour settings changed, which keeps
 * its own light and dark. That happens in the export only: the saved prop stays as it is.
 */

import {findPropGenerator} from '../../assets/prop-generators'
import type {ChoiceParameter} from '../../assets/shared/parameters'
import {OWN_COLOURS} from '../../assets/style/own-colours'
import {familyOfProp, PROP_FAMILIES} from '../../assets/trees/presets'
import {getStyleProfile, type StyleProfileId} from '../../assets/style/style-profiles'
import type {Scene} from '../scene/scene-model'
import {updateTreeParameters} from '../scene/scene-ops'

/** The settings that say what colours a prop is painted in. */
const COLOUR_KEYS: readonly string[] = ['palette', 'barkTone', 'flowerColour']
/** A prop's own colours: no two are alike, so a set can't match to them. */
const OWN_VALUES: readonly string[] = [OWN_COLOURS]

/** One colour setting that props in a set share, and the choice the set makes for it. */
export interface ColourGroup {
    /** The setting and the choices it offers, so only props offering the same choices share it. */
    readonly id: string
    readonly key: string
    /** What the setting is called, with the kind of prop: "Tree: Palette". */
    readonly label: string
    readonly options: readonly {readonly value: string; readonly label: string}[]
    /** The choice most of the set uses, which the set starts on. */
    readonly usual: string
    /** How many props in the set have this setting. */
    readonly props: number
}

/** A prop in a set, as its kind and settings. */
export interface SetProp {
    readonly generatorId: string
    readonly parameters: Readonly<Record<string, unknown>>
}

function colourChoices(prop: SetProp): readonly ChoiceParameter[] {
    const generator = findPropGenerator(prop.generatorId)
    const shown = generator?.shownControls?.(prop.parameters) ?? generator?.parameters ?? []

    return shown.filter((spec): spec is ChoiceParameter => spec.kind === 'choice' && COLOUR_KEYS.includes(spec.key))
}

const groupIdOf = (spec: ChoiceParameter) => `${spec.key}:${spec.options.map(({value}) => value).join(',')}`

/** The colour settings a set of props shares, each starting on the choice most of them use. */
export function colourGroups(props: readonly SetProp[]): readonly ColourGroup[] {
    const groups = new Map<string, {spec: ChoiceParameter; label: string; counts: Map<string, number>; props: number}>()

    for (const prop of props) {
        // In the words the app's tabs use: Tree, Rock, Bush.
        const family = familyOfProp(null, prop.generatorId)
        const kind = PROP_FAMILIES.find(({id}) => id === family)?.label ?? 'Prop'

        for (const spec of colourChoices(prop)) {
            const id = groupIdOf(spec)
            const group = groups.get(id) ?? {spec, label: `${kind}: ${spec.label}`, counts: new Map(), props: 0}
            const value = String(prop.parameters[spec.key] ?? spec.default)

            group.props++

            if (!OWN_VALUES.includes(value)) {
                group.counts.set(value, (group.counts.get(value) ?? 0) + 1)
            }

            groups.set(id, group)
        }
    }

    return [...groups.entries()].map(([id, {spec, label, counts, props: count}]) => {
        const options = spec.options.filter(({value}) => !OWN_VALUES.includes(value))
        // Ties go to the choice listed first, so the same set always starts the same way.
        const usual = options.reduce<string | null>((best, {value}) => ((counts.get(value) ?? 0) > (best === null ? 0 : (counts.get(best) ?? 0)) ? value : best), null)

        return {id, key: spec.key, label, options, usual: usual ?? String(spec.default), props: count}
    })
}

/** The set's choice for each group, by its id. */
export type SetColours = Readonly<Record<string, string>>

export const usualColours = (groups: readonly ColourGroup[]): SetColours => Object.fromEntries(groups.map((group) => [group.id, group.usual]))

/** The prop in the set's colours. A prop with no colour setting in the set is as it was. */
export function inSetColours(scene: Scene, colours: SetColours, style: StyleProfileId): Scene {
    let matched = scene

    for (const asset of scene.assets) {
        const patch: Record<string, string> = {}

        for (const spec of colourChoices(asset)) {
            const pick = colours[groupIdOf(spec)]

            if (pick !== undefined && asset.parameters[spec.key] !== pick) {
                patch[spec.key] = pick
            }
        }

        if (Object.keys(patch).length > 0) {
            matched = updateTreeParameters(matched, asset.id, patch, getStyleProfile(style))
        }
    }

    return matched
}
