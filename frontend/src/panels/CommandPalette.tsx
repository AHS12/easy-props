/**
 * The command palette: one box that finds anything.
 *
 * Empty, it offers what is useful right now. Typing searches actions, controls,
 * presets, saved props and settings, in sections, and Enter acts on the top row.
 * Searching only reads lists, so it never builds anything and stays instant.
 */

import {Check, ChevronLeft, ChevronRight, Search, SlidersHorizontal, Settings2, Shapes, TreePine} from 'lucide-react'
import type {LucideIcon} from 'lucide-react'
import {useEffect, useMemo, useRef, useState} from 'react'
import {Dialog, Keys} from '../components/controls'
import {treeParameterSpecs} from '../assets/trees/branching-tree-generator'
import {findPropGenerator, shownControls} from '../assets/prop-generators'
import {familyOfPreset, findPreset, PROP_FAMILIES} from '../assets/trees/presets'
import {COMMANDS, findCommand, runCommand, shortcutFor, type Command} from '../core/commands/commands'
import {parsePrefix, rankEntries, type PaletteSection} from '../core/commands/palette-search'
import {EXPORT_SETTINGS} from '../core/settings/export-settings'
import {SETTING_SPECS} from '../core/settings/settings-spec'
import {useEditorStore, type EditorStore} from '../store/editor-store'
import {settingValue, useSettingsStore} from '../store/settings-store'
import {useUiStore} from '../store/ui-store'

type Section = PaletteSection | 'For this selection' | 'Recent' | 'Suggested' | 'Choose one'

interface Entry {
    readonly id: string
    readonly label: string
    readonly section: Section
    readonly keywords?: string
    readonly icon?: LucideIcon
    readonly keys?: string
    /** Why it cannot run now. It stays listed, with its reason. */
    readonly reason?: string | null
    readonly note?: string
    readonly checked?: boolean
    /** Set when choosing it opens a sub-list. */
    readonly children?: () => readonly Entry[]
    readonly run?: () => void
}

const SECTION_ORDER: readonly PaletteSection[] = ['Actions', 'Controls', 'Presets', 'Saved props', 'Settings']

const SUGGESTED = ['export-model', 'randomize', 'save-project']

/** Home has no prop open, so it suggests ways to get one. */
const HOME_SUGGESTED = ['new-tree', 'open-project', 'settings']

/** Commands the palette should not list twice, or that only make sense as keys. */
const HIDDEN = new Set(['palette', 'palette-alt', 'cancel'])

function commandEntry(command: Command, state: EditorStore, section: Section): Entry {
    return {
        id: command.id,
        label: command.label,
        section,
        keywords: `${command.group} ${command.keywords ?? ''}`,
        icon: command.icon,
        keys: shortcutFor(command.id),
        reason: command.unavailable?.(state) ?? null,
        checked: command.checked?.(state),
        children: command.children
            ? () => command.children!(state).map((child) => commandEntry(child, state, 'Choose one'))
            : undefined,
        run: command.children ? undefined : () => runCommand(command),
    }
}

function controlEntries(state: EditorStore): readonly Entry[] {
    const asset = state.scene.assets[0]

    if (!asset) {
        return []
    }

    const specs = findPropGenerator(asset.generatorId)?.parameters ?? treeParameterSpecs

    return shownControls(asset.generatorId, specs, asset.parameters).map((spec): Entry => {
        const shared = {
            id: `control-${spec.key}`,
            label: spec.label,
            section: 'Controls' as const,
            keywords: `${spec.group ?? ''} ${spec.help ?? ''}`,
            note: spec.group,
            icon: SlidersHorizontal,
        }

        if (spec.kind === 'choice') {
            return {
                ...shared,
                children: () =>
                    spec.options.map(
                        (option): Entry => ({
                            id: `control-${spec.key}-${option.value}`,
                            label: option.label,
                            section: 'Choose one',
                            checked: asset.parameters[spec.key] === option.value,
                            run: () => state.updateTreeParameters({[spec.key]: option.value}, `change ${spec.key}`),
                        }),
                    ),
            }
        }

        return {
            ...shared,
            run: () => {
                state.deselect()
                useUiStore.getState().revealControl(spec.key)
            },
        }
    })
}

