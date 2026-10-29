interface SegmentedProps<T extends string> {
    /** Accessible name for the group. */
    label: string
    options: readonly {value: T; label: string; disabled?: boolean}[]
    value: T
    onChange: (value: T) => void
    /** Stretch the options to fill the available width. */
    wide?: boolean
}

/**
 * A segmented control.
 *
 * Used for categorical properties, where a named choice beats a bare
 * numeric range for someone who does not know 3D modeling.
 */
export function Segmented<T extends string>({
    label,
    options,
    value,
    onChange,
    wide,
}: SegmentedProps<T>) {
    return (
        <fieldset className={wide ? 'seg seg--wide' : 'seg'}>
            <legend className="visually-hidden">{label}</legend>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className="seg__option"
                    aria-pressed={option.value === value}
                    disabled={option.disabled}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </fieldset>
    )
}
