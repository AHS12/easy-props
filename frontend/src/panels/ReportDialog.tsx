/**
 * Report a problem: the GitHub issue form's questions, asked here, with what the
 * app already knows filled in.
 *
 * Nothing is sent from the app. Open GitHub opens the form in the browser with
 * every answer in place, and the person sends it from there.
 */

import {useEffect, useRef, useState} from 'react'
import {Dialog, Select} from '../components/controls'
import {issueLink, reportText, type Report} from '../core/feedback/issue-link'
import {guessAction, propLine} from '../core/feedback/report-context'
import {formOf, REPORT_FORMS, type ReportField, type ReportKind} from '../core/feedback/report-forms'
import {APP_VERSION} from '../core/export/export-preferences'
import {copyText} from '../platform/clipboard'
import {systemName} from '../platform/system'
import {openLink} from '../platform/window'
import {isHomePage, useEditorStore} from '../store/editor-store'
import {useUiStore, type ReportDraft} from '../store/ui-store'

/** A dropdown nobody has answered yet. Never sent. */
const UNANSWERED = '__unanswered'

const TITLE_LABEL = 'In a few words'

function freshDraft(kind: ReportKind): ReportDraft {
    const editor = useEditorStore.getState()
    const fields: Record<string, string> =
        kind === 'bug'
            ? {
                  action: guessAction({
                      onHome: isHomePage(editor.page),
                      exporting: editor.exportOpen,
                      exportingMany: editor.batchOpen,
                      partSelected: editor.selection.selectedId !== null,
                  }),
                  frequency: 'Every time',
                  engine: 'Not about an engine',
              }
            : {}

    return {kind, title: '', fields, includeProp: true}
}

/** Answers the app fills in: version, system, and the open prop. */
function useFilledIn(): {version: string; system: string | null; prop: string | null} {
    const [system, setSystem] = useState<string | null>(null)
    const prop = useEditorStore((state) => (isHomePage(state.page) ? null : propLine(state.scene, state.presetId, state.shadingMode)))

    useEffect(() => {
        void systemName().then(setSystem)
    }, [])

    return {version: APP_VERSION, system, prop}
}

function FieldInput({field, value, onChange, invalid}: {field: ReportField; value: string; onChange(value: string): void; invalid: boolean}) {
    const id = `report-${field.id}`

    if (field.type === 'dropdown') {
        return (
            <Select
                label={field.label}
                value={value || UNANSWERED}
                onChange={(next) => onChange(next === UNANSWERED ? '' : next)}
                options={[...(value ? [] : [{value: UNANSWERED, label: 'Choose one'}]), ...(field.options ?? []).map((option) => ({value: option, label: option}))]}
            />
        )
    }

    if (field.type === 'textarea') {
        return (
            <textarea
                id={id}
                className="field field--area"
                rows={4}
                value={value}
                placeholder={field.placeholder}
                aria-invalid={invalid || undefined}
                aria-describedby={field.description ? `${id}-help` : undefined}
                onChange={(event) => onChange(event.target.value)}
            />
        )
    }

    return (
        <input
            id={id}
            className="field"
            value={value}
            placeholder={field.placeholder}
            aria-invalid={invalid || undefined}
            onChange={(event) => onChange(event.target.value)}
        />
    )
}

