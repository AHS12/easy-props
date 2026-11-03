import {Popover} from '@heroui/react'
import {Check, ChevronDown, Pencil, Trash2} from 'lucide-react'
import {useEffect, useState} from 'react'
import {OWN_COLOURS} from '../assets/style/own-colours'
import type {SavedPalette} from '../core/settings/settings-spec'
import {matchesSearch, savedPaletteShowing, type PaletteChoice} from '../panels/palette-choice'
import {useSettingsStore} from '../store/settings-store'
import {useUiStore} from '../store/ui-store'

function Strip({colours}: {colours: readonly string[]}) {
    return (
        <span className="palette-strip" aria-hidden="true">
            {colours.map((colour, index) => (
                <span key={index} style={{backgroundColor: colour}} />
            ))}
        </span>
    )
}

/**
 * Picks a palette: a named one, one of your own saved by name, or My own colours.
 *
 * Saved palettes are what keep one game's props in the same colours, so they come
 * first, and the menu can save, rename and remove them where they're used.
 */
export function PaletteMenu({
    choice,
    ownAllowed,
    onPick,
    onUseColours,
}: {
    choice: PaletteChoice
    /** Whether My own colours is one of the choice's options. */
    ownAllowed: boolean
    onPick(value: string): void
    onUseColours(palette: SavedPalette): void
}) {
    const all = useSettingsStore((state) => state.palettes)
    const savePalette = useSettingsStore((state) => state.savePalette)
    const renamePalette = useSettingsStore((state) => state.renamePalette)
    const removePalette = useSettingsStore((state) => state.removePalette)
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [naming, setNaming] = useState<string | null>(null)
    const [renaming, setRenaming] = useState<{id: string; name: string} | null>(null)
    const [removing, setRemoving] = useState<string | null>(null)
    const [note, setNote] = useState<string | null>(null)

    const saved = all.filter((palette) => palette.set === choice.set)
    const showing = savedPaletteShowing(choice, saved)
    const named = choice.named.find((option) => option.value === choice.value)
    const title = showing?.name ?? named?.label ?? 'My own colours'

    useEffect(() => {
        if (open) {
            setSearch('')
            setNaming(null)
            setRenaming(null)
            setRemoving(null)
            setNote(null)
        }
    }, [open])

    const yours = saved.filter((palette) => matchesSearch(search, palette.name))
    const builtIn = choice.named.filter((option) => matchesSearch(search, option.label))
    const showOwn = ownAllowed && matchesSearch(search, 'My own colours')

    const use = (palette: SavedPalette) => {
        onUseColours(palette)
        setOpen(false)
    }

    const pick = (value: string) => {
        onPick(value)
        setOpen(false)
    }

    const save = () => {
        const name = naming?.trim() ?? ''

        if (name === '') {
            return
        }

        const existed = saved.some((palette) => palette.name.trim().toLowerCase() === name.toLowerCase())
        const palette = savePalette(name, choice.set, choice.current)

        setNaming(null)
        setNote(existed ? `Updated "${palette.name}"` : `Saved "${palette.name}"`)
        // Saving means using it, so the menu names it straight away.
        onUseColours(palette)
    }

    return (
        <Popover isOpen={open} onOpenChange={setOpen}>
            <Popover.Trigger>
                <button type="button" className="palette-menu__trigger" aria-label={`${choice.label}: ${title}`}>
                    <Strip colours={choice.current} />
                    <span className="palette-menu__title">{title}</span>
                    <ChevronDown size={13} aria-hidden="true" />
                </button>
            </Popover.Trigger>
            <Popover.Content className="sun-panel palette-menu" placement="bottom end" offset={4}>
                <Popover.Dialog aria-label={choice.label}>
                    <input
                        className="seed-panel__field"
                        placeholder="Search palettes"
                        aria-label="Search palettes"
                        autoFocus
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') {
                                return
                            }

                            event.preventDefault()

                            if (yours[0]) {
                                use(yours[0])
                            } else if (builtIn[0]) {
                                pick(builtIn[0].value)
                            }
                        }}
                    />

                    <div className="palette-menu__list" role="list">
                        {yours.length > 0 ? <span className="sun-panel__caption">Your palettes</span> : null}
                        {yours.map((palette) =>
                            renaming?.id === palette.id ? (
                                <input
                                    key={palette.id}
                                    className="seed-panel__field"
                                    aria-label={`New name for ${palette.name}`}
                                    autoFocus
                                    value={renaming.name}
                                    onChange={(event) => setRenaming({id: palette.id, name: event.target.value})}
                                    onBlur={() => setRenaming(null)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' && renaming.name.trim() !== '') {
                                            renamePalette(palette.id, renaming.name)
                                            setRenaming(null)
                                        } else if (event.key === 'Escape') {
                                            event.stopPropagation()
                                            setRenaming(null)
                                        }
                                    }}
                                />
                            ) : removing === palette.id ? (
                                <div key={palette.id} className="palette-menu__confirm" role="listitem">
                                    <span>Remove "{palette.name}"?</span>
                                    <button
                                        type="button"
                                        className="text-button"
                                        onClick={() => {
                                            removePalette(palette.id)
                                            setRemoving(null)
                                            setNote(`Removed "${palette.name}". Props using it keep their colours.`)
                                        }}
                                    >
                                        Remove
                                    </button>
                                    <button type="button" className="text-button" onClick={() => setRemoving(null)}>
                                        Keep
                                    </button>
                                </div>
                            ) : (
                                <div key={palette.id} className="palette-menu__row" role="listitem">
                                    <button type="button" className="palette-menu__item" onClick={() => use(palette)}>
                                        <Strip colours={palette.colours} />
                                        <span className="palette-menu__name">{palette.name}</span>
                                        {showing?.id === palette.id ? <Check size={13} aria-label="In use" /> : null}
                                    </button>
                                    <button
                                        type="button"
                                        className="icon-button"
                                        aria-label={`Rename ${palette.name}`}
                                        title="Rename"
                                        onClick={() => setRenaming({id: palette.id, name: palette.name})}
                                    >
                                        <Pencil size={12} aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        className="icon-button"
                                        aria-label={`Remove ${palette.name}`}
                                        title="Remove"
                                        onClick={() => setRemoving(palette.id)}
                                    >
                                        <Trash2 size={12} aria-hidden="true" />
                                    </button>
                                </div>
                            ),
                        )}

                        {builtIn.length > 0 ? <span className="sun-panel__caption">Built in</span> : null}
                        {builtIn.map((option) => (
                            <button key={option.value} type="button" className="palette-menu__item" role="listitem" onClick={() => pick(option.value)}>
                                <Strip colours={option.colours} />
                                <span className="palette-menu__name">{option.label}</span>
                                {choice.value === option.value ? <Check size={13} aria-label="In use" /> : null}
                            </button>
                        ))}

                        {showOwn ? (
                            <button type="button" className="palette-menu__item" role="listitem" onClick={() => pick(OWN_COLOURS)}>
                                <Strip colours={choice.value === OWN_COLOURS ? choice.current : []} />
                                <span className="palette-menu__name">My own colours</span>
                                {choice.value === OWN_COLOURS && !showing ? <Check size={13} aria-label="In use" /> : null}
                            </button>
                        ) : null}

                        {yours.length + builtIn.length === 0 && !showOwn ? (
                            <p className="sun-panel__caption">No palette is called that.</p>
                        ) : null}
                    </div>

                    {naming === null ? (
                        <div className="palette-menu__foot">
                            <button type="button" className="text-button" onClick={() => setNaming(showing?.name ?? '')}>
                                Save these colours as a palette…
                            </button>
                            {all.length > 0 ? (
                                <button
                                    type="button"
                                    className="text-button"
                                    onClick={() => {
                                        setOpen(false)
                                        useUiStore.getState().openSettings('Palettes')
                                    }}
                                >
                                    Manage…
                                </button>
                            ) : null}
                        </div>
                    ) : (
                        <div className="seed-panel__row">
                            <input
                                className="seed-panel__field"
                                aria-label="Palette name"
                                placeholder="Name, like Our forest game"
                                autoFocus
                                value={naming}
                                onChange={(event) => setNaming(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault()
                                        save()
                                    } else if (event.key === 'Escape') {
                                        event.stopPropagation()
                                        setNaming(null)
                                    }
                                }}
                            />
                            <button type="button" className="button" disabled={naming.trim() === ''} onClick={save}>
                                Save
                            </button>
                        </div>
                    )}
                    {note ? (
                        <p className="sun-panel__caption" role="status">
                            {note}
                        </p>
                    ) : null}
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    )
}
