/**
 * Settings: a large window with a side list and a search box.
 *
 * Changes apply at once, with no Save button. The pages render from the settings
 * list, so adding a setting takes one entry there.
 */

import {FolderOpen, Keyboard, RotateCcw, Search, X} from 'lucide-react'
import type {LucideIcon} from 'lucide-react'
import {ArchiveRestore, Cpu, Download, HardDrive, Info, Monitor, Palette as PaletteIcon, Settings2, SwatchBook, Trash2} from 'lucide-react'
import {useEffect, useMemo, useState, type ReactNode} from 'react'
import {ColourPicker} from '../components/ColourPicker'
import {Dialog, Keys, Select, Switch} from '../components/controls'
import {PropertyRow} from '../components/PropertyRow'
import {COMMANDS, commandForKeys, shortcutFor, shortcutOf} from '../core/commands/commands'
import {APP_VERSION, loadExportPreferences, saveExportPreferences} from '../core/export/export-preferences'
import {EXPORT_SETTINGS} from '../core/settings/export-settings'
import {SETTING_SPECS, type SettingPage, type SettingSpec} from '../core/settings/settings-spec'
import {chooseFolder} from '../platform/desktop'
import {hasDesktopStorage, libraryInfo, openLibraryFolder, type LibraryInfo} from '../platform/settings'
import {canCheckForUpdates} from '../platform/update'
import {openLink} from '../platform/window'
import {useEditorStore} from '../store/editor-store'
import {useSettingsStore} from '../store/settings-store'
import {useUiStore, type SettingsPageId} from '../store/ui-store'
import {useUpdateStore} from '../store/update-store'
import {RemovedProps} from '../pages/RemovedProps'
import {canBackUp} from '../platform/backup'
import {useBackupStore} from '../store/backup-store'
import {PalettesPage} from './PalettesPage'

const PAGES: readonly {readonly id: SettingsPageId; readonly icon: LucideIcon}[] = [
    {id: 'General', icon: Settings2},
    {id: 'Appearance', icon: PaletteIcon},
    {id: 'Palettes', icon: SwatchBook},
    {id: 'Viewport', icon: Monitor},
    {id: 'Performance', icon: Cpu},
    {id: 'Export', icon: Download},
    {id: 'Keyboard', icon: Keyboard},
    {id: 'Storage', icon: HardDrive},
    {id: 'Backup', icon: ArchiveRestore},
    {id: 'Recently removed', icon: Trash2},
    {id: 'About', icon: Info},
]

const matches = (needle: string, ...texts: readonly (string | undefined)[]) =>
    texts.some((text) => text?.toLowerCase().includes(needle))

function SettingRow({label, help, children}: {label: string; help?: string; children: ReactNode}) {
    return (
        <div className="setting">
            <div className="setting__text">
                <div className="setting__label">{label}</div>
                {help ? <div className="setting__help">{help}</div> : null}
            </div>
            <div className="setting__control">{children}</div>
        </div>
    )
}

function SpecRow({spec}: {spec: SettingSpec}) {
    const value = useSettingsStore((state) => state.values[spec.key as keyof typeof state.values])
    const setValue = useSettingsStore((state) => state.setValue)
    const key = spec.key as Parameters<typeof setValue>[0]

    switch (spec.kind) {
        case 'toggle':
            return (
                <SettingRow label={spec.label} help={spec.help}>
                    <Switch label={spec.label} value={value === true} onChange={(next) => setValue(key, next)} />
                </SettingRow>
            )
        case 'choice':
            return (
                <SettingRow label={spec.label} help={spec.help}>
                    <Select label={spec.label} value={String(value)} options={spec.options} onChange={(next) => setValue(key, next)} />
                </SettingRow>
            )
        case 'number':
            return (
                <SettingRow label={spec.label} help={spec.help}>
                    <PropertyRow
                        label={spec.label}
                        value={Number(value)}
                        min={spec.min}
                        max={spec.max}
                        step={spec.step}
                        unit={spec.unit}
                        resetTo={spec.default}
                        onChange={(next) => setValue(key, next)}
                    />
                </SettingRow>
            )
        case 'colour':
            return (
                <SettingRow label={spec.label} help={spec.help}>
                    <ColourPicker label={spec.label} value={String(value)} onChange={(next) => setValue(key, next)} />
                </SettingRow>
            )
    }
}

