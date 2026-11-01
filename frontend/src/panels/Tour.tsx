/**
 * The tours: short steps, each pointing at the real thing.
 *
 * Each page has its own. A tour shows once by itself, the first time its page opens,
 * and the current page's can be replayed from Help. Every step can be skipped, and
 * nothing behind it is lost.
 *
 * Its position is measured every frame while it is open. A panel opening, a page
 * scrolling, the window resizing and the interface scale changing all move what it
 * points at, and none of them need to know about it.
 */

import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react'
import {useEditorStore} from '../store/editor-store'
import {useSettingsStore} from '../store/settings-store'
import {useUiStore} from '../store/ui-store'
import {availableSteps, placeCard, TOUR_NAMES, TOUR_STEPS, unzoomed, type Box, type TourPage} from './tour-steps'

const CARD_WIDTH = 330
const SPOTLIGHT_PADDING = 4

const pageZoom = () => Number(getComputedStyle(document.documentElement).zoom) || 1
const targetElement = (target: string) => document.querySelector(`[data-coach="${target}"]`)

const sameBox = (a: Box | null, b: Box | null) =>
    a === b || (a !== null && b !== null && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height)

function TourRun({page, onDone}: {page: TourPage; onDone(): void}) {
    const setLeftTab = useUiStore((state) => state.setLeftTab)
    const [index, setIndex] = useState(0)
    const [rect, setRect] = useState<Box | null>(null)
    const [screen, setScreen] = useState({width: window.innerWidth, height: window.innerHeight})
    const [cardHeight, setCardHeight] = useState(0)
    const card = useRef<HTMLDivElement>(null)
    const primary = useRef<HTMLButtonElement>(null)
    // Worked out for the whole tour at each step: what has appeared since, like saved props, can still be shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const steps = useMemo(() => availableSteps(TOUR_STEPS[page], (target) => targetElement(target) !== null), [page, index])
    const step = steps[Math.min(index, steps.length - 1)]
    const last = index >= steps.length - 1

    // The editor's tour points at its panels, so they have to be there. They go
    // back as they were afterwards.
    useEffect(() => {
        if (page !== 'editor') {
            return
        }

        const {leftOpen, rightOpen} = useSettingsStore.getState().layout

        setLeftTab('presets')
        useUiStore.setState({panelsHidden: false, maximized: false})
        useSettingsStore.getState().setLayout({leftOpen: true, rightOpen: true})

        return () => useSettingsStore.getState().setLayout({leftOpen, rightOpen})
    }, [page, setLeftTab])

    useEffect(() => {
        if (step.target) {
            targetElement(step.target)?.scrollIntoView?.({block: 'center', inline: 'nearest'})
        }

        primary.current?.focus()
    }, [step])

    useLayoutEffect(() => {
        let frame = 0

        const measure = () => {
            const zoom = pageZoom()
            const element = step.target ? targetElement(step.target) : null
            const measured = element?.getBoundingClientRect()
            const next = measured && measured.width > 0 && measured.height > 0 ? unzoomed(measured, zoom) : null

            setRect((current) => (sameBox(current, next) ? current : next))
            setScreen((current) => {
                const width = window.innerWidth / zoom
                const height = window.innerHeight / zoom

                return current.width === width && current.height === height ? current : {width, height}
            })

            if (card.current) {
                setCardHeight(card.current.offsetHeight)
            }

            frame = requestAnimationFrame(measure)
        }

        measure()

        return () => cancelAnimationFrame(frame)
    }, [step])

    const forward = () => (last ? onDone() : setIndex(index + 1))
    const back = () => setIndex(Math.max(0, index - 1))

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation()
                onDone()
            } else if (event.key === 'ArrowRight') {
                event.stopPropagation()
                forward()
            } else if (event.key === 'ArrowLeft') {
                event.stopPropagation()
                back()
            }
        }

        window.addEventListener('keydown', onKeyDown, true)

        return () => window.removeEventListener('keydown', onKeyDown, true)
    })

    const width = Math.min(CARD_WIDTH, screen.width - 24)
    const place = placeCard(step.side, rect, screen, {width, height: cardHeight})

    return (
        <div className="tour" role="dialog" aria-modal="true" aria-label={TOUR_NAMES[page]} data-dim={rect === null}>
            {rect ? (
                <div
                    className="tour__spotlight"
                    data-large={step.side === 'over'}
                    style={{
                        left: rect.left - SPOTLIGHT_PADDING,
                        top: rect.top - SPOTLIGHT_PADDING,
                        width: rect.width + SPOTLIGHT_PADDING * 2,
                        height: rect.height + SPOTLIGHT_PADDING * 2,
                    }}
                    aria-hidden="true"
                />
            ) : null}
            <div
                ref={card}
                className="tour__card"
                data-side={place.side}
                style={{left: place.left, top: place.top, width, ['--tour-arrow' as string]: `${place.arrow}px`}}
            >
                <div className="tour__count">
                    <span>{TOUR_NAMES[page]}</span>
                    <span className="tabular">
                        Step {index + 1} of {steps.length}
                    </span>
                </div>
                <div className="tour__progress" aria-hidden="true">
                    {steps.map((other, position) => (
                        <span key={other.title} className="tour__dot" data-done={position <= index} />
                    ))}
                </div>
                <h2 className="tour__title">{step.title}</h2>
                <p className="tour__text">{step.text}</p>
                {step.tryIt ? <p className="tour__try">{step.tryIt}</p> : null}
                <div className="tour__actions">
                    {last ? null : (
                        <button type="button" className="text-button" onClick={onDone}>
                            Skip tour
                        </button>
                    )}
                    <span className="tour__spacer" />
                    {index > 0 ? (
                        <button type="button" className="button" onClick={back}>
                            Back
                        </button>
                    ) : null}
                    <button ref={primary} type="button" className="button button--primary" onClick={forward}>
                        {last ? (page === 'gallery' ? 'Pick a prop' : 'Start making') : 'Next'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export function Tour() {
    const open = useUiStore((state) => state.tourOpen)
    const setOpen = useUiStore((state) => state.setTourOpen)
    const page = useEditorStore((state) => state.page)
    const loaded = useSettingsStore((state) => state.loaded)
    const seen = useSettingsStore((state) => (page === 'editor' ? state.tourSeen : state.galleryTourSeen))
    const shownFor = useRef(page)

    // Moving to the other page ends a tour, so it never stands there pointing at
    // what has gone. That page's own tour follows if it has not been seen.
    useEffect(() => {
        if (shownFor.current !== page) {
            shownFor.current = page
            setOpen(false)
        }
    }, [page, setOpen])

    useEffect(() => {
        // Not before the settings are read, or everyone would get it at every start.
        if (loaded && !seen) {
            setOpen(true)
        }
    }, [loaded, seen, page, setOpen])

    const finish = () => {
        // First, so nothing that goes wrong after it can leave someone stuck behind the tour.
        setOpen(false)

        const settings = useSettingsStore.getState()

        if (page === 'editor') {
            settings.setTourSeen(true)
        } else {
            settings.setGalleryTourSeen(true)
        }
    }

    // Keyed by page, so a tour always starts from its own first step.
    return open ? <TourRun key={page} page={page} onDone={finish} /> : null
}
