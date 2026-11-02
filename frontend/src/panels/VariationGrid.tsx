/**
 * Show me more: the prop as it is now, in the middle of eight others on new seeds.
 *
 * Picking is easier than describing, so this is where someone with no 3D words
 * finds the one they want. Building a tree blocks the page, so the pictures are
 * drawn one at a time with a paint between each, and closing stops the rest.
 */

import {Check} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import {getStyleProfile} from '../assets/style/style-profiles'
import {withSeed} from '../core/export/batch-items'
import {afterPaint} from '../core/export/pipeline/yield'
import {renderTreeThumbnail} from '../core/export/tree-thumbnail'
import {pageSeeds} from '../core/scene/variations'
import type {Scene} from '../core/scene/scene-model'
import {useEditorStore} from '../store/editor-store'
import {useUiStore} from '../store/ui-store'
import {Dialog} from '../components/controls'

const PICTURE_SIZE = 200
/** The grid reads left to right, top to bottom, with the prop as it is now in the middle. */
const NOW_AT = 4

function Grid({base, onClose}: {base: Scene; onClose(): void}) {
    const style = useEditorStore((state) => state.style)
    const setSeed = useEditorStore((state) => state.setSeed)
    const openBatchWith = useEditorStore((state) => state.openBatchWith)
    const treeName = useEditorStore((state) => state.treeName)
    const seed = base.assets[0]?.seed ?? 0

    const [page, setPage] = useState(0)
    const [pictures, setPictures] = useState<ReadonlyMap<number, string | null>>(new Map())
    const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set())

    const seeds = useMemo(() => {
        const others = [...pageSeeds(seed, page)]

        return [...others.slice(0, NOW_AT), seed, ...others.slice(NOW_AT)]
    }, [seed, page])

    useEffect(() => {
        let stopped = false

        const draw = async () => {
            for (const next of seeds) {
                await afterPaint()

                if (stopped) {
                    return
                }

                if (pictures.has(next)) {
                    continue
                }

                const scene = withSeed(base, () => next, style)
                const url = await renderTreeThumbnail(scene, {style: getStyleProfile(style), size: PICTURE_SIZE})

                if (stopped) {
                    return
                }

                setPictures((current) => new Map(current).set(next, url))
            }
        }

        void draw()

        return () => {
            stopped = true
        }
        // Drawn pictures are kept, so going back to a page costs nothing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seeds, base, style])

    const toggle = (next: number) => {
        const changed = new Set(ticked)

        if (!changed.delete(next)) {
            changed.add(next)
        }

        setTicked(changed)
    }

    // Only this page: ticks on other pages stay as they are.
    const allTicked = seeds.every((each) => ticked.has(each))
    const tickAll = () => {
        const changed = new Set(ticked)

        for (const each of seeds) {
            if (allTicked) {
                changed.delete(each)
            } else {
                changed.add(each)
            }
        }

        setTicked(changed)
    }

    const use = (next: number) => {
        setSeed(next)
        onClose()
    }

    const exportTicked = () => {
        openBatchWith({kind: 'seeds', name: treeName || 'prop', scene: base, seeds: [...ticked]})
        onClose()
    }

    const drawn = seeds.filter((each) => pictures.has(each)).length
    const drawing = drawn < seeds.length

    return (
        <>
            <p className="dialog__hint">Click one to use it, or tick several to export them all.</p>
            <div className="variation-frame">
                {/* Each tree blocks the page while it is built, so the grid waits under a progress
                    bar instead of stuttering. The bar moves by transform, which keeps going meanwhile. */}
                {drawing ? (
                    <div className="variation-loading">
                        <div className="viewport-loading__box" role="status">
                            <span>
                                Drawing versions of {treeName || 'your prop'}, {drawn} of {seeds.length}
                            </span>
                            <div className="viewport-loading__track" aria-hidden="true">
                                <div className="viewport-loading__bar" style={{transform: `scaleX(${(drawn + 1) / (seeds.length + 1)})`}} />
                            </div>
                        </div>
                    </div>
                ) : null}
                <ul className="variation-grid" aria-label="Versions of this prop" aria-busy={drawing} inert={drawing}>
                    {seeds.map((each) => {
                        const url = pictures.get(each)
                        const now = each === seed

                        return (
                            <li key={each} className="variation" data-now={now || undefined}>
                                <button
                                    type="button"
                                    className="variation__pick"
                                    onClick={() => use(each)}
                                    title={`Seed ${each}`}
                                    aria-label={now ? `Keep this one, seed ${each}` : `Use seed ${each}`}
                                >
                                    {url ? <img src={url} alt="" /> : null}
                                    {now ? <span className="variation__now">Now</span> : null}
                                </button>
                                <label className="variation__tick" title="Export this one">
                                    <input
                                        type="checkbox"
                                        checked={ticked.has(each)}
                                        onChange={() => toggle(each)}
                                        aria-label={`Export seed ${each}`}
                                    />
                                    {ticked.has(each) ? <Check size={12} aria-hidden="true" /> : null}
                                </label>
                            </li>
                        )
                    })}
                </ul>
            </div>
            <div className="dialog__actions">
                <button type="button" className="button" disabled={drawing} onClick={() => setPage(page + 1)}>
                    More
                </button>
                <button type="button" className="button" disabled={drawing} onClick={tickAll}>
                    {allTicked ? 'Untick all' : 'Tick all'}
                </button>
                <span className="dialog__hint dialog__hint--grow" />
                <button type="button" className="button" onClick={onClose}>
                    Close
                </button>
                <button type="button" className="button button--primary" disabled={ticked.size === 0} onClick={exportTicked}>
                    {ticked.size === 0 ? 'Export these' : `Export these ${ticked.size}`}
                </button>
            </div>
        </>
    )
}

export function VariationGrid() {
    const open = useUiStore((state) => state.variationsOpen)
    const setOpen = useUiStore((state) => state.setVariationsOpen)
    const scene = useEditorStore((state) => state.scene)
    // The grid shows the prop as it was when opened, so picking one doesn't reshuffle it.
    const [base, setBase] = useState<Scene | null>(null)

    useEffect(() => {
        setBase(open ? useEditorStore.getState().scene : null)
    }, [open])

    return (
        <Dialog open={open && scene.assets.length > 0} onClose={() => setOpen(false)} title="Show me more" width={560} closesOnOutsideClick={false}>
            {base ? <Grid key={base.assets[0]?.seed} base={base} onClose={() => setOpen(false)} /> : null}
        </Dialog>
    )
}
