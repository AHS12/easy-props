/**
 * The shortcut sheet.
 *
 * Read from the same registry the palette and the key handler use, so it can
 * never drift from what the keys actually do.
 */

import {COMMANDS} from '../core/commands/commands'

interface ShortcutsPanelProps {
    open: boolean
    onClose(): void
}

/** Command groups end up as sections, in the order they first appear. */
function grouped(): [string, readonly (typeof COMMANDS)[number][]][] {
    const groups = new Map<string, (typeof COMMANDS)[number][]>()

    for (const command of COMMANDS) {
        const list = groups.get(command.group) ?? []
        list.push(command)
        groups.set(command.group, list)
    }

    return [...groups.entries()]
}

export function ShortcutsPanel({open, onClose}: ShortcutsPanelProps) {
    if (!open) {
        return null
    }

    return (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
            <button type="button" className="sheet__scrim" aria-label="Close" onClick={onClose} />

            <div className="sheet__panel shortcuts">
                <div className="shortcuts__head">
                    <h2>Keyboard shortcuts</h2>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
                        Close
                    </button>
                </div>

                <div className="shortcuts__body">
                    {grouped().map(([group, commands]) => (
                        <section className="shortcuts__group" key={group}>
                            <h3>{group}</h3>

                            {commands.map((command) => (
                                <div className="shortcuts__row" key={command.id}>
                                    <span>{command.label}</span>
                                    {command.shortcut ? (
                                        <kbd>{command.shortcut}</kbd>
                                    ) : (
                                        <span className="shortcuts__none">—</span>
                                    )}
                                </div>
                            ))}
                        </section>
                    ))}
                </div>
            </div>
        </div>
    )
}