function settingEntries(): readonly Entry[] {
    const settings = useSettingsStore.getState()

    const fromSpecs = SETTING_SPECS.map((spec): Entry => {
        const shared = {
            id: `setting-${spec.key}`,
            label: spec.label,
            section: 'Settings' as const,
            keywords: `${spec.page} ${spec.help} ${'keywords' in spec ? spec.keywords : ''}`,
            note: spec.page,
            icon: Settings2,
        }

        if (spec.kind === 'toggle') {
            const on = settingValue(spec.key) === true

            return {...shared, note: on ? 'On' : 'Off', run: () => settings.setValue(spec.key, !on)}
        }

        if (spec.kind === 'choice') {
            return {
                ...shared,
                children: () =>
                    spec.options.map(
                        (option): Entry => ({
                            id: `setting-${spec.key}-${option.value}`,
                            label: option.label,
                            section: 'Choose one',
                            checked: settingValue(spec.key) === option.value,
                            run: () => settings.setValue(spec.key, option.value),
                        }),
                    ),
            }
        }

        return {...shared, run: () => useUiStore.getState().openSettings(spec.page)}
    })

    const fromExport = EXPORT_SETTINGS.map((setting): Entry => {
        const shared = {
            id: `setting-export-${setting.key}`,
            label: setting.label,
            section: 'Settings' as const,
            keywords: `Export ${setting.help} ${setting.keywords ?? ''}`,
            note: 'Export',
            icon: Settings2,
        }

        if (setting.options) {
            return {
                ...shared,
                children: () =>
                    setting.options!.map(
                        (option): Entry => ({
                            id: `setting-export-${setting.key}-${option.value}`,
                            label: option.label,
                            section: 'Choose one',
                            checked: setting.get() === option.value,
                            run: () => setting.set(option.value),
                        }),
                    ),
            }
        }

        const on = setting.get() === true

        return {...shared, note: on ? 'On' : 'Off', run: () => setting.set(!on)}
    })

    return [...fromSpecs, ...fromExport]
}

function allEntries(state: EditorStore): readonly Entry[] {
    const onHome = state.page === 'gallery'
    const actions = COMMANDS.filter((command) => command.group !== 'Presets' && !HIDDEN.has(command.id))
        .filter((command) => !onHome || command.global)
        .map((command) => commandEntry(command, state, 'Actions'))
    const presets = COMMANDS.filter((command) => command.group === 'Presets').map((command): Entry => {
        const preset = findPreset(command.id.replace(/^preset-/, ''))

        return {
            id: command.id,
            label: command.label,
            section: 'Presets',
            keywords: `${command.keywords ?? ''} ${preset?.category ?? ''}`,
            note: PROP_FAMILIES.find(({id}) => id === familyOfPreset(preset?.id))?.label,
            icon: Shapes,
            run: () => runCommand(command),
        }
    })
    const saved = state.gallery.map(
        (tree): Entry => ({
            id: `saved-${tree.id}`,
            label: tree.name,
            section: 'Saved props',
            icon: TreePine,
            run: () => void state.openTree(tree.id),
        }),
    )

    return [...actions, ...(onHome ? [] : controlEntries(state)), ...presets, ...saved, ...settingEntries()]
}

/** What an empty palette offers. */
function startingEntries(state: EditorStore): readonly Entry[] {
    const onHome = state.page === 'gallery'
    const usable = (command: Command) => !onHome || command.global
    const relevant = COMMANDS.filter((command) => usable(command) && command.relevant?.(state)).map((command) =>
        commandEntry(command, state, 'For this selection'),
    )
    const seen = new Set(relevant.map(({id}) => id))
    const everything = allEntries(state)
    const recent = useSettingsStore
        .getState()
        .recent.flatMap((id) => {
            const entry = everything.find((candidate) => candidate.id === id)

            return entry && !seen.has(id) ? [{...entry, section: 'Recent' as const}] : []
        })

    recent.forEach(({id}) => seen.add(id))

    const suggested = (onHome ? HOME_SUGGESTED : SUGGESTED).flatMap((id) => {
        const command = findCommand(id)

        return command && usable(command) && !seen.has(id) ? [commandEntry(command, state, 'Suggested')] : []
    })

    return [...relevant, ...recent, ...suggested]
}

function searchEntries(state: EditorStore, query: string): readonly Entry[] {
    const {section, text} = parsePrefix(query)
    const usage = useSettingsStore.getState().usage
    const entries = allEntries(state).filter((entry) => !section || entry.section === section)

    if (text.trim() === '') {
        return entries
    }

    const ranked = rankEntries(entries, text, (entry) => usage[entry.id] ?? 0)

    // Whichever section holds the best match leads, so Enter takes the best row
    // while the rest stay in the promised order.
    const best = ranked.find((entry) => !entry.reason)?.section

    return SECTION_ORDER.flatMap((name) => {
        const rows = ranked.filter((entry) => entry.section === name)

        // Enter should not land on a row that can only explain itself.
        return [...rows.filter((entry) => !entry.reason), ...rows.filter((entry) => entry.reason)]
    }).sort((a, b) => Number(b.section === best) - Number(a.section === best))
}

