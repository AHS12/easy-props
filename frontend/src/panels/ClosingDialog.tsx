/**
 * A backup finishing before the window closes.
 *
 * Shown only while one is actually running, which is seldom: the backup a
 * minute after the last save has usually already been made. Closing never waits
 * more than ten seconds, and Close now doesn't wait at all; what's left is
 * backed up at the next start.
 */

import {Dialog} from '../components/controls'
import {confirmClose} from '../platform/close-guard'
import {useBackupStore} from '../store/backup-store'

export function ClosingDialog() {
    const phase = useBackupStore((state) => state.phase)
    const progress = useBackupStore((state) => state.progress)
    const stop = useBackupStore((state) => state.stop)

    return (
        <Dialog open={phase === 'backing-up'} onClose={() => undefined} dismissable={false} title="Backing up before closing">
            <p className="dialog__hint">This takes a moment. Anything left over is backed up next time you start.</p>
            <progress className="dialog__progress" max={progress?.total ?? 1} value={progress?.done ?? 0} aria-label="Files backed up" />
            <div className="dialog__actions">
                <button
                    type="button"
                    className="button"
                    onClick={() => {
                        stop()
                        void confirmClose()
                    }}
                >
                    Close now
                </button>
            </div>
        </Dialog>
    )
}
