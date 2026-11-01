import {useEffect, useMemo} from 'react'
import changelog from '../../../CHANGELOG.md?raw'
import {Dialog} from '../components/controls'
import {parseChangelog, whatsNewDue} from '../core/changelog'
import {APP_VERSION} from '../core/export/export-preferences'
import {useEditorStore} from '../store/editor-store'
import {useSettingsStore} from '../store/settings-store'
import {useUiStore} from '../store/ui-store'

/** The changelog, shown once after each update and any time from Help. */
export function WhatsNewDialog() {
    const open = useUiStore((state) => state.whatsNewOpen)
    const setOpen = useUiStore((state) => state.setWhatsNewOpen)
    const tourOpen = useUiStore((state) => state.tourOpen)
    const page = useEditorStore((state) => state.page)
    const loaded = useSettingsStore((state) => state.loaded)
    const wanted = useSettingsStore((state) => state.values.showWhatsNew === true)
    const seenVersion = useSettingsStore((state) => state.lastSeenVersion)
    const tourSeen = useSettingsStore((state) => (page === 'editor' ? state.tourSeen : state.galleryTourSeen))
    const releases = useMemo(() => parseChangelog(changelog), [])
    const due = whatsNewDue({loaded, wanted, seenVersion, version: APP_VERSION, tourSeen, tourOpen})

    useEffect(() => {
        if (due) {
            setOpen(true)
        }
    }, [due, setOpen])

    const close = () => {
        setOpen(false)
        useSettingsStore.getState().setLastSeenVersion(APP_VERSION)
    }

    return (
        <Dialog open={open} onClose={close} title="What's new" width={560}>
            <div className="whats-new">
                {releases.map((release) => (
                    <section key={release.version} className="whats-new__release">
                        <h3 className="whats-new__version">
                            Version {release.version}
                            {release.date ? <span className="whats-new__date">{release.date}</span> : null}
                        </h3>
                        {release.notes.map((note) => (
                            <p key={note} className="dialog__hint">
                                {note}
                            </p>
                        ))}
                        {release.groups.map((group) => (
                            <div key={group.title ?? group.items[0]}>
                                {group.title ? <h4 className="whats-new__group">{group.title}</h4> : null}
                                <ul className="whats-new__list">
                                    {group.items.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </section>
                ))}
            </div>
            <div className="dialog__actions">
                <button type="button" className="button button--primary" autoFocus onClick={close}>
                    Got it
                </button>
            </div>
        </Dialog>
    )
}
