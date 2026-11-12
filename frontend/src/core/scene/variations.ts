/**
 * The versions Show me more offers: new seeds, or the same prop damaged.
 *
 * They come from the prop's seed and the page number, so the same prop always
 * shows the same grid, and each page shows new ones.
 */

import {findPropGenerator} from '../../assets/prop-generators'
import {createSeededRandom, hashSeed} from '../../assets/shared/random'
import type {NumberParameter} from '../../assets/shared/parameters'

/** How many others go around the prop as it is now. */
export const OTHERS_PER_PAGE = 8

/** The group a prop's damage settings sit under. */
const DAMAGE = 'Damage'
const SEED_DAMAGED = 7301
/** A setting that's on is at least this share of the way up, so it shows. */
const DAMAGE_LEAST = 0.3

/** One version of the prop: on another seed, or on its own seed with damage. */
export interface PropVersion {
    readonly seed: number
    /** The prop's damage settings for this version. Left out, the prop's own. */
    readonly damage?: Readonly<Record<string, number>>
}

/** A name for a version that's the same each time it's made. */
export const versionKey = (version: PropVersion): string =>
    version.damage
        ? `${version.seed}:${Object.entries(version.damage)
              .map(([key, value]) => `${key}=${value}`)
              .join(',')}`
        : String(version.seed)

export function pageSeeds(seed: number, page: number): readonly number[] {
    return Array.from({length: OTHERS_PER_PAGE}, (_, index) => hashSeed(seed, page + 1, index + 1))
}

/** The damage settings a prop shows for these values, or none for a prop that can't be damaged. */
export function damageSettings(generatorId: string, values: Readonly<Record<string, unknown>>): readonly NumberParameter[] {
    const generator = findPropGenerator(generatorId)
    const shown = generator?.shownControls?.(values) ?? generator?.parameters ?? []

    return shown.filter((spec): spec is NumberParameter => spec.kind === 'number' && spec.group === DAMAGE)
}

const onStep = (spec: NumberParameter, value: number) =>
    Math.min(spec.max, Math.max(spec.min + spec.step, Math.round((value - spec.min) / spec.step) * spec.step + spec.min))

/** The prop broken in different ways, on its own seed. */
export function pageDamages(seed: number, page: number, settings: readonly NumberParameter[]): readonly PropVersion[] {
    if (settings.length === 0) {
        return []
    }

    // Each version has one kind of damage, taken in turn, so no one kind fills the grid:
    // a snapped top hides any other on a tree whose limbs all leave high. A kind's turns
    // run from light to heavy.
    const leadOf = (index: number) => (index + page) % settings.length
    const turns = settings.map((_, at) => Array.from({length: OTHERS_PER_PAGE}, (__, index) => index).filter((index) => leadOf(index) === at).length)

    return Array.from({length: OTHERS_PER_PAGE}, (_, index) => {
        const random = createSeededRandom(hashSeed(seed, SEED_DAMAGED, page + 1, index + 1))
        const lead = leadOf(index)
        const turn = Math.floor(index / settings.length)
        const levels = settings.map(() => 0)

        levels[lead] = DAMAGE_LEAST + (1 - DAMAGE_LEAST) * ((turn + random()) / turns[lead])

        const damage = Object.fromEntries(
            settings.map((spec, at) => [spec.key, levels[at] > 0 ? onStep(spec, spec.min + (spec.max - spec.min) * levels[at]) : spec.min]),
        )

        return {seed, damage}
    })
}

/** What a damaged version has, in the words of its settings: "Snapped top, Split trunk". */
export function damageNames(version: PropVersion, settings: readonly NumberParameter[]): string {
    return settings
        .filter((spec) => (version.damage?.[spec.key] ?? 0) > spec.min)
        .map((spec) => spec.label)
        .join(', ')
}
