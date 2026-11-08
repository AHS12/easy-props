/**
 * Save a picture: a PNG of the prop, as the view shows it now.
 *
 * Two choices only, how big and what's behind it, so it's one click for a store
 * page or a devlog.
 */

import {useState} from 'react'
import {Dialog, Select} from '../components/controls'
import {Row} from '../components/PropertyRow'
import {bytesOfDataUrl, folderOf, PICTURE_SIZES, pictureFileName} from '../core/export/picture'
import {afterPaint} from '../core/export/pipeline/yield'
import {savePictureFile} from '../platform/desktop'
import {useEditorStore} from '../store/editor-store'
import {useUiStore} from '../store/ui-store'
import {viewportHandle} from '../viewport/viewport-bridge'

type Behind = 'nothing' | 'view'

const BEHIND_LABELS: Readonly<Record<Behind, string>> = {
    nothing: 'Nothing, see-through',
    view: 'The view’s background',
}

// Kept while the app is open, so a second picture is one click.
let lastSize = String(PICTURE_SIZES[1])
let lastBehind: Behind = 'nothing'

export function PictureDialog() {
    const open = useUiStore((state) => state.pictureOpen)
    const setOpen = useUiStore((state) => state.setPictureOpen)
    const [size, setSize] = useState(lastSize)
    const [behind, setBehind] = useState<Behind>(lastBehind)
    const [busy, setBusy] = useState(false)

    const close = () => {
        if (!busy) {
            setOpen(false)
        }
    }

    const save = async () => {
        const {treeName, notify} = useEditorStore.getState()

        lastSize = size
        lastBehind = behind
        setBusy(true)

        try {
            // A large picture takes a moment, so the button says so first.
            await afterPaint()

            const picture = viewportHandle()?.picture({size: Number(size), seeThrough: behind === 'nothing'})

            if (!picture) {
                notify('The picture couldn’t be drawn. Try the smaller size.')
                return
            }

            const path = await savePictureFile(bytesOfDataUrl(picture), pictureFileName(treeName))

            if (path) {
                setOpen(false)
                notify(`Saved ${pictureFileName(treeName)}`, folderOf(path))
            }
        } catch {
            notify('The picture couldn’t be saved. Check the folder can be written to.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog open={open} onClose={close} title="Save a picture" width={440}>
            <form
                className="dialog__form"
                onSubmit={(event) => {
                    event.preventDefault()
                    void save()
                }}
            >
                <div className="form-rows">
                    <Row label="Size" help="The longer side. The picture has the same shape as the view.">
                        <Select
                            label="Size"
                            value={size}
                            onChange={setSize}
                            options={PICTURE_SIZES.map((pixels) => ({value: String(pixels), label: `${pixels.toLocaleString()} pixels`}))}
                        />
                    </Row>
                    <Row label="Behind the prop" help="See-through suits a store page or a sprite. The background keeps the sky, ground and demo scene.">
                        <Select
                            label="Behind the prop"
                            value={behind}
                            onChange={(next) => setBehind(next as Behind)}
                            options={(Object.keys(BEHIND_LABELS) as Behind[]).map((value) => ({value, label: BEHIND_LABELS[value]}))}
                        />
                    </Row>
                </div>

                <p className="dialog__hint">It’s taken from where the camera is now, in the look you’re viewing.</p>

                <div className="dialog__actions">
                    <button type="button" className="button" onClick={close} disabled={busy}>
                        Cancel
                    </button>
                    <button type="submit" className="button button--primary" disabled={busy}>
                        {busy ? 'Drawing…' : 'Save…'}
                    </button>
                </div>
            </form>
        </Dialog>
    )
}
