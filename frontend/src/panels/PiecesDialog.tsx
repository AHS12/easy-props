/**
 * Make pieces from this tree: its stump, a log, a fallen branch and its leaves on
 * the ground, each saved to Your props as a prop of its own.
 */

import {useEffect, useState} from 'react'
import type {PieceKind} from '../assets/trees/pieces/tree-pieces'
import {Dialog} from '../components/controls'
import {afterPaint} from '../core/export/pipeline/yield'
import {PIECE_KINDS, PIECE_LABELS, piecesOffered} from '../core/scene/tree-pieces'
import {useEditorStore} from '../store/editor-store'
import {useUiStore} from '../store/ui-store'

export function PiecesDialog() {
    const open = useUiStore((state) => state.piecesOpen)
    const setOpen = useUiStore((state) => state.setPiecesOpen)
    const scene = useEditorStore((state) => state.scene)
    const treeName = useEditorStore((state) => state.treeName)
    const [chosen, setChosen] = useState<readonly PieceKind[]>(PIECE_KINDS)
    const [busy, setBusy] = useState(false)
    // What was saved, once it has been: the dialog then says so, and where to find them.
    const [saved, setSaved] = useState<readonly {id: string; name: string}[] | null>(null)
    const offered = open ? piecesOffered(scene) : []
    const picked = chosen.filter((kind) => offered.includes(kind))

    useEffect(() => {
        if (open) {
            setChosen(PIECE_KINDS)
            setSaved(null)
        }
    }, [open])

    const close = () => {
        if (!busy) {
            setOpen(false)
        }
    }

    const make = async () => {
        setBusy(true)

        try {
            // Each piece takes a moment to build and draw, so the button says so first.
            await afterPaint()

            const made = await useEditorStore.getState().makeTreePieces(picked)

            // Nothing saved means it couldn't save, and the app has already said why.
            if (made.length > 0) {
                setSaved(made)
            } else {
                setOpen(false)
            }
        } finally {
            setBusy(false)
        }
    }

    const showThem = () => {
        const editor = useEditorStore.getState()

        setOpen(false)
        editor.showProps(false)
        editor.pickProp(saved?.[0]?.id ?? null)
    }

    if (saved) {
        return (
            <Dialog open={open} onClose={close} title={saved.length === 1 ? 'Piece saved' : `${saved.length} pieces saved`}>
                <p className="dialog__hint">
                    {saved.length === 1 ? 'It is' : 'They are'} in Your props, each a prop of its own. Open one there to shape it,
                    export it, or try Show me more.
                </p>
                <ul className="pieces-saved">
                    {saved.map((piece) => (
                        <li key={piece.id}>{piece.name}</li>
                    ))}
                </ul>
                <div className="dialog__actions">
                    <button type="button" className="button" onClick={close}>
                        Stay with this tree
                    </button>
                    <button type="button" className="button button--primary" autoFocus onClick={showThem}>
                        Go to Your props
                    </button>
                </div>
            </Dialog>
        )
    }

    return (
        <Dialog open={open} onClose={close} title="Make pieces from this tree">
            <p className="dialog__hint">
                Each piece is saved to Your props as a prop of its own, with this tree's bark and colours. They don't change
                when the tree does, so make them again after changing it.
            </p>
            <fieldset className="pieces-list">
                <legend>Pieces of {treeName}</legend>
                {PIECE_KINDS.map((kind) => {
                    const available = offered.includes(kind)

                    return (
                        <label key={kind} className="pieces-list__item" aria-disabled={!available}>
                            <input
                                type="checkbox"
                                disabled={!available || busy}
                                checked={available && chosen.includes(kind)}
                                onChange={(event) =>
                                    setChosen((now) => (event.target.checked ? [...now, kind] : now.filter((other) => other !== kind)))
                                }
                            />
                            <span className="pieces-list__text">
                                <span>{PIECE_LABELS[kind].name}</span>
                                <span className="pieces-list__help">{available ? PIECE_LABELS[kind].help : 'This tree has no big branches to drop'}</span>
                            </span>
                        </label>
                    )
                })}
            </fieldset>
            <div className="dialog__actions">
                <button type="button" className="button" onClick={close} disabled={busy}>
                    Cancel
                </button>
                <button type="button" className="button button--primary" onClick={() => void make()} disabled={busy || picked.length === 0}>
                    {busy ? 'Making pieces…' : picked.length === 1 ? 'Make 1 piece' : `Make ${picked.length} pieces`}
                </button>
            </div>
        </Dialog>
    )
}
