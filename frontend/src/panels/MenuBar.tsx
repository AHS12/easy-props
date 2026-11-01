/**
 * The menu bar, which is also the window's title bar.
 *
 * Menus make every feature discoverable. Every item comes from the command registry,
 * so a menu can never disagree with the palette or the keys.
 */

import {Dropdown} from '@heroui/react'
import {Check, ChevronRight, Copy, Download, Minus, Save, Search, Square, Trees, X} from 'lucide-react'
import {Fragment, useEffect, useRef, useState} from 'react'
import {Keys} from '../components/controls'
import {findCommand, runCommand, shortcutFor, type Command} from '../core/commands/commands'
import {closeWindow, hasInsetTitleBar, hasWindowControls, minimiseWindow, toggleMaximiseWindow, windowIsMaximised} from '../platform/window'
import {hasUnsavedChanges, useEditorStore} from '../store/editor-store'
import {useUiStore} from '../store/ui-store'

/** A menu is command ids, with null for a divider. */
const MENUS: readonly {readonly title: string; readonly items: readonly (string | null)[]}[] = [
    {
        title: 'File',
        items: ['new-tree', 'new-rock', 'new-bush', null, 'gallery', 'open-project', null, 'save-project', 'save-project-as', 'save-to-file', null, 'export-model', 'batch-export', null, 'settings'],
    },
    {
        title: 'Edit',
        items: ['undo', 'redo', null, 'copy', 'remove', 'restore-part', null, 'cancel'],
    },
    {
        title: 'View',
        items: ['shading', 'detail-level', null, 'frame', 'view-angle', null, 'toggle-stats', 'toggle-scale-figure', null, 'toggle-panels', 'maximize', 'reset-layout', null, 'theme'],
    },
    {
        title: 'Prop',
        items: ['randomize', 'restore-tree', null, 'style-low-poly', 'style-detailed'],
    },
    {
        title: 'Help',
        items: ['palette', 'shortcuts', 'tour', 'whats-new', null, 'about'],
    },
]

function ItemBody({command, children}: {command: Command; children?: boolean}) {
    const state = useEditorStore.getState()
    const Icon = command.icon
    const keys = shortcutFor(command.id)
    const reason = command.unavailable?.(state)

    return (
        <>
            <span className="menu-item__icon" aria-hidden="true">
                {command.checked?.(state) ? <Check size={13} /> : Icon ? <Icon size={13} /> : null}
            </span>
            <span className="menu-item__label" title={reason ?? undefined}>
                {command.label}
            </span>
            {keys ? <Keys keys={keys} /> : null}
            {children ? <ChevronRight className="menu-item__more" size={13} aria-hidden="true" /> : null}
        </>
    )
}

function MenuEntries({items, onDone}: {items: readonly (string | null)[]; onDone(): void}) {
    // A menu shows the state as it is now, so it follows the store while open.
    const state = useEditorStore()

    return (
        <Dropdown.Menu
            className="menu-list"
            onAction={(id) => {
                const command = findCommand(String(id), state)

                if (command) {
                    onDone()
                    runCommand(command)
                }
            }}
            disabledKeys={items.flatMap((id) => {
                const command = id ? findCommand(id) : undefined

                // The home page has no prop on screen to act on.
                const off = command && ((state.page === 'gallery' && !command.global) || command.unavailable?.(state))

                return off ? [command.id] : []
            })}
        >
            {items.map((id, index) => {
                if (id === null) {
                    return <Dropdown.Item key={`divider-${index}`} id={`divider-${index}`} isDisabled className="menu-divider" textValue="" aria-hidden="true" />
                }

                const command = findCommand(id)

                if (!command) {
                    return null
                }

                if (command.children) {
                    return (
                        <Dropdown.SubmenuTrigger key={id}>
                            <Dropdown.Item id={id} textValue={command.label} className="menu-item">
                                <ItemBody command={command} children />
                            </Dropdown.Item>
                            <Dropdown.Popover className="menu-popover" placement="right top">
                                <Dropdown.Menu
                                    className="menu-list"
                                    onAction={(childId) => {
                                        const child = command.children!(state).find((entry) => entry.id === childId)

                                        if (child) {
                                            onDone()
                                            runCommand(child)
                                        }
                                    }}
                                >
                                    {command.children(state).map((child) => (
                                        <Dropdown.Item key={child.id} id={child.id} textValue={child.label} className="menu-item">
                                            <ItemBody command={child} />
                                        </Dropdown.Item>
                                    ))}
                                </Dropdown.Menu>
                            </Dropdown.Popover>
                        </Dropdown.SubmenuTrigger>
                    )
                }

                return (
                    <Dropdown.Item key={id} id={id} textValue={command.label} className="menu-item">
                        <ItemBody command={command} />
                    </Dropdown.Item>
                )
            })}
        </Dropdown.Menu>
    )
}

