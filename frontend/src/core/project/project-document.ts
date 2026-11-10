/**
 * The project file.
 *
 * A versioned JSON document holding the scene and the style it was made in.
 * Loading validates the whole document before anything touches the session,
 * so a bad file is a message, not a half-loaded tree.
 *
 * Parameters are the one thing not validated here. Their shape depends on the
 * part's generator, and each generator validates its own parameters when it
 * builds. This layer checks the envelope, which is what has to be right for a
 * file to be readable at all.
 */

import {z} from 'zod'
import {COMPONENT_TYPES} from '../../assets/shared/component-types'
import type {Scene} from '../scene/scene-model'

export const CURRENT_SCHEMA_VERSION = 2
export const PROJECT_GENERATOR = 'easy-props'

/** What loading a project gives back. */
export interface LoadedProject {
    readonly scene: Scene
    /** What the user calls this tree. */
    readonly name: string
    /** Which style profile the tree was made in. */
    readonly style: string
    /** The preset it was started from, when the file says. Files before 0.3.5 don't. */
    readonly presetId: string | null
    /**
     * Keys this build does not know about.
     *
     * Kept and written back on save, so opening a file in an older build does
     * not quietly delete what a newer one added.
     */
    readonly extras: Readonly<Record<string, unknown>>
}

export class ProjectFileError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ProjectFileError'
    }
}

const vec3 = z.tuple([z.number(), z.number(), z.number()])

const transformSchema = z.object({
    position: vec3,
    rotation: vec3,
    scale: vec3,
})

const componentSchema = z.object({
    id: z.string().min(1),
    type: z.enum(COMPONENT_TYPES),
    generatorId: z.string().min(1),
    generatorVersion: z.number().int(),
    parentId: z.string().nullable(),
    transform: transformSchema,
    parameters: z.record(z.string(), z.unknown()),
    styleOverrides: z.record(z.string(), z.unknown()).nullable().optional(),
    seed: z.number().int(),
    slot: z.string().nullable(),
    edited: z.boolean(),
    moved: vec3.optional(),
})

const assetSchema = z.object({
    id: z.string().min(1),
    kind: z.literal('tree'),
    generatorId: z.string().min(1),
    generatorVersion: z.number().int(),
    seed: z.number().int(),
    components: z.array(componentSchema),
    parameters: z.record(z.string(), z.unknown()),
    materials: z.object({
        bark: z.string().min(1),
        leaves: z.string().min(1),
    }),
})

const sceneSchema = z.object({
    id: z.string().min(1),
    assets: z.array(assetSchema),
})

const documentSchema = z.looseObject({
    schemaVersion: z.number().int(),
    generator: z.literal(PROJECT_GENERATOR),
    createdAt: z.string().min(1),
    modifiedAt: z.string().min(1),
    // Optional because the first gallery-less build wrote files without it.
    name: z.string().min(1).optional(),
    style: z.string().min(1),
    preset: z.string().min(1).optional().catch(undefined),
    scene: sceneSchema,
})

const KNOWN_KEYS = new Set([
    'schemaVersion',
    'generator',
    'createdAt',
    'modifiedAt',
    'name',
    'style',
    'preset',
    'scene',
])

const DEFAULT_NAME = 'My tree'

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Version 1 did not record which generator slot a part came from, or whether
 * the user had changed it. Both were implied by the code of the day; the
 * current build needs them written down.
 */
function migrate1to2(document: unknown): unknown {
    if (!isObject(document) || !isObject(document.scene)) {
        return document
    }

    const scene = document.scene

    if (!Array.isArray(scene.assets)) {
        return document
    }

    return {
        ...document,
        schemaVersion: 2,
        scene: {
            ...scene,
            assets: scene.assets.map((asset) => {
                if (!isObject(asset) || !Array.isArray(asset.components)) {
                    return asset
                }

                return {
                    ...asset,
                    components: asset.components.map((component) =>
                        isObject(component)
                            ? {slot: null, edited: false, ...component}
                            : component,
                    ),
                }
            }),
        },
    }
}

/** One entry per version bump, each turning version `n` into `n + 1`. */
const MIGRATIONS: Readonly<Record<number, (document: unknown) => unknown>> = {
    1: migrate1to2,
}

function readVersion(document: unknown): number {
    if (!isObject(document)) {
        throw new ProjectFileError('This file is not an easy-props project.')
    }

    const version = document.schemaVersion

    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
        throw new ProjectFileError(
            'This file is not an easy-props project: it has no schema version.',
        )
    }

    return version
}

/** Runs the chain of migrations from the file's version to this one. */
function migrate(document: unknown, version: number): unknown {
    let current = document

    for (let from = version; from < CURRENT_SCHEMA_VERSION; from++) {
        const step = MIGRATIONS[from]

        if (!step) {
            throw new ProjectFileError(
                `This project is version ${from}, and this build cannot read that version.`,
            )
        }

        current = step(current)
    }

    return current
}

