/**
 * The command palette.
 *
 * Every command in the registry, filtered as you type. The point is that a
 * beginner can find "Remove part" without knowing that Delete does it, and
 * can see the shortcut while they are there.
 */

import {useEffect, useMemo, useRef, useState} from 'react'
import {COMMANDS, type Command} from '../core/commands/commands'

interface CommandPaletteProps {
    open: boolean
    onClose(): void
    onRun(command: Command): void
}

/** Commands whose label, group, or keywords contain every word typed. */
function matching(query: string): readonly Command[] {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

    if (words.length === 0) {
        return COMMANDS
    }

    return COMMANDS.filter((command) => {
        const haystack = `${command.label} ${command.group} ${command.keywords ?? ''}`.toLowerCase()
        return words.every((word) => haystack.includes(word))
    })
}

export function CommandPalette({open, onClose, onRun}: CommandPaletteProps) {
    const [query, setQuery] = useState('')
    const [active, setActive] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)

    const results = useMemo(() => matching(query), [query])

    useEffect(() => {
        if (open) {
            setQuery('')
            setActive(0)
            // The field is the whole point, so it takes focus on open.
            requestAnimationFrame(() => inputRef.current?.focus())
        }
    }, [open])

    useEffect(() => {
        setActive(0)
    }, [query])

    if (!open) {
        return null
    }

    const runActive = () => {
        const command = results[active]

        if (command) {
            onRun(command)
        }
    }

    return (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Command palette">
            <button type="button" className="sheet__scrim" aria-label="Close" onClick={onClose} />

            <div className="sheet__panel palette">
                <input
                    ref={inputRef}
                    className="palette__input"
                    type="text"
                    placeholder="Type a command"
                    aria-label="Search commands"
                    value={query}
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
                            runActive()
                        } else if (event.key === 'Escape') {
                            event.preventDefault()
                            onClose()
                        }
                    }}
                />

                <div className="palette__list" role="listbox" aria-label="Commands">
                    {results.length === 0 ? (
                        <p className="palette__empty">Nothing matches that.</p>
                    ) : (
                        results.map((command, index) => (
                            <button
                                key={command.id}
                                type="button"
                                role="option"
                                aria-selected={index === active}
                                className="palette__row"
                                data-active={index === active}
                                onMouseEnter={() => setActive(index)}
                                onClick={() => onRun(command)}
                            >
                                <span className="palette__group">{command.group}</span>
                                <span className="palette__label">{command.label}</span>
                                {command.shortcut ? (
                                    <kbd className="palette__key">{command.shortcut}</kbd>
                                ) : null}
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