function Menus() {
    const [open, setOpen] = useState<string | null>(null)

    return (
        <nav className="menus" aria-label="Menu">
            {MENUS.map(({title, items}) => (
                <Dropdown
                    key={title}
                    isOpen={open === title}
                    onOpenChange={(next) => setOpen(next ? title : (current) => (current === title ? null : current))}
                >
                    <Dropdown.Trigger
                        className="menu-button"
                        data-open={open === title}
                        // Moving along the bar with one open switches menus, as a real menu bar does.
                        onHoverStart={() => setOpen((current) => (current && current !== title ? title : current))}
                    >
                        {title}
                    </Dropdown.Trigger>
                    <Dropdown.Popover className="menu-popover" placement="bottom start" offset={2} isNonModal>
                        <MenuEntries items={items} onDone={() => setOpen(null)} />
                    </Dropdown.Popover>
                </Dropdown>
            ))}
        </nav>
    )
}

/** The prop's name: click to rename it where it is. A dot marks unsaved changes. */
function PropName() {
    const treeName = useEditorStore((state) => state.treeName)
    const setTreeName = useEditorStore((state) => state.setTreeName)
    const dirty = useEditorStore(hasUnsavedChanges)
    const [draft, setDraft] = useState<string | null>(null)
    const input = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (draft !== null) {
            input.current?.select()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only when editing starts.
    }, [draft === null])

    if (draft !== null) {
        const finish = () => {
            if (draft.trim()) {
                setTreeName(draft.trim())
            }

            setDraft(null)
        }

        return (
            <input
                ref={input}
                className="prop-name__input"
                aria-label="Prop name"
                value={draft}
                maxLength={60}
                spellCheck={false}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={finish}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        finish()
                    } else if (event.key === 'Escape') {
                        event.stopPropagation()
                        setDraft(null)
                    }
                }}
            />
        )
    }

    return (
        <button type="button" className="prop-name" title="Rename" onClick={() => setDraft(treeName)}>
            <span className="prop-name__text">{treeName}</span>
            <span className="prop-name__dot" data-dirty={dirty} role="img" aria-label={dirty ? 'Unsaved changes' : 'Saved'} />
        </button>
    )
}

function WindowControls() {
    const [maximised, setMaximised] = useState(false)

    useEffect(() => {
        const check = () => void windowIsMaximised().then(setMaximised)

        check()
        window.addEventListener('resize', check)

        return () => window.removeEventListener('resize', check)
    }, [])

    if (!hasWindowControls()) {
        return null
    }

    return (
        <div className="window-controls">
            <button type="button" className="window-control" aria-label="Minimise" onClick={minimiseWindow}>
                <Minus size={14} aria-hidden="true" strokeWidth={1.4} />
            </button>
            <button type="button" className="window-control" aria-label={maximised ? 'Restore' : 'Maximise'} onClick={toggleMaximiseWindow}>
                {maximised ? <Copy size={11} aria-hidden="true" strokeWidth={1.4} /> : <Square size={11} aria-hidden="true" strokeWidth={1.4} />}
            </button>
            <button type="button" className="window-control window-control--close" aria-label="Close" onClick={closeWindow}>
                <X size={15} aria-hidden="true" strokeWidth={1.4} />
            </button>
        </div>
    )
}

export function MenuBar({home}: {home?: boolean}) {
    const saveTree = useEditorStore((state) => state.saveTree)
    const exportModel = useEditorStore((state) => state.exportModel)
    const setPaletteOpen = useUiStore((state) => state.setPaletteOpen)
    const showGallery = useEditorStore((state) => state.showGallery)

    return (
        <header className="menubar" data-inset={hasInsetTitleBar()}>
            <button type="button" className="menubar__brand" aria-label="Home" title="Home" onClick={showGallery}>
                <Trees size={15} aria-hidden="true" />
            </button>
            <Menus />
            {home ? <span className="menubar__app">easy-props</span> : <PropName />}
            <span className="menubar__drag" />
            <button type="button" className="palette-button" data-coach="search" onClick={() => setPaletteOpen(true)}>
                <Search size={13} aria-hidden="true" />
                <span>Search or run…</span>
                <Keys keys={shortcutFor('palette') ?? 'Ctrl+K'} />
            </button>
            <span className="menubar__drag" />
            {home ? null : (
                <Fragment>
                    <button type="button" className="button" data-coach="save" onClick={() => void saveTree()} title={`Save (${shortcutFor('save-project') ?? ''})`}>
                        <Save size={13} aria-hidden="true" />
                        Save
                    </button>
                    <button
                        type="button"
                        className="button button--primary"
                        data-coach="export"
                        onClick={() => exportModel()}
                        title={`Export for a game engine (${shortcutFor('export-model') ?? ''})`}
                    >
                        <Download size={13} aria-hidden="true" />
                        Export
                    </button>
                </Fragment>
            )}
            <WindowControls />
        </header>
    )
}