export function ReportDialog() {
    const open = useUiStore((state) => state.reportOpen)
    const setOpen = useUiStore((state) => state.setReportOpen)
    const stored = useUiStore((state) => state.reportDraft)
    const setStored = useUiStore((state) => state.setReportDraft)
    const notify = useEditorStore((state) => state.notify)
    const filledIn = useFilledIn()
    const [draft, setDraft] = useState<ReportDraft>(() => stored ?? freshDraft('bug'))
    const [missing, setMissing] = useState<string | null>(null)
    const body = useRef<HTMLFormElement>(null)

    // Each opening starts from what was left, or fresh with the guesses for where the person is now.
    useEffect(() => {
        if (open) {
            setDraft(useUiStore.getState().reportDraft ?? freshDraft('bug'))
            setMissing(null)
        }
    }, [open])

    const form = formOf(draft.kind)
    const asked = form.fields.filter((field) => !field.filledIn)

    const change = (next: ReportDraft) => {
        setDraft(next)
        setStored(next)
        setMissing(null)
    }

    const report = (): Report => {
        const fields: Record<string, string> = {...draft.fields}

        if (draft.kind === 'bug') {
            fields.version = filledIn.version

            if (filledIn.system) {
                fields.system = filledIn.system
            }

            if (filledIn.prop && draft.includeProp) {
                fields.prop = filledIn.prop
            }
        }

        return {kind: draft.kind, title: draft.title, fields}
    }

    const firstMissing = (): string | null => {
        if (draft.title.trim() === '') {
            return 'title'
        }

        return asked.find((field) => field.required && !draft.fields[field.id]?.trim())?.id ?? null
    }

    const sendToGitHub = async () => {
        const gap = firstMissing()

        if (gap) {
            setMissing(gap)
            body.current?.querySelector<HTMLElement>(`#report-${gap}, [data-field="${gap}"] button`)?.focus()
            return
        }

        const whole = report()
        const {url, trimmed} = issueLink(whole)

        if (trimmed) {
            await copyText(reportText(whole))
        }

        openLink(url)
        setStored(null)
        setOpen(false)
        notify(
            trimmed
                ? 'GitHub is open in your browser. The report was too long for one link, so all of it is copied: paste it in, then press Submit new issue.'
                : 'GitHub is open in your browser. Press Submit new issue there to send it.',
        )
    }

    const copyReport = async () => {
        const copied = await copyText(reportText(report()))

        notify(copied ? 'Report copied. Paste it wherever you like.' : 'The report couldn’t be copied.')
    }

    const missingLabel = missing === 'title' ? TITLE_LABEL : asked.find((field) => field.id === missing)?.label

    return (
        <Dialog open={open} onClose={() => setOpen(false)} title="Report a problem" width={560} closesOnOutsideClick={false}>
            <form
                ref={body}
                className="dialog__form report"
                onSubmit={(event) => {
                    event.preventDefault()
                    void sendToGitHub()
                }}
            >
                <div className="report__kinds" role="radiogroup" aria-label="What’s it about?">
                    {REPORT_FORMS.map(({kind, choice}) => (
                        <button
                            key={kind}
                            type="button"
                            role="radio"
                            className="chip"
                            aria-checked={draft.kind === kind}
                            aria-pressed={draft.kind === kind}
                            onClick={() => change(draft.kind === kind ? draft : {...freshDraft(kind), title: draft.title})}
                        >
                            {choice}
                        </button>
                    ))}
                </div>

                <div className="report__fields">
                    <div className="report__field">
                        <label className="dialog__label" htmlFor="report-title">
                            {TITLE_LABEL}
                        </label>
                        <input
                            id="report-title"
                            className="field"
                            value={draft.title}
                            maxLength={80}
                            autoFocus
                            aria-invalid={missing === 'title' || undefined}
                            placeholder={draft.kind === 'bug' ? 'Leaves vanish after export' : draft.kind === 'feature' ? 'Save a whole forest at once' : 'A willow that hangs to the ground'}
                            onChange={(event) => change({...draft, title: event.target.value})}
                        />
                    </div>

                    {asked.map((field) => (
                        <div className="report__field" key={`${draft.kind}-${field.id}`} data-field={field.id}>
                            <label className="dialog__label" htmlFor={`report-${field.id}`}>
                                {field.label}
                                {field.required ? null : <span className="report__optional"> (if you like)</span>}
                            </label>
                            <FieldInput
                                field={field}
                                value={draft.fields[field.id] ?? ''}
                                invalid={missing === field.id}
                                onChange={(value) => change({...draft, fields: {...draft.fields, [field.id]: value}})}
                            />
                            {field.description ? (
                                <p className="dialog__hint" id={`report-${field.id}-help`}>
                                    {field.description}
                                </p>
                            ) : null}
                        </div>
                    ))}
                </div>

                {draft.kind === 'bug' ? (
                    <details className="report__shared">
                        <summary>What will be shared</summary>
                        <p className="dialog__hint">
                            Version {filledIn.version}
                            {filledIn.system ? ` · ${filledIn.system}` : ' · System: you choose it on GitHub'}
                            {filledIn.prop && draft.includeProp ? ` · ${filledIn.prop}` : ''}
                        </p>
                        {filledIn.prop ? (
                            <label className="report__check">
                                <input type="checkbox" checked={draft.includeProp} onChange={(event) => change({...draft, includeProp: event.target.checked})} />
                                Include the preset and seed, so the same prop can be made again
                            </label>
                        ) : null}
                        <p className="dialog__hint">Nothing else is shared: no file paths, names or settings.</p>
                    </details>
                ) : null}

                {missingLabel ? (
                    <p className="report__missing" role="alert">
                        Answer “{missingLabel}” first.
                    </p>
                ) : null}

                <p className="dialog__hint">
                    This opens GitHub in your browser with everything filled in. You can check it, add pictures, and send it from there. You’ll
                    need a free GitHub account.
                </p>

                <div className="dialog__actions">
                    <button type="button" className="button" onClick={() => void copyReport()}>
                        Copy report
                    </button>
                    <span className="dialog__spacer" />
                    <button type="button" className="button" onClick={() => setOpen(false)}>
                        Cancel
                    </button>
                    <button type="submit" className="button button--primary">
                        Open GitHub
                    </button>
                </div>
            </form>
        </Dialog>
    )
}
