/**
 * Show me more: the prop as it is now, in the middle of eight others on new seeds,
 * or, for a prop that can be damaged, eight broken versions of it.
 *
 * Picking is easier than describing, so this is where someone with no 3D words
 * finds the one they want. Building a tree blocks the page, so the pictures are
 * drawn one at a time with a paint between each, and closing stops the rest.
 */

import {Check} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import {getStyleProfile} from '../assets/style/style-profiles'
import {versionScene} from '../core/export/batch-items'
import {afterPaint} from '../core/export/pipeline/yield'
import {renderTreeThumbnail} from '../core/export/tree-thumbnail'
import {damageNames, damageSettings, pageDamages, pageSeeds, versionKey, type PropVersion} from '../core/scene/variations'
import type {Scene} from '../core/scene/scene-model'
import {useEditorStore} from '../store/editor-store'
import {useUiStore} from '../store/ui-store'
import {Dialog} from '../components/controls'

const PICTURE_SIZE = 200
/** The grid reads left to right, top to bottom, with the prop as it is now in the middle. */
const NOW_AT = 4

type Mode = 'seeds' | 'damaged'

function Grid({base, onClose}: {base: Scene; onClose(): void}) {
    const style = useEditorStore((state) => state.style)
    const setSeed = useEditorStore((state) => state.setSeed)
    const updateTreeParameters = useEditorStore((state) => state.updateTreeParameters)
    const openBatchWith = useEditorStore((state) => state.openBatchWith)
    const treeName = useEditorStore((state) => state.treeName)
    const asset = base.assets[0]
    const seed = asset?.seed ?? 0
    const settings = useMemo(() => (asset ? damageSettings(asset.generatorId, asset.parameters) : []), [asset])

    const [mode, setMode] = useState<Mode>('seeds')
    const [page, setPage] = useState(0)
    const [pictures, setPictures] = useState<ReadonlyMap<string, string | null>>(new Map())
    const [ticked, setTicked] = useState<ReadonlyMap<string, PropVersion>>(new Map())

    const versions = useMemo(() => {
        const others: readonly PropVersion[] = mode === 'damaged' ? pageDamages(seed, page, settings) : pageSeeds(seed, page).map((each) => ({seed: each}))

        return [...others.slice(0, NOW_AT), {seed}, ...others.slice(NOW_AT)]
    }, [seed, page, mode, settings])

    useEffect(() => {
        let stopped = false

        const draw = async () => {
            for (const version of versions) {
                await afterPaint()

                if (stopped) {
                    return
                }

                const key = versionKey(version)

                if (pictures.has(key)) {
                    continue
                }

                const scene = versionScene(base, version, style)
                const url = await renderTreeThumbnail(scene, {style: getStyleProfile(style), size: PICTURE_SIZE})

                if (stopped) {
                    return
                }

                setPictures((current) => new Map(current).set(key, url))
            }
        }

        void draw()

        return () => {
            stopped = true
        }
        // Drawn pictures are kept, so going back to a page costs nothing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [versions, base, style])

    const toggle = (version: PropVersion) => {
        const changed = new Map(ticked)

        if (!changed.delete(versionKey(version))) {
            changed.set(versionKey(version), version)
        }

        setTicked(changed)
    }

    // Only this page: ticks on other pages stay as they are.
    const allTicked = versions.every((each) => ticked.has(versionKey(each)))
    const tickAll = () => {
        const changed = new Map(ticked)

        for (const each of versions) {
            if (allTicked) {
                changed.delete(versionKey(each))
            } else {
                changed.set(versionKey(each), each)
            }
        }

        setTicked(changed)
    }

    const use = (version: PropVersion) => {
        if (version.damage) {
            updateTreeParameters(version.damage, 'damaged version')
        } else {
            setSeed(version.seed)
        }

        onClose()
    }

    const switchTo = (next: Mode) => {
        setMode(next)
        setPage(0)
    }

    const exportTicked = () => {
        openBatchWith({kind: 'versions', name: treeName || 'prop', scene: base, versions: [...ticked.values()]})
        onClose()
    }

    const drawn = versions.filter((each) => pictures.has(versionKey(each))).length
    const drawing = drawn < versions.length

    return (
        <>
            {settings.length > 0 ? (
                <div className="variation-modes" role="radiogroup" aria-label="Versions to show">
                    {(['seeds', 'damaged'] as const).map((each) => (
                        <button
                            key={each}
                            type="button"
                            role="radio"
                            className="chip"
                            aria-checked={mode === each}
                            aria-pressed={mode === each}
                            disabled={drawing}
                            onClick={() => switchTo(each)}
                            title={each === 'seeds' ? 'The same settings on new seeds' : 'This one, broken in different ways'}
                        >
                            {each === 'seeds' ? 'New seeds' : 'Damaged'}
                        </button>
                    ))}
                </div>
            ) : null}
            <p className="dialog__hint">Click one to use it, or tick several to export them all.</p>
            <div className="variation-frame">
                {/* Each tree blocks the page while it is built, so the grid waits under a progress
                    bar instead of stuttering. The bar moves by transform, which keeps going meanwhile. */}
                {drawing ? (
                    <div className="variation-loading">
                        <div className="viewport-loading__box" role="status">
                            <span>
                                Drawing versions of {treeName || 'your prop'}, {drawn} of {versions.length}
                            </span>
                            <div className="viewport-loading__track" aria-hidden="true">
                                <div className="viewport-loading__bar" style={{transform: `scaleX(${(drawn + 1) / (versions.length + 1)})`}} />
                            </div>
                        </div>
                    </div>
                ) : null}
                <ul className="variation-grid" aria-label="Versions of this prop" aria-busy={drawing} inert={drawing}>
                    {versions.map((each) => {
                        const key = versionKey(each)
                        const url = pictures.get(key)
                        const now = !each.damage && each.seed === seed
                        const named = each.damage ? damageNames(each, settings) || 'Undamaged' : `Seed ${each.seed}`

                        return (
                            <li key={key} className="variation" data-now={now || undefined}>
                                <button
                                    type="button"
                                    className="variation__pick"
                                    onClick={() => use(each)}
                                    title={named}
                                    aria-label={now ? `Keep this one, seed ${each.seed}` : each.damage ? `Use this damaged version: ${named}` : `Use seed ${each.seed}`}
                                >
                                    {url ? <img src={url} alt="" /> : null}
                                    {now ? <span className="variation__now">Now</span> : null}
                                </button>
                                <label className="variation__tick" title="Export this one">
                                    <input
                                        type="checkbox"
                                        checked={ticked.has(key)}
                                        onChange={() => toggle(each)}
                                        aria-label={each.damage ? `Export this damaged version: ${named}` : `Export seed ${each.seed}`}
                                    />
                                    {ticked.has(key) ? <Check size={12} aria-hidden="true" /> : null}
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
