import {Tooltip} from './controls'
import type {ColourChoice} from '../assets/style/materials'

/**
 * A colour on one line.
 *
 * Named swatches first, because a beginner knows the tree is brown and not what hex
 * brown is. The last swatch opens the system's picker for anything else.
 */
export function ColourRow({
    label,
    value,
    presets,
    onChange,
}: {
    label: string
    value: string
    presets: readonly ColourChoice[]
    onChange(value: string): void
}) {
    return (
        <div className="prop prop--colour">
            <span className="prop__label">{label}</span>
            <div className="colours" role="group" aria-label={label}>
                {presets.slice(0, 7).map((preset) => (
                    <Tooltip key={preset.value} text={preset.name} always>
                        <button
                            type="button"
                            className="colour"
                            style={{backgroundColor: preset.value}}
                            aria-label={preset.name}
                            aria-pressed={preset.value.toLowerCase() === value.toLowerCase()}
                            onClick={() => onChange(preset.value)}
                        />
                    </Tooltip>
                ))}
                <label className="colour colour--custom" title="Pick any colour" style={{backgroundColor: value}}>
                    <input
                        type="color"
                        value={value}
                        aria-label={`${label}: pick any colour`}
                        onChange={(event) => onChange(event.target.value)}
                    />
                </label>
            </div>
        </div>
    )
}