/** The first problem in a document, in words a person can act on. */
function describeIssue(issue: z.core.$ZodIssue): string {
    const path = issue.path.map(String).join('.')

    return path ? `${path}: ${issue.message}` : issue.message
}

/**
 * Reads a project file.
 *
 * Throws `ProjectFileError` with a message meant for the user. Nothing outside
 * this function changes, so a failed load leaves the session as it was.
 */
export function parseProject(text: string): LoadedProject {
    let document: unknown

    try {
        document = JSON.parse(text)
    } catch {
        throw new ProjectFileError('This file is not valid JSON, so it cannot be a project.')
    }

    const version = readVersion(document)

    if (version > CURRENT_SCHEMA_VERSION) {
        throw new ProjectFileError(
            `This project was made by a newer version of easy-props (version ${version}). ` +
                `This build reads up to version ${CURRENT_SCHEMA_VERSION}.`,
        )
    }

    const migrated = migrate(document, version)
    const result = documentSchema.safeParse(migrated)

    if (!result.success) {
        throw new ProjectFileError(
            `This file is not a valid easy-props project. ${describeIssue(result.error.issues[0])}`,
        )
    }

    const parsed = result.data
    const extras: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(parsed)) {
        if (!KNOWN_KEYS.has(key)) {
            extras[key] = value
        }
    }

    // Carried with the extras so saving it again keeps when it was first made.
    extras.createdAt = parsed.createdAt

    return {
        // The envelope is checked above; parameters belong to the generators,
        // which validate them when they build.
        scene: withEarlierLooks(parsed.scene as unknown as Scene),
        name: parsed.name ?? DEFAULT_NAME,
        style: parsed.style,
        presetId: parsed.preset ?? null,
        extras,
    }
}

/**
 * Settings that start on for new props, but a file saved before they existed must open
 * without, so it looks as it did. The key missing is what marks such a file, so the
 * file version stays as it is and older builds still open what this one saves.
 */
const EARLIER_LOOKS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
    // Rocks gained Grain after 0.4.2.
    'cut-rock': {grain: 0},
}

function filledIn(values: unknown, earlier: Readonly<Record<string, number>>): unknown {
    if (!isObject(values)) {
        return values
    }

    const missing = Object.entries(earlier).filter(([key]) => !(key in values))

    return missing.length === 0 ? values : {...values, ...Object.fromEntries(missing)}
}

function withEarlierLooks(scene: Scene): Scene {
    return {
        ...scene,
        assets: scene.assets.map((asset) => {
            const earlier = EARLIER_LOOKS[asset.generatorId]

            if (!earlier) {
                return asset
            }

            return {
                ...asset,
                parameters: filledIn(asset.parameters, earlier) as typeof asset.parameters,
                // A rock's body carries the rock's settings too.
                components: asset.components.map((component) =>
                    isObject(component.parameters) && isObject(component.parameters.rock)
                        ? {...component, parameters: {...component.parameters, rock: filledIn(component.parameters.rock, earlier)}}
                        : component,
                ),
            }
        }),
    }
}

/**
 * A starting point is a saved prop that new props are made from. It is marked
 * with one key that older versions keep as an unknown one, so there it simply
 * shows as a saved prop.
 */
export const STARTING_POINT_KEY = 'startingPoint'

export const isStartingPoint = (extras: Readonly<Record<string, unknown>>): boolean => extras[STARTING_POINT_KEY] === true

/** The extras with the mark set or taken off. */
export function markedStartingPoint(extras: Readonly<Record<string, unknown>>, on: boolean): Record<string, unknown> {
    const next: Record<string, unknown> = {...extras}

    if (on) {
        next[STARTING_POINT_KEY] = true
    } else {
        delete next[STARTING_POINT_KEY]
    }

    return next
}

export interface SaveInput {
    readonly scene: Scene
    /** What the user calls this tree. */
    readonly name?: string
    /** The style profile the tree is made in. */
    readonly style: string
    /** The preset it was started from, which Restore goes back to. */
    readonly presetId?: string
    readonly extras?: Readonly<Record<string, unknown>>
    /** Overridable so tests do not depend on the clock. */
    readonly now?: Date
}

/** The project file's text, ready to write. */
export function serializeProject(input: SaveInput): string {
    const now = (input.now ?? new Date()).toISOString()
    const extras = input.extras ?? {}
    const created = typeof extras.createdAt === 'string' ? extras.createdAt : now

    const document = {
        // Unknown keys first, so anything this build knows wins.
        ...extras,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        generator: PROJECT_GENERATOR,
        createdAt: created,
        modifiedAt: now,
        name: input.name ?? DEFAULT_NAME,
        style: input.style,
        ...(input.presetId ? {preset: input.presetId} : {}),
        scene: input.scene,
    }

    return `${JSON.stringify(document, null, 2)}\n`
}
