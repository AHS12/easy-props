interface SelectProps<T extends string> {
    label: string
    value: T
    options: readonly {value: T; label: string}[]
    onChange: (value: T) => void
}

/**
 * A dropdown.
 *
 * Used when there are too many choices for a segmented control to read
 * comfortably.
 */
export function Select<T extends string>({label, value, options, onChange}: SelectProps<T>) {
    return (
        <select
            className="select"
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.target.value as T)}
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    )
}
