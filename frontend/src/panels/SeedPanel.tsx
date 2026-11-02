/**
 * The seed, in the status bar. It opens a small panel to type, paste or copy one, so
 * a prop you liked is easy to get back.
 */

import {Popover} from '@heroui/react'
import {Dices} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'
import {NOT_A_SEED, parseSeed} from '../core/scene/seed-text'
import {copyText} from '../platform/clipboard'
import {useEditorStore} from '../store/editor-store'
import {useUiStore} from '../store/ui-store'

const COPIED_MS = 1500

export function SeedPanel({seed}: {seed: number}) {
    const open = useUiStore((state) => state.seedPanelOpen)
    const setOpen = useUiStore((state) => state.setSeedPanelOpen)
    const setSeed = useEditorStore((state) => state.setSeed)
    const randomizeTree = useEditorStore((state) => state.randomizeTree)
    const [draft, setDraft] = useState(String(seed))
    const [message, setMessage] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const field = useRef<HTMLInputElement>(null)

    // Undo, Surprise me or another prop can change the seed under the field.
    useEffect(() => {
        setDraft(String(seed))
        setMessage(null)
    }, [seed, open])

    // Ready to type or paste over, however the panel was opened.
    useEffect(() => {
        if (!open) {
            return
        }

        const frame = window.requestAnimationFrame(() => field.current?.select())

        return () => window.cancelAnimationFrame(frame)
    }, [open])

    useEffect(() => {
        if (!copied) {
            return
        }

        const timer = window.setTimeout(() => setCopied(false), COPIED_MS)

        return () => window.clearTimeout(timer)
    }, [copied])

    const apply = () => {
        // Read the field itself: after Esc, the state hasn't caught up when the blur arrives.
        const next = parseSeed(field.current?.value ?? draft)

        if (next === null) {
            setMessage(NOT_A_SEED)
            return
        }

        setMessage(null)
        setDraft(String(next))
        setSeed(next)
    }

    const copy = async () => {
        if (await copyText(String(seed))) {
            setCopied(true)
            setMessage(null)
            return
        }

        setDraft(String(seed))
        setMessage("Couldn't copy it. The number is selected, so you can copy it yourself.")
        window.requestAnimationFrame(() => field.current?.select())
    }

    return (
        <Popover isOpen={open} onOpenChange={setOpen}>
            <Popover.Trigger>
                <button type="button" className="statusbar__seed tabular" title="Type, paste or copy the seed">
                    Seed {seed}
                </button>
            </Popover.Trigger>
            <Popover.Content className="sun-panel seed-panel" placement="top end" offset={6}>
                <Popover.Dialog aria-label="Seed">
                    <div className="seed-panel__row">
                        <label className="seed-panel__label" htmlFor="seed-field">
                            Seed
                        </label>
                        <input
                            id="seed-field"
                            ref={field}
                            className="seed-panel__field tabular"
                            inputMode="numeric"
                            autoComplete="off"
                            spellCheck={false}
                            value={draft}
                            aria-invalid={message === NOT_A_SEED}
                            aria-describedby="seed-message"
                            onChange={(event) => setDraft(event.target.value)}
                            onBlur={apply}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault()
                                    apply()
                                } else if (event.key === 'Escape') {
                                    // Put the old value back before the panel closes, so leaving
                                    // the field doesn't apply what was typed.
                                    setDraft(String(seed))
                                    setMessage(null)
                                    event.currentTarget.value = String(seed)
                                }
                            }}
                        />
                        <button type="button" className="button" onClick={() => void copy()}>
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                    <button type="button" className="icon-text-button seed-panel__surprise" onClick={randomizeTree}>
                        <Dices size={13} aria-hidden="true" />
                        Surprise me
                    </button>
                    <p id="seed-message" className="sun-panel__caption" role={message ? 'alert' : undefined} data-error={message === NOT_A_SEED}>
                        {message ?? 'Same settings and seed give the same prop.'}
                    </p>
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    )
}
