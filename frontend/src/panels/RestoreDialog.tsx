/**
 * What's in a backup, before anything comes in.
 *
 * Props new to this computer are ticked. One that differs from the prop saved
 * here is ticked too, and comes in as a second copy, never over yours. One that
 * is already here, byte for byte, is shown greyed and skipped.
 */

import {Check} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import {Dialog} from '../components/controls'
import {FROM_BACKUP} from '../core/library/restore-plan'
import {displayName, FAMILY_ICONS, savedLabel} from '../pages/prop-labels'
import {useBackupStore, type HeldPropView} from '../store/backup-store'

const GROUPS = [
    {status: 'new', title: 'New to this computer', hint: null},
    {status: 'different', title: 'Different from the one here', hint: `Comes in as a second copy, “… ${FROM_BACKUP}”. Yours stays as it is.`},
] as const

const madeLabel = (iso: string): string => {
    const date = new Date(iso)

    return Number.isNaN(date.getTime())
        ? ''
        : new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'}).format(date)
}

function HeldTile({prop, ticked, onToggle}: {prop: HeldPropView; ticked: boolean; onToggle(): void}) {
    const Icon = FAMILY_ICONS[prop.kind ?? 'tree']
    const name = displayName(prop)

    return (
        <li className="prop-tile" data-ticked={ticked}>
            <button type="button" className="prop-tile__open" role="checkbox" aria-checked={ticked} aria-label={name} onClick={onToggle}>
                <span className="prop-tile__thumb">
                    {prop.picture ? <img src={prop.picture} alt="" draggable={false} loading="lazy" /> : <Icon size={30} aria-hidden="true" />}
                </span>
                <span className="prop-tile__name">{name}</span>
                <span className="prop-tile__meta">Saved {savedLabel(prop.savedAt)}</span>
            </button>
            <span className="prop-tile__tick restore__tick" aria-hidden="true">
                {ticked ? <Check size={12} /> : null}
            </span>
        </li>
    )
}

export function RestoreDialog() {
    const restoring = useBackupStore((state) => state.restoring)
    const phase = useBackupStore((state) => state.phase)
    const progress = useBackupStore((state) => state.progress)
    const restore = useBackupStore((state) => state.restore)
    const cancelRestore = useBackupStore((state) => state.cancelRestore)
    const stop = useBackupStore((state) => state.stop)
    const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())

    const props = useMemo(() => restoring?.props ?? [], [restoring])

    // A fresh backup starts with everything worth bringing in ticked.
    useEffect(() => {
        setTicked(new Set(props.filter((prop) => prop.status !== 'same').map((prop) => prop.id)))
    }, [props])

    const toggle = (id: string) => {
        const next = new Set(ticked)

        if (!next.delete(id)) {
            next.add(id)
        }

        setTicked(next)
    }

    const same = props.filter((prop) => prop.status === 'same').length
    const chosen = props.filter((prop) => prop.status !== 'same' && ticked.has(prop.id)).length
    const busy = phase === 'restoring'
    const nothingNew = props.length === same
    const hasPalettes = !['', '[]'].includes((restoring?.backup.palettes ?? '').replace(/\s/g, ''))

    return (
        <Dialog
            open={restoring !== null}
            onClose={() => (busy ? undefined : void cancelRestore())}
            title="Restore from a backup"
            width={760}
            closesOnOutsideClick={false}
        >
            <div className="dialog__form restore">
                <p className="dialog__hint">
                    {restoring?.backup.madeAt ? `Made ${madeLabel(restoring.backup.madeAt)}` : 'A backup'}
                    {restoring?.backup.app ? ` with easy-props ${restoring.backup.app}` : ''}. Nothing here replaces a prop you have.
                </p>

                <div className="restore__groups">
                    {GROUPS.map(({status, title, hint}) => {
                        const inGroup = props.filter((prop) => prop.status === status)

                        return inGroup.length === 0 ? null : (
                            <section key={status} aria-label={title}>
                                <h3 className="settings__group">
                                    {title} ({inGroup.length})
                                </h3>
                                {hint ? <p className="dialog__hint">{hint}</p> : null}
                                <ul className="tile-grid restore__grid">
                                    {inGroup.map((prop) => (
                                        <HeldTile key={prop.id} prop={prop} ticked={ticked.has(prop.id)} onToggle={() => toggle(prop.id)} />
                                    ))}
                                </ul>
                            </section>
                        )
                    })}

                    {same > 0 ? (
                        <p className="dialog__hint">
                            {same === 1 ? '1 prop is' : `${same} props are`} already here, exactly as in the backup, so {same === 1 ? 'it' : 'they'} will be left alone.
                        </p>
                    ) : null}
                    {props.length === 0 ? <p className="dialog__hint">This backup has no props in it.</p> : null}
                </div>

                {busy ? (
                    <progress
                        className="dialog__progress"
                        max={progress?.total ?? 1}
                        value={progress?.done ?? 0}
                        aria-label="Props restored"
                    />
                ) : null}

                <div className="dialog__actions">
                    {busy ? (
                        <button type="button" className="button" onClick={stop}>
                            Stop
                        </button>
                    ) : (
                        <button type="button" className="button" onClick={() => void cancelRestore()}>
                            Cancel
                        </button>
                    )}
                    {nothingNew && !hasPalettes ? null : (
                        <button
                            type="button"
                            className="button button--primary"
                            disabled={busy || (chosen === 0 && !nothingNew)}
                            onClick={() => void restore(ticked)}
                        >
                            {nothingNew ? 'Bring in the palettes' : chosen === 1 ? 'Restore 1 prop' : `Restore ${chosen} props`}
                        </button>
                    )}
                </div>
            </div>
        </Dialog>
    )
}
