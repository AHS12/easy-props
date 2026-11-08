/**
 * The address that opens GitHub's issue form with a report filled in.
 *
 * Nothing is sent from the app. The person reads the page over, adds pictures if
 * they like, and presses Submit new issue on GitHub themselves.
 */

import {formOf, type ReportKind} from './report-forms'

export const REPOSITORY_URL = 'https://github.com/AHS12/easy-props'

/** GitHub turns away very long addresses, so a report is kept under this. */
export const MAX_LINK_LENGTH = 6000

/** Ends a field that was shortened, so nobody thinks the rest was lost. */
export const TRIMMED_NOTE = '\n\n(The rest is copied. Paste it here.)'

export interface Report {
    readonly kind: ReportKind
    /** The person's own few words, after the template's prefix. */
    readonly title: string
    /** By the template's field ids. Empty ones are left out. */
    readonly fields: Readonly<Record<string, string>>
}

function addressOf(report: Report, fields: Readonly<Record<string, string>>): string {
    const form = formOf(report.kind)
    const query = new URLSearchParams({template: form.template, title: `${form.titlePrefix}${report.title.trim()}`})

    for (const field of form.fields) {
        const value = fields[field.id]?.trim()

        if (value) {
            query.set(field.id, value)
        }
    }

    // URLSearchParams writes spaces as +, which GitHub's form reads as a plus sign.
    return `${REPOSITORY_URL}/issues/new?${query.toString().replace(/\+/g, '%20')}`
}

/**
 * The address for a report, and whether its longest field had to be cut to fit.
 * When it was, the whole report should go to the clipboard for pasting.
 */
export function issueLink(report: Report): {url: string; trimmed: boolean} {
    const full = addressOf(report, report.fields)

    if (full.length <= MAX_LINK_LENGTH) {
        return {url: full, trimmed: false}
    }

    const longest = Object.entries(report.fields).reduce((best, entry) => (entry[1].length > best[1].length ? entry : best))
    const [id, text] = longest
    let low = 0
    let high = text.length

    // The longest share of that field that still fits, found by halving.
    while (low < high) {
        const middle = Math.ceil((low + high) / 2)
        const fits = addressOf(report, {...report.fields, [id]: text.slice(0, middle) + TRIMMED_NOTE}).length <= MAX_LINK_LENGTH

        if (fits) {
            low = middle
        } else {
            high = middle - 1
        }
    }

    return {url: addressOf(report, {...report.fields, [id]: text.slice(0, low) + TRIMMED_NOTE}), trimmed: true}
}

/** The report as plain text, for the clipboard: each question and its answer. */
export function reportText(report: Report): string {
    const form = formOf(report.kind)
    const lines = [`${form.titlePrefix}${report.title.trim()}`]

    for (const field of form.fields) {
        const value = report.fields[field.id]?.trim()

        if (value) {
            lines.push('', `${field.label}`, value)
        }
    }

    return lines.join('\n')
}
