/**
 * The tour: four short steps, each pointing at the real thing.
 *
 * It shows once by itself, the first time the editor opens, and can be replayed from
 * Help. Every step can be skipped, and nothing behind it is lost.
 */

import {useEffect, useLayoutEffect, useState} from 'react'
import {useEditorStore} from '../store/editor-store'
import {useSettingsStore} from '../store/settings-store'
import {useUiStore} from '../store/ui-store'

interface Step {
    /** The `data-coach` attribute of the element being pointed at. */
    readonly target: string
    readonly title: string
    readonly text: string
    readonly side: 'right' | 'left' | 'below' | 'center'
}

const STEPS: readonly Step[] = [
    {
        target: 'presets',
        title: 'Pick a starting point',
        text: 'Every prop starts from a preset. Click one to try it. You can always press Ctrl+Z.',
        side: 'right',
    },
    {
        target: 'details',
        title: 'Make it yours',
        text: 'These controls change the prop straight away. Rest on a name to learn what it does, click a number to type one, or use the arrow to reset it.',
        side: 'left',
    },
    {
        target: 'viewport',
        title: 'Look around and pick parts',
        text: 'Drag to orbit and scroll to zoom. Click a branch or a clump to change just that part. The bar along the bottom always says what you can do next.',
        side: 'center',
    },
    {
        target: 'export',
        title: 'Take it to your game',
        text: 'Export gets it ready for Unreal, Godot, Unity or Blender. Press Ctrl+K any time to find anything.',
        side: 'below',
    },
]

const CARD_WIDTH = 300
const GAP = 12

function placement(step: Step, rect: DOMRect | null): React.CSSProperties {
    if (!rect || step.side === 'center') {
        return rect
            ? {left: rect.left + rect.width / 2 - CARD_WIDTH / 2, top: rect.top + rect.height / 2 - 80}
            : {left: `calc(50% - ${CARD_WIDTH / 2}px)`, top: '40%'}
    }

    if (step.side === 'right') {
        return {left: rect.right + GAP, top: rect.top + 12}
    }

    if (step.side === 'left') {
        return {left: rect.left - GAP - CARD_WIDTH, top: rect.top + 12}
    }

    return {left: Math.max(GAP, rect.right - CARD_WIDTH), top: rect.bottom + GAP}
}

export function Tour() {
    const open = useUiStore((state) => state.tourOpen)
    const setOpen = useUiStore((state) => state.setTourOpen)
    const setLeftTab = useUiStore((state) => state.setLeftTab)
    const tourSeen = useSettingsStore((state) => state.tourSeen)
    const setTourSeen = useSettingsStore((state) => state.setTourSeen)
    const page = useEditorStore((state) => state.page)
    const [index, setIndex] = useState(0)
    const [rect, setRect] = useState<DOMRect | null>(null)
    const step = STEPS[index]

    useEffect(() => {
        if (!tourSeen && page === 'editor') {
            setOpen(true)
        }
    }, [tourSeen, page, setOpen])

    useEffect(() => {
        if (open) {
            setIndex(0)
            setLeftTab('presets')
            useUiStore.setState({panelsHidden: false, maximized: false})
        }
    }, [open, setLeftTab])

    useLayoutEffect(() => {
        if (!open) {
            return
        }

        const measure = () => {
            const element = document.querySelector(`[data-coach="${step.target}"]`)

            setRect(element ? element.getBoundingClientRect() : null)
        }

        measure()
        window.addEventListener('resize', measure)

        return () => window.removeEventListener('resize', measure)
    }, [open, step])

    const finish = () => {
        setTourSeen(true)
        setOpen(false)
    }

    useEffect(() => {
        if (!open) {
            return
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation()
                finish()
            }
        }

        window.addEventListener('keydown', onKeyDown, true)

        return () => window.removeEventListener('keydown', onKeyDown, true)
    })

    if (!open || page !== 'editor') {
        return null
    }

    return (
        <div className="tour" role="dialog" aria-modal="true" aria-label="Tour">
            {rect ? (
                <div
                    className="tour__spotlight"
                    style={{left: rect.left, top: rect.top, width: rect.width, height: rect.height}}
                    aria-hidden="true"
                />
            ) : null}
            <div className="tour__card" style={{...placement(step, rect), width: CARD_WIDTH}}>
                <div className="tour__count tabular">
                    {index + 1} of {STEPS.length}
                </div>
                <h2 className="tour__title">{step.title}</h2>
                <p className="tour__text">{step.text}</p>
                <div className="tour__actions">
                    <button type="button" className="text-button" onClick={finish}>
                        Skip
                    </button>
                    <span className="tour__spacer" />
                    {index > 0 ? (
                        <button type="button" className="button" onClick={() => setIndex(index - 1)}>
                            Back
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className="button button--primary"
                        autoFocus
                        onClick={() => (index === STEPS.length - 1 ? finish() : setIndex(index + 1))}
                    >
                        {index === STEPS.length - 1 ? 'Start making' : 'Next'}
                    </button>
                </div>
            </div>
        </div>
    )
}
