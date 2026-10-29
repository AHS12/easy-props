interface SliderProps {
    label: string
    value: number
    min: number
    max: number
    step?: number
    /** Unit shown after the value, for example "m". */
    unit?: string
    /** Labels for the ends of the range. */
    minLabel?: string
    maxLabel?: string
    onChange: (value: number) => void
}

/**
 * A slider for a genuinely continuous value.
 *
 * The value updates live while dragging. There is no apply step, because an
 * extra click is a small thing to ask a beginner to do.
 */
export function Slider({
    label,
    value,
    min,
    max,
    step = 0.01,
    unit,
    minLabel,
    maxLabel,
    onChange,
}: SliderProps) {
    const formatted = `${value.toFixed(step < 1 ? 2 : 0)}${unit ? ` ${unit}` : ''}`

    return (
        <div className="field">
            <div className="field__label">
                <span>{label}</span>
                <span className="field__value tabular">{formatted}</span>
            </div>
            <input
                className="range"
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                aria-label={label}
                aria-valuetext={formatted}
                onChange={(event) => onChange(Number(event.target.value))}
            />
            {(minLabel || maxLabel) && (
                <div className="range__ends">
                    <span>{minLabel}</span>
                    <span>{maxLabel}</span>
                </div>
            )}
        </div>
    )
}
