/**
 * Parameter metadata and validation.
 *
 * Every editable value declares its range and its control in one place, so
 * the inspector renders the right control and the generator validates
 * against the same numbers. The spec drives both, which is what keeps the
 * slider and the clamp from drifting apart.
 */

import {z} from 'zod'

export type ParameterValue = number | string

export type ParameterSet = Readonly<Record<string, ParameterValue>>

export interface NumberParameter {
    readonly kind: 'number'
    readonly key: string
    readonly label: string
    readonly help?: string
    /** The heading it sits under in the inspector. */
    readonly group?: string
    readonly min: number
    readonly max: number
    readonly step: number
    readonly unit?: string
    readonly default: number
}

export interface ChoiceParameter<T extends string = string> {
    readonly kind: 'choice'
    readonly key: string
    readonly label: string
    readonly help?: string
    /** The heading it sits under in the inspector. */
    readonly group?: string
    readonly options: readonly {value: T; label: string}[]
    readonly default: T
}

export type ParameterSpec = NumberParameter | ChoiceParameter

export interface ValidationIssue {
    readonly key: string
    readonly message: string
}

export interface ValidationResult<P> {
    readonly valid: boolean
    readonly parameters: P
    readonly issues: readonly ValidationIssue[]
}

/**
 * A number that is clamped into range rather than rejected.
 *
 * `NaN`, `Infinity`, and a missing value fall back to the default. Anything
 * else is pulled into the legal range, and the caller reports the change.
 */
export function numberSchema(spec: NumberParameter): z.ZodType<number> {
    return z
        .number({error: `${spec.label} must be a number`})
        .catch(spec.default)
        .transform((value) => Math.min(spec.max, Math.max(spec.min, value)))
}

/**
 * A choice that falls back to the default when the value is unknown.
 *
 * The generic keeps the literal options, so a generator's parameter type
 * stays a union rather than a plain string.
 */
export function choiceSchema<T extends string>(spec: ChoiceParameter<T>): z.ZodType<T> {
    const allowed = new Set<string>(spec.options.map((option) => option.value))

    return z
        .string({error: `${spec.label} must be one of the offered choices`})
        .catch(spec.default)
        .transform((value) => (allowed.has(value) ? (value as T) : spec.default))
}

/**
 * Validates a parameter object against a schema.
 *
 * Never throws. Out-of-range values are clamped and reported, so the UI can
 * say what changed rather than refusing the edit.
 */
export function validateParameters<P extends object>(
    schema: z.ZodType<NoInfer<P>, unknown>,
    parameters: unknown,
    defaults: P,
): ValidationResult<P> {
    const result = schema.safeParse(parameters)

    if (!result.success) {
        return {
            valid: false,
            parameters: defaults,
            issues: result.error.issues.map((issue) => ({
                key: issue.path.join('.') || 'parameters',
                message: issue.message,
            })),
        }
    }

    const raw = (parameters ?? {}) as Record<string, unknown>
    const issues: ValidationIssue[] = []

    for (const [key, value] of Object.entries(result.data)) {
        if (raw[key] === undefined) {
            // A missing value simply takes the default.
            continue
        }

        if (raw[key] === value) {
            continue
        }

        issues.push({
            key,
            message:
                typeof value === 'number'
                    ? `${key} was adjusted to ${value}`
                    : `${key} was reset to ${String(value)}`,
        })
    }

    return {valid: issues.length === 0, parameters: result.data, issues}
}

/** Builds the default parameter set from a list of specs. */
export function defaultParameters(specs: readonly ParameterSpec[]): ParameterSet {
    const result: Record<string, ParameterValue> = {}

    for (const spec of specs) {
        result[spec.key] = spec.default
    }

    return result
}

/** Looks up a spec by key. */
export function findParameterSpec(
    specs: readonly ParameterSpec[],
    key: string,
): ParameterSpec | undefined {
    return specs.find((spec) => spec.key === key)
}
