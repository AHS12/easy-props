import type {ColourChoice} from '../assets/style/materials'

interface ColourPickerProps {
    label: string
    value: string
    presets: readonly ColourChoice[]
    onChange: (value: string) => void
}

/**
 * A row of colour swatches.
 *
 * Named swatches first, because a beginner knows the tree is brown and not
 * what hex brown is. The last swatch opens the operating system's own
 * colour picker for anything the list does not cover.
 */
export function ColourPicker({label, value, presets, onChange}: ColourPickerProps) {
    return (
        <div className="field">
            <div className="field__label">
                <span>{label}</span>
            </div>
            <div className="colour-row" role="group" aria-label={label}>
                {presets.map((preset) => (
                    <button
                        key={preset.value}
                        type="button"
                        className="colour-chip"
                        style={{backgroundColor: preset.value}}
                        aria-label={preset.name}
                        aria-pressed={preset.value.toLowerCase() === value.toLowerCase()}
                        title={preset.name}
                        onClick={() => onChange(preset.value)}
                    />
                ))}

                <span className="colour-chip colour-chip--custom" title="Pick any colour">
                    <input
                        type="color"
                        value={value}
                        aria-label={`${label}: pick any colour`}
                        onChange={(event) => onChange(event.target.value)}
                    />
                </span>
            </div>
        </div>
    )
}
