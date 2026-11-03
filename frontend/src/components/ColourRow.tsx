import {Tooltip} from './controls'
import {ColourPicker} from './ColourPicker'
import type {ColourChoice} from '../assets/style/materials'
import {parseColourCode} from '../core/colour-code'

/**
 * A colour on one line.
 *
 * Named swatches first, because a beginner knows the tree is brown and not what hex
 * brown is. The last swatch opens a picker for anything else, and pasting a colour
 * code anywhere on the row uses it.
 */
export function ColourRow({
    label,
    value,
    presets,
    controlKey,
    onChange,
}: {
    label: string
    /** For the command palette to find the row by. */
    controlKey?: string
    value: string
    presets: readonly ColourChoice[]
    onChange(value: string): void
}) {
    return (
        <div className="prop prop--colour" data-control={controlKey}>
            <span className="prop__label">{label}</span>
            <div
                className="colours"
                role="group"
                aria-label={label}
                onPaste={(event) => {
                    // The picker's own fields sit in a layer elsewhere on the page, and paste for themselves.
                    if (!event.currentTarget.contains(event.target as Node)) {
                        return
                    }

                    const colour = parseColourCode(event.clipboardData.getData('text'))

                    if (colour) {
                        event.preventDefault()
                        onChange(colour)
                    }
                }}
            >
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
                <ColourPicker label={label} value={value} onChange={onChange} />
            </div>
        </div>
    )
}
