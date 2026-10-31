/**
 * One control on one line.
 *
 *     Height      ───────○──── [ 8.00 m ] ⟲
 *
 * Drag it live, click the number and type, or reset just this one. Holding Shift
 * while dragging slows it down. Typing past the range is held to it, and says so.
 */

import {Slider} from '@heroui/react'
import {RotateCcw} from 'lucide-react'
import {useEffect, useRef, useState, type ReactNode} from 'react'
import {Tooltip} from './controls'

/** How much a Shift drag slows the value down. */
const FINE_DRAG = 0.2
const NOTE_MS = 2600

function decimalsFor(step: number): number {
    return step >= 1 ? 0 : step >= 0.1 ? 1 : 2
}

/** A row's label, its help on hover, and whatever control goes beside it. */
export function Row({
    label,
    help,
    controlKey,
    children,
}: {
    label: string
    help?: string
    controlKey?: string
    children: ReactNode
}) {
    return (
        <div className="prop" data-control={controlKey}>
            <Tooltip text={help} placement="left">
                <span className="prop__label" tabIndex={help ? 0 : undefined}>
                    {label}
                </span>
            </Tooltip>
            <div className="prop__control">{children}</div>
        </div>
    )
}

export function ResetButton({label, visible, onReset}: {label: string; visible: boolean; onReset(): void}) {
    return (
        <span className="prop__reset-slot">
            {visible ? (
                <button type="button" className="prop__reset" aria-label={`Reset ${label}`} title="Reset" onClick={onReset}>
                    <RotateCcw size={12} aria-hidden="true" />
                </button>
            ) : null}
        </span>
    )
}

export function PropertyRow({
    label,
    help,
    controlKey,
    value,
    min,
    max,
    step,
    unit,
    resetTo,
    onChange,
}: {
    label: string
    help?: string
    controlKey?: string
    value: number
    min: number
    max: number
    step: number
    unit?: string
    /** The value Reset returns to. Without one the row has no reset. */
    resetTo?: number
    onChange(value: number): void
}) {
    const decimals = decimalsFor(step)
    const shown = value.toFixed(decimals)
    const [draft, setDraft] = useState<string | null>(null)
    const [note, setNote] = useState<string | null>(null)
    const fine = useRef<{raw: number; value: number} | null>(null)

    useEffect(() => {
        if (!note) {
            return
        }

        const timer = window.setTimeout(() => setNote(null), NOTE_MS)

        return () => window.clearTimeout(timer)
    }, [note])

    const commitDraft = () => {
        if (draft === null) {
            return
        }

        setDraft(null)

        // Forgives a unit or a comma, but text with no digits in it is not a number.
        const digits = draft.replace(',', '.').replace(/[^\d.+-]/g, '')
        const typed = Number(digits)

        if (!/\d/.test(digits) || !Number.isFinite(typed)) {
            return
        }

        const clamped = Math.min(max, Math.max(min, typed))

        if (clamped !== typed) {
            setNote(`Kept to ${min.toFixed(decimals)}–${max.toFixed(decimals)}${unit ? ` ${unit}` : ''}`)
        }

        if (clamped !== value) {
            onChange(clamped)
        }
    }

    const nudge = (direction: number, large: boolean) => {
        const next = Math.min(max, Math.max(min, value + direction * step * (large ? 10 : 1)))

        if (next !== value) {
            onChange(Number(next.toFixed(6)))
        }
    }

    // A slider reports where the pointer is, so slowing it down means measuring
    // from where Shift was pressed.
    const dragTo = (raw: number) => {
        let next = raw

        if (shiftHeld) {
            fine.current ??= {raw, value}
            next = fine.current.value + (raw - fine.current.raw) * FINE_DRAG
            next = Math.min(max, Math.max(min, Math.round(next / step) * step))
        } else {
            fine.current = null
        }

        if (next !== value) {
            onChange(Number(next.toFixed(6)))
        }
    }

    return (
        <div className="prop" data-control={controlKey}>
            <Tooltip text={help} placement="left">
                <span className="prop__label" tabIndex={help ? 0 : undefined}>
                    {label}
                </span>
            </Tooltip>
            <Slider
                className="prop__slider"
                aria-label={label}
                value={value}
                minValue={min}
                maxValue={max}
                step={step}
                onChange={(next) => dragTo(next as number)}
                onChangeEnd={() => {
                    fine.current = null
                }}
            >
                <Slider.Track>
                    <Slider.Fill />
                    <Slider.Thumb />
                </Slider.Track>
            </Slider>
            <span className="prop__number">
                <input
                    className="prop__input tabular"
                    aria-label={`${label} value`}
                    value={draft ?? shown}
                    inputMode="decimal"
                    spellCheck={false}
                    onFocus={(event) => {
                        setDraft(shown)
                        event.currentTarget.select()
                    }}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commitDraft}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.currentTarget.blur()
                        } else if (event.key === 'Escape') {
                            event.stopPropagation()
                            setDraft(null)
                            // The blur must not commit the abandoned text.
                            requestAnimationFrame(() => (event.target as HTMLInputElement).blur())
                        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                            event.preventDefault()
                            nudge(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey)
                            setDraft(null)
                        }
                    }}
                />
                {unit && unit !== 'count' ? <span className="prop__unit">{unit}</span> : null}
            </span>
            <ResetButton
                label={label}
                visible={resetTo !== undefined && Math.abs(resetTo - value) > step / 2}
                onReset={() => {
                    if (resetTo !== undefined) {
                        onChange(resetTo)
                    }
                }}
            />
            {note ? (
                <p className="prop__note" role="status">
                    {note}
                </p>
            ) : null}
        </div>
    )
}

let shiftHeld = false

if (typeof window !== 'undefined') {
    const track = (event: KeyboardEvent | PointerEvent) => {
        shiftHeld = event.shiftKey
    }

    window.addEventListener('keydown', track, true)
    window.addEventListener('keyup', track, true)
    window.addEventListener('pointerdown', track, true)
    window.addEventListener('pointermove', track, true)
}
