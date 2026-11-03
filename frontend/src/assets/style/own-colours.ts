/**
 * My own colours, for every kind of prop that picks its colours from a named list.
 *
 * A choice gains one more option, and a colour control for each colour its named
 * options already hold, in the same order. Nothing new is coloured: own colours only
 * replace a named ramp.
 */

import type {z} from 'zod'
import {colourSchema, type ChoiceParameter, type ColourParameter, type ParameterSpec} from '../shared/parameters'

export const OWN_COLOURS = 'custom'
export type OwnColours = typeof OWN_COLOURS

export const OWN_COLOURS_OPTION = {value: OWN_COLOURS, label: 'My own colours'} as const

export interface OwnColourRow<K extends string = string> {
    readonly key: K
    readonly label: string
}

export const STONE_ROWS = [
    {key: 'stoneShadow', label: 'Stone shadow'},
    {key: 'stoneDark', label: 'Stone dark'},
    {key: 'stoneLight', label: 'Stone light'},
    {key: 'stoneHighlight', label: 'Stone highlight'},
] as const

export const LEAF_ROWS = [
    {key: 'leafShadow', label: 'Leaf shadow'},
    {key: 'leafDark', label: 'Leaf dark'},
    {key: 'leafLight', label: 'Leaf light'},
    {key: 'leafHighlight', label: 'Leaf highlight'},
] as const

export const GRASS_ROWS = [
    {key: 'grassRoot', label: 'Grass root'},
    {key: 'grassLow', label: 'Grass low'},
    {key: 'grassHigh', label: 'Grass high'},
    {key: 'grassTip', label: 'Grass tip'},
] as const

export const FLOWER_ROWS = [
    {key: 'flowerDeep', label: 'Flower deep'},
    {key: 'flowerMiddle', label: 'Flower middle'},
    {key: 'flowerLight', label: 'Flower light'},
] as const

export const CACTUS_ROWS = [
    {key: 'cactusShadow', label: 'Cactus shadow'},
    {key: 'cactusDark', label: 'Cactus dark'},
    {key: 'cactusLight', label: 'Cactus light'},
    {key: 'cactusHighlight', label: 'Cactus highlight'},
    {key: 'spineColour', label: 'Spine colour'},
] as const

export type RowKey<R extends readonly OwnColourRow[]> = R[number]['key']

/**
 * The values own colours add to a prop's parameters. Defaults leave them out, so
 * presets built from defaults stay as they were, and validating fills them in.
 */
export type OwnColourValues<R extends readonly OwnColourRow[]> = Readonly<Record<RowKey<R>, string>>

export interface OwnColourControls<K extends string> {
    readonly specs: readonly ColourParameter[]
    readonly schema: Readonly<Record<K, z.ZodType<string>>>
}

/** The colour controls for a choice whose named options are `named`. */
export function ownColours<K extends string>(
    choice: ChoiceParameter,
    named: Readonly<Record<string, readonly string[]>>,
    rows: readonly OwnColourRow<K>[],
    set: string,
): OwnColourControls<K> {
    const options = choice.options.filter((option) => option.value !== OWN_COLOURS && named[option.value])
    const specs = rows.map((row, index): ColourParameter => {
        const byChoice = Object.fromEntries(options.map((option) => [option.value, named[option.value][index]]))

        return {
            kind: 'colour',
            key: row.key,
            label: row.label,
            group: choice.group,
            default: byChoice[choice.default] ?? '#808080',
            ownOf: choice.key,
            set,
            named: byChoice,
            swatches: options.map((option) => ({name: option.label, value: byChoice[option.value]})),
        }
    })

    return {
        specs,
        schema: Object.fromEntries(specs.map((spec) => [spec.key, colourSchema(spec)])) as Record<K, z.ZodType<string>>,
    }
}

/** The colours to draw with: a named option's, or the prop's own. */
export function rampOf<T extends string>(
    choice: T | OwnColours,
    named: Readonly<Record<T, readonly string[]>>,
    values: object,
    rows: readonly OwnColourRow[],
): readonly string[] {
    if (choice !== OWN_COLOURS) {
        return named[choice as T]
    }

    const fallback = Object.values<readonly string[]>(named)[0]

    return rows.map((row, index) => {
        const value = (values as Record<string, unknown>)[row.key]

        return typeof value === 'string' ? value : fallback[index]
    })
}

/**
 * What else changes when a choice switches to My own colours: its colours start
 * from the named option that was showing, so nothing jumps.
 */
export function startOwnColours(
    specs: readonly ParameterSpec[],
    values: Readonly<Record<string, unknown>>,
    patch: Readonly<Record<string, unknown>>,
): Record<string, string> {
    const start: Record<string, string> = {}

    for (const spec of specs) {
        if (spec.kind !== 'colour' || patch[spec.ownOf] !== OWN_COLOURS || values[spec.ownOf] === OWN_COLOURS) {
            continue
        }

        const choice = specs.find((other) => other.key === spec.ownOf)
        const was = values[spec.ownOf] ?? (choice?.kind === 'choice' ? choice.default : undefined)

        start[spec.key] = spec.named[String(was)] ?? spec.default
    }

    return start
}

/** Colour controls show only while their choice is shown and on My own colours. */
export function withOwnColoursShown(shown: readonly ParameterSpec[], values: Readonly<Record<string, unknown>>): readonly ParameterSpec[] {
    return shown.filter(
        (spec) => spec.kind !== 'colour' || (values[spec.ownOf] === OWN_COLOURS && shown.some((other) => other.key === spec.ownOf)),
    )
}
