import {useCallback, useEffect, useLayoutEffect, useState} from 'react'
import {hasSeenCoachMarks, rememberCoachMarks} from '../core/settings/coach-marks'

interface Step {
    /** The `data-coach` attribute of the element being pointed at. */
    readonly target: string
    readonly text: string
    /** Which side of the target the card sits on. */
    readonly side: 'right' | 'left' | 'below'
}

const STEPS: readonly Step[] = [
    {
        target: 'presets',
        text: 'Start from a tree you like, or build one from scratch.',
        side: 'right',
    },
    {
        target: 'inspector',
        text: 'Change how the tree looks. Every control updates it straight away.',
        side: 'left',
    },
    {
        target: 'export',
        text: 'When you are happy with it, export the tree for your game.',
        side: 'left',
    },
]

export function CoachMarks() {
    const [visible, setVisible] = useState(() => !hasSeenCoachMarks())
    const [rects, setRects] = useState<Readonly<Record<string, DOMRect>>>({})

    const dismiss = useCallback(() => {
        rememberCoachMarks()
        setVisible(false)
    }, [])

    useLayoutEffect(() => {
        if (!visible) {
            return
        }

        const measure = () => {
            const next: Record<string, DOMRect> = {}

            for (const step of STEPS) {
                const element = document.querySelector(`[data-coach="${step.target}"]`)
                if (element) {
                    next[step.target] = element.getBoundingClientRect()
                }
            }

            setRects(next)
        }

        measure()

        window.addEventListener('resize', measure)

        return () => window.removeEventListener('resize', measure)
    }, [visible])

    useEffect(() => {
        if (!visible) {
            return
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                dismiss()
            }
        }

        window.addEventListener('keydown', onKeyDown)

        return () => window.removeEventListener('keydown', onKeyDown)
    }, [visible, dismiss])

    if (!visible) {
        return null
    }

    return (
        <div className="coach" onClick={dismiss} role="presentation">
            {STEPS.map((step) => {
                const rect = rects[step.target]

                if (!rect) {
                    return null
                }

                const style: React.CSSProperties =
                    step.side === 'right'
                        ? {left: rect.right + 16, top: rect.top}
                        : step.side === 'left'
                          ? {right: window.innerWidth - rect.left + 16, top: rect.top}
                          : {left: rect.left, top: rect.bottom + 12}

                return (
                    <div key={step.target} className="coach__card" style={style}>
                        {step.text}
                    </div>
                )
            })}

            <button type="button" className="btn btn--primary coach__dismiss" onClick={dismiss}>
                Got it
            </button>
        </div>
    )
}
