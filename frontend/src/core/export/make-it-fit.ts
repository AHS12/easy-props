/**
 * Make it fit: lowers the controls that cost the most until a prop is under its
 * face budget.
 *
 * Each try builds the prop at full detail and counts it, without drawing it. A
 * part keeps its count while its signature holds, so trying another leaf
 * density does not build the bark again. Each control aims straight for the
 * value that should fit, from how the count moved, and then corrects, which
 * takes a few builds where halving would take many.
 */

import {findComponentGenerator} from '../../assets/component-generators'
import {findPropGenerator, shownControls} from '../../assets/prop-generators'
import {createSeededRandom} from '../../assets/shared/random'
import {roleOfPart, type FitControl, type GeneratedPart} from '../../assets/shared/generator-types'
import type {NumberParameter} from '../../assets/shared/parameters'
import type {SceneComponent} from '../../assets/shared/component-types'
import type {StyleProfile} from '../../assets/style/style-profiles'
import type {Scene} from '../scene/scene-model'
import {updateTreeParameters} from '../scene/scene-ops'
import type {FaceCounts} from './pipeline/budget'
import {yieldIfBusy} from './pipeline/yield'

/** Builds per control, past the first, before taking the best that fitted. */
const TRIES_PER_CONTROL = 4

export interface FitChange {
    readonly key: string
    readonly label: string
    readonly from: number
    readonly to: number
}

export interface FitResult {
    readonly scene: Scene
    readonly changes: readonly FitChange[]
    readonly faces: number
    readonly fits: boolean
    /** True when it ran out of time before trying every control. */
    readonly stopped: boolean
}

/** Remembers each part's faces by what shapes it, for the length of one fit. */
export type FaceCache = Map<string, {readonly faces: number; readonly leaves: boolean}>

function partKey(component: SceneComponent, style: StyleProfile): string {
    const generator = findComponentGenerator(component.generatorId)!
    const parameters = generator.validate(component.parameters).parameters

    return JSON.stringify([
        style.id,
        component.generatorId,
        component.generatorVersion,
        generator.signature ? generator.signature(parameters) : [component.parameters, component.seed],
    ])
}

async function buildFull(component: SceneComponent, style: StyleProfile): Promise<GeneratedPart | null> {
    const generator = findComponentGenerator(component.generatorId)

    if (!generator) {
        return null
    }

    const parameters = generator.validate(component.parameters).parameters as object
    const offThread = generator.dress ? generator.buildOffThread?.(parameters, style, 1) : null

    if (offThread) {
        return generator.dress!(await offThread, parameters)
    }

    return generator.generate(parameters, {random: createSeededRandom(component.seed), seed: component.seed, style, detail: 1})
}

/** The faces a prop has at full detail, as the status bar counts them. */
export async function countFaces(scene: Scene, style: StyleProfile, cache: FaceCache = new Map()): Promise<FaceCounts> {
    const counts = {wood: 0, leaves: 0}

    for (const component of scene.assets[0]?.components ?? []) {
        if (!findComponentGenerator(component.generatorId)) {
            continue
        }

        const key = partKey(component, style)
        let known = cache.get(key)

        if (!known) {
            const part = await buildFull(component, style)

            if (!part) {
                continue
            }

            const geometry = part.geometry
            // A proxy is only there to be clicked, and is never drawn.
            const faces = part.surface?.proxy ? 0 : (geometry.index?.count ?? geometry.getAttribute('position').count) / 3

            known = {faces, leaves: roleOfPart(part) === 'foliage'}
            cache.set(key, known)
            geometry.dispose()
            await yieldIfBusy()
        }

        if (known.leaves) {
            counts.leaves += known.faces
        } else {
            counts.wood += known.faces
        }
    }

    return counts
}

const total = ({wood, leaves}: FaceCounts) => wood + leaves

/** On the control's own steps, so the slider shows a value it could have been set to. */
function onStep(value: number, spec: NumberParameter): number {
    const stepped = spec.min + Math.round((value - spec.min) / spec.step) * spec.step

    return Number(Math.min(spec.max, Math.max(spec.min, stepped)).toFixed(6))
}

/** The controls a prop's generator offers for fitting, with their specs. */
export function fitControlsOf(scene: Scene): readonly {control: FitControl; spec: NumberParameter}[] {
    const asset = scene.assets[0]
    const generator = findPropGenerator(asset?.generatorId ?? '')
    // A hidden control does nothing for these values, as Leaf size on a low-poly bush.
    const shown = generator ? shownControls(asset?.generatorId, generator.parameters, asset?.parameters ?? {}) : []

    return (generator?.fitControls ?? []).flatMap((control) => {
        const spec = shown?.find((candidate) => candidate.key === control.key)

        return spec?.kind === 'number' ? [{control, spec}] : []
    })
}

export async function makeItFit(
    scene: Scene,
    style: StyleProfile,
    budget: number,
    {deadline = Infinity, now = () => performance.now()}: {deadline?: number; now?: () => number} = {},
): Promise<FitResult> {
    const asset = scene.assets[0]
    const cache: FaceCache = new Map()
    const changes: FitChange[] = []
    let current = scene
    let faces = total(await countFaces(scene, style, cache))
    let stopped = false

    const tryValue = async (key: string, value: number) => {
        const next = updateTreeParameters(current, asset.id, {[key]: value}, style)

        return {scene: next, faces: total(await countFaces(next, style, cache))}
    }

    for (const {control, spec} of fitControlsOf(scene)) {
        if (faces <= budget) {
            break
        }

        if (now() > deadline) {
            stopped = true
            break
        }

        const from = Number(current.assets[0].parameters[control.key] ?? spec.default)
        const limit = onStep(control.limit, spec)

        // Already as cheap as it may go.
        if ((limit - from) * Math.sign(control.limit - from) <= 0 || Math.abs(limit - from) < spec.step / 2) {
            continue
        }

        const atLimit = await tryValue(control.key, limit)

        if (atLimit.faces > budget || atLimit.faces >= faces) {
            // Not enough alone: take all it gives, and go on to the next control.
            if (atLimit.faces < faces) {
                current = atLimit.scene
                faces = atLimit.faces
                changes.push({key: control.key, label: spec.label, from, to: limit})
            }

            continue
        }

        // Between `over` (too many faces) and `under` (fits), aim where the count should cross the budget.
        let over = {value: from, faces}
        let under = {value: limit, faces: atLimit.faces, scene: atLimit.scene}

        for (let attempt = 0; attempt < TRIES_PER_CONTROL && now() <= deadline; attempt++) {
            const share = (over.faces - budget) / Math.max(over.faces - under.faces, 1)
            const guess = onStep(over.value + (under.value - over.value) * share, spec)

            if (guess === over.value || guess === under.value) {
                break
            }

            const tried = await tryValue(control.key, guess)

            if (tried.faces <= budget) {
                under = {value: guess, faces: tried.faces, scene: tried.scene}
            } else {
                over = {value: guess, faces: tried.faces}
            }
        }

        current = under.scene
        faces = under.faces
        changes.push({key: control.key, label: spec.label, from, to: under.value})
    }

    return {scene: current, changes, faces, fits: faces <= budget, stopped}
}

/** "Leaf density 0.75 → 0.5, Clumps 14 → 9" */
export function describeChanges(changes: readonly FitChange[]): string {
    return changes.map(({label, from, to}) => `${label} ${formatValue(from)} → ${formatValue(to)}`).join(', ')
}

const formatValue = (value: number) => String(Number(value.toFixed(2)))
