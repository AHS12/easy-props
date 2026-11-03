import {CopyPlus, Plus, Trash2} from 'lucide-react'
import {useState} from 'react'
import {ColourPicker} from '../components/ColourPicker'
import {parseColourCode} from '../core/colour-code'
import type {SavedPalette} from '../core/settings/settings-spec'
import {useSettingsStore} from '../store/settings-store'
import {freeName, PALETTE_SETS} from './palette-choice'

function PaletteRow({
    palette,
    labels,
    fresh,
    onDuplicate,
}: {
    palette: SavedPalette
    labels: readonly string[]
    /** Just made, so its name is ready to type over. */
    fresh: boolean
    onDuplicate(): void
}) {
    const renamePalette = useSettingsStore((state) => state.renamePalette)
    const setPaletteColours = useSettingsStore((state) => state.setPaletteColours)
    const removePalette = useSettingsStore((state) => state.removePalette)
    const [name, setName] = useState(palette.name)
    const [removing, setRemoving] = useState(false)

    const rename = () => {
        if (name.trim() === '') {
            setName(palette.name)
        } else if (name.trim() !== palette.name) {
            renamePalette(palette.id, name)
        }
    }

    return (
        <div className="palette-row" data-palette={palette.id}>
            <input
                className="seed-panel__field palette-row__name"
                aria-label={`Name of ${palette.name}`}
                autoFocus={fresh}
                onFocus={fresh ? (event) => event.currentTarget.select() : undefined}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={rename}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.currentTarget.blur()
                    } else if (event.key === 'Escape' && name !== palette.name) {
                        event.stopPropagation()
                        setName(palette.name)
                    }
                }}
            />
            <div className="palette-row__colours" role="group" aria-label={`Colours of ${palette.name}`}>
                {palette.colours.map((colour, index) => {
                    const change = (next: string) =>
                        setPaletteColours(palette.id, palette.colours.map((old, at) => (at === index ? next : old)))

                    return (
                        <span
                            key={index}
                            onPaste={(event) => {
                                // The picker's own fields are elsewhere on the page, and paste for themselves.
                                if (!event.currentTarget.contains(event.target as Node)) {
                                    return
                                }

                                const pasted = parseColourCode(event.clipboardData.getData('text'))

                                if (pasted) {
                                    event.preventDefault()
                                    change(pasted)
                                }
                            }}
                        >
                            <ColourPicker label={`${palette.name}, ${labels[index] ?? `colour ${index + 1}`}`} value={colour} onChange={change} />
                        </span>
                    )
                })}
            </div>
            {removing ? (
                <span className="palette-row__confirm">
                    <button type="button" className="text-button" onClick={() => removePalette(palette.id)}>
                        Remove
                    </button>
                    <button type="button" className="text-button" onClick={() => setRemoving(false)}>
                        Keep
                    </button>
                </span>
            ) : (
                <span className="palette-row__actions">
                    <button
                        type="button"
                        className="icon-button"
                        aria-label={`Duplicate ${palette.name}`}
                        title="Duplicate"
                        onClick={onDuplicate}
                    >
                        <CopyPlus size={13} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove ${palette.name}`}
                        title="Remove"
                        onClick={() => setRemoving(true)}
                    >
                        <Trash2 size={13} aria-hidden="true" />
                    </button>
                </span>
            )}
        </div>
    )
}

/**
 * Every palette saved by name, by kind of prop. Changing one here changes what
 * using it gives from now on. Props that already use it keep their colours.
 */
export function PalettesPage() {
    const palettes = useSettingsStore((state) => state.palettes)
    const savePalette = useSettingsStore((state) => state.savePalette)
    const [fresh, setFresh] = useState<string | null>(null)

    const add = (set: string, base: string, colours: readonly string[]) => {
        const taken = palettes.filter((palette) => palette.set === set).map((palette) => palette.name)

        setFresh(savePalette(freeName(base, taken), set, colours).id)
    }

    return (
        <>
            <p className="settings__intro">
                A palette is a set of colours with a name, such as one for each game. Use it from the Palette menu of any
                prop of that kind. Click a colour to change it, or paste a colour code onto it. Props that already use a
                palette keep their colours until it's picked again.
            </p>
            {PALETTE_SETS.map(({set, title, labels, start}) => {
                const ofSet = palettes.filter((palette) => palette.set === set)

                return (
                    <section key={set} className="palette-group" aria-label={title}>
                        <div className="palette-group__head">
                            <h3 className="palette-group__title">{title}</h3>
                            <button type="button" className="text-button" onClick={() => add(set, 'New palette', start)}>
                                <Plus size={12} aria-hidden="true" />
                                New palette
                            </button>
                        </div>
                        {ofSet.length === 0 ? <p className="setting__help">None yet.</p> : null}
                        {ofSet.map((palette) => (
                            <PaletteRow
                                key={palette.id}
                                palette={palette}
                                labels={labels}
                                fresh={palette.id === fresh}
                                onDuplicate={() => add(set, `${palette.name} copy`, palette.colours)}
                            />
                        ))}
                    </section>
                )
            })}
        </>
    )
}
