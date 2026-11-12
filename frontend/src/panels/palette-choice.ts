/**
 * A colour choice seen as palettes: the named ones, the user's saved ones, and
 * My own colours. A painted tree's Palette is one, and so is every choice with
 * own colours, such as a rock's Stone.
 */

import {COLOUR_KEYS, COLOUR_LABELS, resolvePalette, validatePaintedTreeParameters} from '../assets/trees/painted'
import type {ChoiceParameter, ParameterSpec} from '../assets/shared/parameters'
import {CACTUS_ROWS, FLOWER_ROWS, GRASS_ROWS, LEAF_ROWS, OWN_COLOURS, STONE_ROWS} from '../assets/style/own-colours'
import {BUSH_RAMPS, CACTUS_RAMPS, GRASS_RAMPS, PALETTES, PETAL_RAMPS, ROCK_RAMPS} from '../assets/style/palettes'
import type {SavedPalette} from '../core/settings/settings-spec'

export const TREE_SET = 'tree'

export interface PaletteSet {
    readonly set: string
    readonly title: string
    /** Each colour in it, in order. */
    readonly labels: readonly string[]
    /** Where a new palette starts: the kind's usual colours. */
    readonly start: readonly string[]
}

/** Every set of colours a palette can be saved for. */
export const PALETTE_SETS: readonly PaletteSet[] = [
    {set: TREE_SET, title: 'Trees', labels: COLOUR_KEYS.map((key) => COLOUR_LABELS[key]), start: COLOUR_KEYS.map((key) => PALETTES.spring[key])},
    {set: 'stone', title: 'Rocks', labels: STONE_ROWS.map((row) => row.label), start: ROCK_RAMPS.greystone},
    {set: 'bush-leaves', title: 'Bush leaves', labels: LEAF_ROWS.map((row) => row.label), start: BUSH_RAMPS.summer},
    {set: 'grass', title: 'Grass', labels: GRASS_ROWS.map((row) => row.label), start: GRASS_RAMPS.meadow},
    {set: 'flowers', title: 'Flowers', labels: FLOWER_ROWS.map((row) => row.label), start: PETAL_RAMPS.pink},
    {set: 'cactus', title: 'Cacti', labels: CACTUS_ROWS.map((row) => row.label), start: CACTUS_RAMPS.desert},
]

/** A name no palette of the set has yet: "New palette", then "New palette 2" and on. */
export function freeName(base: string, taken: readonly string[]): string {
    const lower = new Set(taken.map((name) => name.trim().toLowerCase()))

    if (!lower.has(base.toLowerCase())) {
        return base
    }

    let count = 2

    while (lower.has(`${base} ${count}`.toLowerCase())) {
        count++
    }

    return `${base} ${count}`
}

export interface PaletteChoice {
    readonly key: string
    readonly label: string
    /** Which saved palettes fit it. */
    readonly set: string
    /** Where its own colours are kept, in order. */
    readonly colourKeys: readonly string[]
    /** The colours showing now. */
    readonly current: readonly string[]
    readonly value: string
    readonly named: readonly {readonly value: string; readonly label: string; readonly colours: readonly string[]}[]
}

/** The palettes of a choice, or null when it isn't a colour choice. */
export function paletteChoiceFor(
    spec: ParameterSpec,
    specs: readonly ParameterSpec[],
    values: Readonly<Record<string, unknown>>,
): PaletteChoice | null {
    if (spec.kind !== 'choice') {
        return null
    }

    const value = typeof values[spec.key] === 'string' ? (values[spec.key] as string) : spec.default
    const own = specs.flatMap((other) => (other.kind === 'colour' && other.ownOf === spec.key ? [other] : []))

    if (own.length > 0) {
        return {
            key: spec.key,
            label: spec.label,
            set: own[0].set,
            colourKeys: own.map((colour) => colour.key),
            current: own.map((colour) =>
                value === OWN_COLOURS
                    ? typeof values[colour.key] === 'string'
                        ? (values[colour.key] as string)
                        : colour.default
                    : (colour.named[value] ?? colour.default),
            ),
            value,
            named: namedOptions(spec, (option) => own.map((colour) => colour.named[option] ?? colour.default)),
        }
    }

    if (isTreePalette(spec)) {
        const tree = resolvePalette(validatePaintedTreeParameters(values).parameters)

        return {
            key: spec.key,
            label: spec.label,
            set: TREE_SET,
            colourKeys: COLOUR_KEYS,
            current: COLOUR_KEYS.map((key) => tree[key]),
            value,
            named: namedOptions(spec, (option) => COLOUR_KEYS.map((key) => PALETTES[option as keyof typeof PALETTES][key])),
        }
    }

    return null
}

function isTreePalette(spec: ChoiceParameter): boolean {
    return spec.key === 'palette' && spec.options.every((option) => option.value === OWN_COLOURS || option.value in PALETTES)
}

function namedOptions(spec: ChoiceParameter, coloursOf: (option: string) => readonly string[]) {
    return spec.options
        .filter((option) => option.value !== OWN_COLOURS)
        .map((option) => ({value: option.value, label: option.label, colours: coloursOf(option.value)}))
}

/** The settings that give a choice these colours, as its own. */
export function ownColoursPatch(choice: PaletteChoice, colours: readonly string[]): Record<string, string> {
    return {
        [choice.key]: OWN_COLOURS,
        ...Object.fromEntries(choice.colourKeys.map((key, index) => [key, colours[index] ?? choice.current[index]])),
    }
}

const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((colour, index) => colour.toLowerCase() === b[index].toLowerCase())

/** The saved palette a choice is showing, when its own colours are exactly one. */
export function savedPaletteShowing(choice: PaletteChoice, saved: readonly SavedPalette[]): SavedPalette | undefined {
    return choice.value === OWN_COLOURS
        ? saved.find((palette) => palette.set === choice.set && same(palette.colours, choice.current))
        : undefined
}

/** Matches a search the way the rest of the app does: every word somewhere in the name. */
export function matchesSearch(search: string, name: string): boolean {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)

    return words.every((word) => name.toLowerCase().includes(word))
}
