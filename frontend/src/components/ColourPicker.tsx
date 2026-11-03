import {ColorArea, ColorSlider, Popover} from '@heroui/react'
import {Copy, Plus} from 'lucide-react'
import {useEffect, useState, type ClipboardEvent} from 'react'
import {parseColor, type Color} from 'react-aria-components'
import {parseColourCode, parseColourList} from '../core/colour-code'
import {copyText} from '../platform/clipboard'
import {useSettingsStore} from '../store/settings-store'

const NOTE_MS = 1500

const hexOf = (colour: Color) => colour.toString('hex').toLowerCase()

/**
 * The swatch that opens a picker for any colour.
 *
 * The app's own, not the system's, so it looks the same everywhere and takes a pasted
 * colour code. Dragging only shows the colour here, and lets go of it as one change,
 * so a drag is one step of Undo.
 */
export function ColourPicker({label, value, onChange}: {label: string; value: string; onChange(value: string): void}) {
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState(() => parseColor(value).toFormat('hsb'))
    const [code, setCode] = useState(value)
    const [wrong, setWrong] = useState(false)
    const [note, setNote] = useState<string | null>(null)
    const recentColours = useSettingsStore((state) => state.recentColours)
    const myColours = useSettingsStore((state) => state.myColours)
    const noteColour = useSettingsStore((state) => state.noteColour)
    const setMyColours = useSettingsStore((state) => state.setMyColours)

    // Undo or another prop can change the colour under the picker. Reading the same
    // colour back would lose the hue of a grey, so only a different one is read.
    useEffect(() => {
        setDraft((current) => (hexOf(current) === value.toLowerCase() ? current : parseColor(value).toFormat('hsb')))
        setCode(value)
        setWrong(false)
    }, [value, open])

    useEffect(() => {
        if (!note) {
            return
        }

        const timer = window.setTimeout(() => setNote(null), NOTE_MS)

        return () => window.clearTimeout(timer)
    }, [note])

    const choose = (colour: string) => {
        setCode(colour)
        setWrong(false)
        noteColour(colour)

        if (colour !== value.toLowerCase()) {
            onChange(colour)
        }
    }

    const applyCode = () => {
        const colour = parseColourCode(code)

        if (colour) {
            setDraft(parseColor(colour).toFormat('hsb'))
            choose(colour)
        } else {
            setWrong(code.trim() !== '')
        }
    }

    const addToMine = (colours: readonly string[]) => {
        const added = colours.filter((colour) => !myColours.includes(colour))

        setMyColours([...myColours, ...added])
        setNote(added.length === 1 ? 'Added to My colours' : `Added ${added.length} to My colours`)
    }

    // A whole palette pasted at once goes into My colours, rather than into one row.
    const pasteList = (event: ClipboardEvent) => {
        const colours = parseColourList(event.clipboardData.getData('text'))

        if (colours.length > 1) {
            event.preventDefault()
            addToMine(colours)
        }
    }

    const swatches = (title: string, colours: readonly string[], mine: boolean) => (
        <div className="colour-panel__swatches" role="group" aria-label={title} onPaste={mine ? pasteList : undefined}>
            {colours.map((colour) => (
                <button
                    key={colour}
                    type="button"
                    className="colour"
                    style={{backgroundColor: colour}}
                    aria-label={mine ? `${colour}, right-click or Delete to remove` : colour}
                    aria-pressed={colour === value.toLowerCase()}
                    title={colour}
                    onClick={() => {
                        setDraft(parseColor(colour).toFormat('hsb'))
                        choose(colour)
                    }}
                    onContextMenu={
                        mine
                            ? (event) => {
                                  event.preventDefault()
                                  setMyColours(myColours.filter((entry) => entry !== colour))
                              }
                            : undefined
                    }
                    onKeyDown={
                        mine
                            ? (event) => {
                                  if (event.key === 'Delete' || event.key === 'Backspace') {
                                      setMyColours(myColours.filter((entry) => entry !== colour))
                                  }
                              }
                            : undefined
                    }
                />
            ))}
            {mine ? (
                <button
                    type="button"
                    className="colour colour--add"
                    aria-label="Add this colour to My colours"
                    title="Add this colour"
                    onClick={() => addToMine([value.toLowerCase()])}
                >
                    <Plus size={11} aria-hidden="true" />
                </button>
            ) : null}
        </div>
    )

    return (
        <Popover isOpen={open} onOpenChange={setOpen}>
            <Popover.Trigger>
                <button
                    type="button"
                    className="colour colour--custom"
                    style={{backgroundColor: value}}
                    aria-label={`${label}: pick any colour`}
                    title="Pick any colour"
                />
            </Popover.Trigger>
            <Popover.Content className="sun-panel colour-panel" placement="left top" offset={8}>
                <Popover.Dialog aria-label={label}>
                    <ColorArea
                        className="colour-panel__area"
                        aria-label={`${label}: shade`}
                        colorSpace="hsb"
                        xChannel="saturation"
                        yChannel="brightness"
                        value={draft}
                        onChange={(colour) => {
                            setDraft(colour)
                            setCode(hexOf(colour))
                        }}
                        onChangeEnd={(colour) => choose(hexOf(colour))}
                    >
                        <ColorArea.Thumb />
                    </ColorArea>
                    <ColorSlider
                        className="colour-panel__hue"
                        aria-label={`${label}: hue`}
                        channel="hue"
                        colorSpace="hsb"
                        value={draft}
                        onChange={(colour) => {
                            setDraft(colour)
                            setCode(hexOf(colour))
                        }}
                        onChangeEnd={(colour) => choose(hexOf(colour))}
                    >
                        <ColorSlider.Track>
                            <ColorSlider.Thumb />
                        </ColorSlider.Track>
                    </ColorSlider>
                    <div className="seed-panel__row">
                        <label className="seed-panel__label" htmlFor={`${label}-code`}>
                            Colour code
                        </label>
                        <input
                            id={`${label}-code`}
                            className="seed-panel__field tabular"
                            autoComplete="off"
                            spellCheck={false}
                            value={code}
                            aria-invalid={wrong}
                            onChange={(event) => {
                                setCode(event.target.value)
                                setWrong(false)
                            }}
                            onPaste={pasteList}
                            onBlur={applyCode}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault()
                                    applyCode()
                                }
                            }}
                        />
                        <button
                            type="button"
                            className="icon-button"
                            aria-label="Copy the colour code"
                            title="Copy"
                            onClick={() => void copyText(value.toLowerCase()).then((copied) => setNote(copied ? 'Copied' : "Couldn't copy"))}
                        >
                            <Copy size={13} aria-hidden="true" />
                        </button>
                    </div>
                    {recentColours.length > 0 ? (
                        <>
                            <span className="sun-panel__caption">Recent</span>
                            {swatches('Recent', recentColours, false)}
                        </>
                    ) : null}
                    <span className="sun-panel__caption">My colours</span>
                    {swatches('My colours', myColours, true)}
                    <p className="sun-panel__caption" role={wrong || note ? 'status' : undefined} data-error={wrong}>
                        {wrong ? 'Not a colour code. Try #4e7d3e.' : (note ?? 'Paste a list of codes to add them all.')}
                    </p>
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    )
}