/** Reads through to the export preferences, so a change here is one everywhere. */
function ExportPage({needle}: {needle: string}) {
    const budgetTarget = useEditorStore((state) => state.budgetTarget)
    const [, refresh] = useState(0)
    const [folder, setFolder] = useState(() => loadExportPreferences().folder)

    return (
        <>
            {EXPORT_SETTINGS.filter((setting) => !needle || matches(needle, setting.label, setting.help, setting.keywords)).map((setting) => {
                const value = setting.key === 'budget' ? budgetTarget : setting.get()
                const set = (next: boolean | string) => {
                    setting.set(next)
                    refresh((count) => count + 1)
                }

                return (
                    <SettingRow key={setting.key} label={setting.label} help={setting.help}>
                        {setting.options ? (
                            <Select label={setting.label} value={String(value)} options={setting.options} onChange={set} />
                        ) : (
                            <Switch label={setting.label} value={value === true} onChange={set} />
                        )}
                    </SettingRow>
                )
            })}
            {!needle || matches(needle, 'default folder', 'export') ? (
                <SettingRow label="Default folder" help={folder || 'You will be asked when you export.'}>
                    {folder ? (
                        <button
                            type="button"
                            className="text-button"
                            onClick={() => {
                                saveExportPreferences({...loadExportPreferences(), folder: ''})
                                setFolder('')
                            }}
                        >
                            Clear
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className="button"
                        onClick={() =>
                            void chooseFolder(folder).then((chosen) => {
                                if (chosen) {
                                    saveExportPreferences({...loadExportPreferences(), folder: chosen})
                                    setFolder(chosen)
                                }
                            })
                        }
                    >
                        Choose…
                    </button>
                </SettingRow>
            ) : null}
        </>
    )
}

/** Presses for a new shortcut. Esc cancels, and Backspace clears. */
function KeyCapture({commandId, onDone}: {commandId: string; onDone(): void}) {
    const setShortcut = useSettingsStore((state) => state.setShortcut)

    return (
        <input
            autoFocus
            readOnly
            className="key-capture"
            aria-label="Press the new keys"
            placeholder="Press keys…"
            onBlur={onDone}
            onKeyDown={(event) => {
                event.preventDefault()
                event.stopPropagation()

                if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
                    return
                }

                if (event.key === 'Escape') {
                    onDone()
                    return
                }

                setShortcut(commandId, event.key === 'Backspace' ? '' : shortcutOf(event.nativeEvent))
                onDone()
            }}
        />
    )
}

function KeyboardPage({needle}: {needle: string}) {
    const overrides = useSettingsStore((state) => state.shortcuts)
    const setShortcut = useSettingsStore((state) => state.setShortcut)
    const resetShortcuts = useSettingsStore((state) => state.resetShortcuts)
    const [capturing, setCapturing] = useState<string | null>(null)

    // Presets are many, so they are only shown when looked for.
    const commands = COMMANDS.filter((command) =>
        needle
            ? matches(needle, command.label, command.group, command.keywords, shortcutFor(command.id))
            : command.group !== 'Presets',
    )
    const groups = [...new Set(commands.map((command) => command.group))]

    return (
        <>
            <p className="settings__intro">
                Click a shortcut, then press the new keys. Backspace removes it, and Esc keeps it. Search for a preset to give it a key of its own.
            </p>
            {groups.map((group) => (
                <section key={group}>
                    <h3 className="settings__group">{group}</h3>
                    {commands
                        .filter((command) => command.group === group)
                        .map((command) => {
                            const keys = shortcutFor(command.id)
                            const clash = keys ? commandForKeys(keys) : undefined
                            const conflict = clash && clash.id !== command.id ? clash : undefined

                            return (
                                <div className="key-row" key={command.id}>
                                    <span className="key-row__label">{command.label}</span>
                                    {conflict ? (
                                        <span className="key-row__conflict" role="status">
                                            Also used by {conflict.label}
                                        </span>
                                    ) : null}
                                    {overrides[command.id] !== undefined ? (
                                        <button
                                            type="button"
                                            className="prop__reset"
                                            aria-label={`Reset the shortcut for ${command.label}`}
                                            title="Reset"
                                            onClick={() => setShortcut(command.id, null)}
                                        >
                                            <RotateCcw size={12} aria-hidden="true" />
                                        </button>
                                    ) : null}
                                    {capturing === command.id ? (
                                        <KeyCapture commandId={command.id} onDone={() => setCapturing(null)} />
                                    ) : (
                                        <button
                                            type="button"
                                            className="key-row__keys"
                                            aria-label={`Change the shortcut for ${command.label}: ${keys ?? 'none'}`}
                                            onClick={() => setCapturing(command.id)}
                                        >
                                            {keys ? <Keys keys={keys} /> : <span className="key-row__none">Add</span>}
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                </section>
            ))}
            <div className="settings__page-foot">
                <button type="button" className="button" onClick={resetShortcuts}>
                    Reset all shortcuts
                </button>
            </div>
        </>
    )
}

function formatBytes(bytes: number): string {
    return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StoragePage() {
    const setLibraryFolder = useSettingsStore((state) => state.setLibraryFolder)
    const custom = useSettingsStore((state) => state.libraryFolder)
    const refreshGallery = useEditorStore((state) => state.refreshGallery)
    const removed = useEditorStore((state) => state.removedProps.length)
    const refreshRemoved = useEditorStore((state) => state.refreshRemoved)
    const openSettings = useUiStore((state) => state.openSettings)
    const [info, setInfo] = useState<LibraryInfo | null>(null)

    const reload = () => void libraryInfo().then(setInfo, () => setInfo(null))

    useEffect(reload, [custom])

    useEffect(() => {
        void refreshRemoved()
    }, [custom, refreshRemoved])

    return (
        <>
            {hasDesktopStorage() ? (
                <>
                    <SettingRow label="Where props are saved" help={info?.folder ?? 'Looking…'}>
                        <button type="button" className="button" onClick={() => void openLibraryFolder()}>
                            <FolderOpen size={13} aria-hidden="true" />
                            Open folder
                        </button>
                    </SettingRow>
                    <SettingRow
                        label="Change folder"
                        help="New saves go to the new folder, and Your props lists what is there. Props in the old folder stay where they are."
                    >
                        {custom ? (
                            <button
                                type="button"
                                className="text-button"
                                onClick={() => {
                                    setLibraryFolder('')
                                    window.setTimeout(() => void refreshGallery(), 100)
                                }}
                            >
                                Use default
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className="button"
                            onClick={() =>
                                void chooseFolder(info?.folder ?? '').then((chosen) => {
                                    if (chosen) {
                                        setLibraryFolder(chosen)
                                        window.setTimeout(() => void refreshGallery(), 100)
                                    }
                                })
                            }
                        >
                            Change…
                        </button>
                    </SettingRow>
                    <SettingRow label="Space used" help={info ? `${info.props} ${info.props === 1 ? 'prop' : 'props'}, with their pictures.` : undefined}>
                        <span className="tabular setting__value">{info ? formatBytes(info.bytes) : '…'}</span>
                    </SettingRow>
                    <SettingRow
                        label="Recently removed"
                        help={removed === 0 ? 'Nothing removed lately.' : `${removed} ${removed === 1 ? 'prop' : 'props'}, kept for 30 days in case you want them back.`}
                    >
                        <button type="button" className="button" onClick={() => openSettings('Recently removed')}>
                            Show
                        </button>
                    </SettingRow>
                </>
            ) : (
                <p className="settings__intro">Running in a browser, props are kept in this browser's storage.</p>
            )}
        </>
    )
}

/** Backing up to a file and restoring from one. Folder and cloud backups come later. */
function BackupPage() {
    const phase = useBackupStore((state) => state.phase)
    const progress = useBackupStore((state) => state.progress)
    const backUp = useBackupStore((state) => state.backUp)
    const openRestore = useBackupStore((state) => state.openRestore)
    const stop = useBackupStore((state) => state.stop)
    const busy = phase !== 'idle'

    if (!canBackUp()) {
        return <p className="settings__intro">Backups need the desktop app.</p>
    }

    return (
        <>
            <p className="settings__intro">
                A backup is one .zip file holding every saved prop, its picture and your palettes. Keep it on a USB stick or in a
                synced folder, and bring your props back on any computer.
            </p>
            <SettingRow label="Back up to a file" help="Saves a .zip of your props wherever you choose. Exported files aren't included, since they can be made again.">
                <button type="button" className="button" disabled={busy} onClick={() => void backUp()}>
                    Back up to a file…
                </button>
            </SettingRow>
            <SettingRow label="Restore from a backup" help="Shows what's in a backup first. Nothing replaces a prop you have.">
                <button type="button" className="button" disabled={busy} onClick={() => void openRestore()}>
                    Restore from a backup…
                </button>
            </SettingRow>
            {busy ? (
                <div className="backup-progress" role="status">
                    <span className="setting__help">
                        {phase === 'backing-up' ? 'Backing up' : phase === 'opening' ? 'Opening the backup' : 'Restoring'}
                        {progress ? `, ${progress.done} of ${progress.total} files` : '…'}
                    </span>
                    <progress className="dialog__progress" max={progress?.total ?? 1} value={progress?.done ?? 0} aria-label="Files done" />
                    <button type="button" className="button" onClick={stop}>
                        Stop
                    </button>
                </div>
            ) : null}
        </>
    )
}

const GITHUB_URL = 'https://github.com/AHS12/easy-props'

function UpdateRow() {
    const update = useUpdateStore((state) => state.update)
    const {check, download, restart} = useUpdateStore.getState()

    switch (update.phase) {
        case 'idle':
            return (
                <SettingRow label="Updates" help="See whether a newer version is out.">
                    <button type="button" className="button" onClick={() => void check()}>
                        Check for updates
                    </button>
                </SettingRow>
            )
        case 'checking':
            return (
                <SettingRow label="Updates" help="Looking for a newer version…">
                    <button type="button" className="button" disabled>
                        Check for updates
                    </button>
                </SettingRow>
            )
        case 'current':
            return (
                <SettingRow label="Updates" help="You have the latest version.">
                    <button type="button" className="button" onClick={() => void check()}>
                        Check again
                    </button>
                </SettingRow>
            )
        case 'manual':
            return (
                <SettingRow label="Updates" help={`Version ${update.version} is out. Get it from the download page, then install it over this one.`}>
                    <button type="button" className="button button--primary" onClick={() => openLink(update.releaseUrl)}>
                        Open download page
                    </button>
                </SettingRow>
            )
        case 'available':
            return (
                <SettingRow label="Updates" help={`Version ${update.version} is out.`}>
                    <button type="button" className="button button--primary" onClick={() => void download()}>
                        Download update
                    </button>
                </SettingRow>
            )
        case 'downloading':
            return (
                <SettingRow label="Updates" help={`Downloading version ${update.version}: ${Math.round(update.fraction * 100)}%`}>
                    <button type="button" className="button" disabled>
                        Download update
                    </button>
                </SettingRow>
            )
        case 'ready':
            return (
                <SettingRow label="Updates" help={`Version ${update.version} is ready. easy-props will close, update itself and open again.`}>
                    <button type="button" className="button button--primary" onClick={() => void restart()}>
                        Restart to update
                    </button>
                </SettingRow>
            )
        case 'failed':
            return (
                <SettingRow label="Updates" help={update.message}>
                    <button type="button" className="button" onClick={() => void check()}>
                        Try again
                    </button>
                </SettingRow>
            )
    }
}

function AboutPage() {
    return (
        <>
            <SettingRow label="easy-props" help="Make game-ready trees and props, with no 3D experience needed.">
                <span className="tabular setting__value">Version {APP_VERSION}</span>
            </SettingRow>
            {canCheckForUpdates() ? <UpdateRow /> : null}
            <SettingRow label="Developer" help="AHS12. The code, releases and issues are on GitHub.">
                <button type="button" className="button" onClick={() => openLink(GITHUB_URL)}>
                    github.com/AHS12/easy-props
                </button>
            </SettingRow>
            <SettingRow
                label="Open-source software"
                help="Built with Three.js (MIT), React (MIT), HeroUI (Apache-2.0), React Aria (Apache-2.0), Lucide (ISC), Tailwind CSS (MIT), Zustand (MIT), Zod (MIT) and Wails (MIT)."
            >
                <span />
            </SettingRow>
        </>
    )
}

export function SettingsDialog() {
    const page = useUiStore((state) => state.settingsPage)
    const closeSettings = useUiStore((state) => state.closeSettings)
    const openSettings = useUiStore((state) => state.openSettings)
    const resetPage = useSettingsStore((state) => state.resetPage)
    const [query, setQuery] = useState('')
    const needle = query.trim().toLowerCase()

    useEffect(() => {
        if (page) {
            setQuery('')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- clears on open, not on each page.
    }, [page === null])

    const found = useMemo(
        () => SETTING_SPECS.filter((spec) => matches(needle, spec.label, spec.help, 'keywords' in spec ? spec.keywords : undefined, spec.page)),
        [needle],
    )

    const specPage = (SETTING_SPECS as readonly SettingSpec[]).some((spec) => spec.page === page)

    return (
        <Dialog open={page !== null} onClose={closeSettings} label="Settings" width={860} className="settings">
            <nav className="settings__nav" aria-label="Settings pages">
                <div className="filter">
                    <Search size={13} aria-hidden="true" className="filter__icon" />
                    <input
                        autoFocus
                        className="filter__input"
                        placeholder="Search settings"
                        aria-label="Search settings"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape' && query) {
                                event.stopPropagation()
                                setQuery('')
                            }
                        }}
                    />
                </div>
                {PAGES.map(({id, icon: Icon}) => (
                    <button
                        key={id}
                        type="button"
                        className="settings__page"
                        aria-current={!needle && page === id ? 'page' : undefined}
                        onClick={() => {
                            setQuery('')
                            openSettings(id)
                        }}
                    >
                        <Icon size={14} aria-hidden="true" />
                        {id}
                    </button>
                ))}
            </nav>

            <div className="settings__main">
                <header className="settings__head">
                    <h2 className="settings__title">{needle ? `Results for “${query.trim()}”` : page}</h2>
                    {specPage && !needle ? (
                        <button type="button" className="text-button" onClick={() => resetPage(page as SettingPage)}>
                            Reset this page
                        </button>
                    ) : null}
                    <button type="button" className="icon-button" aria-label="Close settings" onClick={closeSettings}>
                        <X size={15} aria-hidden="true" />
                    </button>
                </header>

                <div className="settings__body">
                    {needle ? (
                        <>
                            {found.map((spec) => (
                                <SpecRow key={spec.key} spec={spec} />
                            ))}
                            <ExportPage needle={needle} />
                            {found.length === 0 ? <p className="settings__intro">No other settings match that.</p> : null}
                        </>
                    ) : page === 'Export' ? (
                        <ExportPage needle="" />
                    ) : page === 'Keyboard' ? (
                        <KeyboardPage needle="" />
                    ) : page === 'Storage' ? (
                        <StoragePage />
                    ) : page === 'Backup' ? (
                        <BackupPage />
                    ) : page === 'Recently removed' ? (
                        hasDesktopStorage() ? (
                            <RemovedProps layout="rows" />
                        ) : (
                            <p className="settings__intro">Removed props are kept only in the desktop app.</p>
                        )
                    ) : page === 'Palettes' ? (
                        <PalettesPage />
                    ) : page === 'About' ? (
                        <AboutPage />
                    ) : (
                        (SETTING_SPECS as readonly SettingSpec[])
                            .filter((spec) => spec.page === page)
                            .map((spec) => <SpecRow key={spec.key} spec={spec} />)
                    )}
                    {page === 'General' && !needle ? (
                        <SettingRow label="Show the tour" help="A short walk around the app.">
                            <button
                                type="button"
                                className="button"
                                onClick={() => {
                                    closeSettings()
                                    useUiStore.getState().setTourOpen(true)
                                }}
                            >
                                Show it now
                            </button>
                        </SettingRow>
                    ) : null}
                    {page === 'General' && !needle ? (
                        <SettingRow label="See what's new" help="The changes in each version.">
                            <button
                                type="button"
                                className="button"
                                onClick={() => {
                                    closeSettings()
                                    useUiStore.getState().setWhatsNewOpen(true)
                                }}
                            >
                                Show it now
                            </button>
                        </SettingRow>
                    ) : null}
                </div>
            </div>
        </Dialog>
    )
}