export function CommandPalette() {
    const open = useUiStore((state) => state.paletteOpen)
    const setOpen = useUiStore((state) => state.setPaletteOpen)
    const [query, setQuery] = useState('')
    const [active, setActive] = useState(0)
    const [stack, setStack] = useState<readonly Entry[]>([])
    const [notice, setNotice] = useState<string | null>(null)
    const list = useRef<HTMLDivElement>(null)

    const sub = stack[stack.length - 1]

    const results = useMemo(() => {
        if (!open) {
            return []
        }

        const state = useEditorStore.getState()

        if (sub) {
            const items = sub.children!()

            return query.trim() ? rankEntries(items, query) : items
        }

        return query === '' ? startingEntries(state) : searchEntries(state, query)
    }, [open, query, sub])

    useEffect(() => {
        if (open) {
            setQuery('')
            setActive(0)
            setStack([])
            setNotice(null)
        }
    }, [open])

    useEffect(() => {
        setActive(0)
        setNotice(null)
    }, [query, sub])

    useEffect(() => {
        list.current?.querySelector('[data-active="true"]')?.scrollIntoView({block: 'nearest'})
    }, [active])

    const choose = (entry: Entry | undefined) => {
        if (!entry) {
            return
        }

        if (entry.reason) {
            setNotice(entry.reason)
            return
        }

        if (entry.children) {
            setStack([...stack, entry])
            setQuery('')
            return
        }

        useSettingsStore.getState().noteUsed(stack[0]?.id ?? entry.id)
        setOpen(false)
        entry.run?.()
    }

    let lastSection: Section | null = null

    return (
        <Dialog open={open} onClose={() => setOpen(false)} label="Command palette" width={600} position="top" className="palette">
            <div className="palette__search">
                {sub ? (
                    <button type="button" className="palette__back" aria-label="Back" onClick={() => setStack(stack.slice(0, -1))}>
                        <ChevronLeft size={15} aria-hidden="true" />
                        {sub.label}
                    </button>
                ) : (
                    <Search size={15} aria-hidden="true" className="palette__search-icon" />
                )}
                <input
                    autoFocus
                    className="palette__input"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="palette-list"
                    aria-activedescendant={results[active] ? `palette-${active}` : undefined}
                    aria-label="Search commands, controls, presets and settings"
                    placeholder={sub ? 'Choose one' : 'Search commands, controls, presets, settings…'}
                    value={query}
                    spellCheck={false}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') {
                            event.preventDefault()
                            setActive((current) => Math.min(current + 1, results.length - 1))
                        } else if (event.key === 'ArrowUp') {
                            event.preventDefault()
                            setActive((current) => Math.max(current - 1, 0))
                        } else if (event.key === 'Enter') {
                            event.preventDefault()
                            choose(results[active])
                        } else if (event.key === 'Backspace' && query === '' && sub) {
                            event.preventDefault()
                            setStack(stack.slice(0, -1))
                        } else if (event.key === 'Escape' && sub) {
                            event.preventDefault()
                            event.stopPropagation()
                            setStack(stack.slice(0, -1))
                        }
                    }}
                />
            </div>

            <div className="palette__list" id="palette-list" role="listbox" aria-label="Results" ref={list}>
                {results.length === 0 ? <p className="palette__empty">Nothing matches that. Try a shorter word.</p> : null}
                {results.map((entry, index) => {
                    const heading = !sub && entry.section !== lastSection ? entry.section : null
                    const Icon = entry.icon

                    lastSection = entry.section

                    return (
                        <div key={`${entry.section}-${entry.id}`} role="presentation">
                            {heading ? (
                                <div className="palette__heading" role="presentation">
                                    {heading}
                                </div>
                            ) : null}
                            <button
                                type="button"
                                id={`palette-${index}`}
                                role="option"
                                tabIndex={-1}
                                aria-selected={index === active}
                                aria-disabled={entry.reason ? true : undefined}
                                className="palette__row"
                                data-active={index === active}
                                data-unavailable={entry.reason ? true : undefined}
                                onMouseMove={() => setActive(index)}
                                onClick={() => choose(entry)}
                            >
                                <span className="palette__icon" aria-hidden="true">
                                    {entry.checked ? <Check size={14} /> : Icon ? <Icon size={14} /> : null}
                                </span>
                                <span className="palette__label">{entry.label}</span>
                                {entry.reason ? <span className="palette__reason">{entry.reason}</span> : null}
                                {!entry.reason && entry.note ? <span className="palette__note">{entry.note}</span> : null}
                                {entry.keys ? <Keys keys={entry.keys} /> : null}
                                {entry.children ? <ChevronRight size={13} aria-hidden="true" className="palette__more" /> : null}
                            </button>
                        </div>
                    )
                })}
            </div>

            <div className="palette__foot">
                {notice ? (
                    <span className="palette__notice" role="status">
                        {notice}
                    </span>
                ) : (
                    <>
                        <span><kbd className="keys">↑↓</kbd> move</span>
                        <span><kbd className="keys">Enter</kbd> run</span>
                        <span className="palette__prefixes">
                            <kbd className="keys">&gt;</kbd> actions <kbd className="keys">#</kbd> controls <kbd className="keys">@</kbd> presets
                        </span>
                    </>
                )}
            </div>
        </Dialog>
    )
}
