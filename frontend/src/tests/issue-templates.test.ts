import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe, expect, it} from 'vitest'
import {REPORT_FORMS} from '../core/feedback/report-forms'

interface TemplateField {
    readonly id: string
    readonly type: string
    label: string
    required: boolean
    readonly options: string[]
}

/**
 * The fields of an issue template. The templates are plain enough to read the few
 * lines needed without a YAML library: each field starts at `- type:`.
 */
function readTemplate(name: string): {title: string; fields: TemplateField[]} {
    const lines = readFileSync(resolve(__dirname, '../../../.github/ISSUE_TEMPLATE', name), 'utf8').split(/\r?\n/)
    const fields: TemplateField[] = []
    let title = ''
    let type = ''
    let inOptions = false

    const unquote = (text: string) => text.trim().replace(/^"(.*)"$/, '$1')

    for (const line of lines) {
        const trimmed = line.trim()

        if (line.startsWith('title:')) {
            title = unquote(line.slice('title:'.length))
        } else if (trimmed.startsWith('- type:')) {
            type = trimmed.slice('- type:'.length).trim()
            inOptions = false
        } else if (trimmed.startsWith('id:')) {
            fields.push({id: trimmed.slice(3).trim(), type, label: '', required: false, options: []})
        } else if (trimmed.startsWith('label:') && fields.length > 0 && fields.at(-1)!.label === '') {
            fields.at(-1)!.label = unquote(trimmed.slice('label:'.length))
        } else if (trimmed === 'options:') {
            inOptions = true
        } else if (inOptions && trimmed.startsWith('- ') && !trimmed.startsWith('- label:')) {
            fields.at(-1)!.options.push(trimmed.slice(2))
        } else if (trimmed.startsWith('required:') && fields.length > 0) {
            fields.at(-1)!.required = trimmed.endsWith('true')
            inOptions = false
        } else if (trimmed && !trimmed.startsWith('- ')) {
            inOptions = false
        }
    }

    return {title, fields}
}

describe('Report a problem against the GitHub issue templates', () => {
    for (const form of REPORT_FORMS) {
        describe(form.template, () => {
            const template = readTemplate(form.template)
            const byId = new Map(template.fields.map((field) => [field.id, field]))

            it('starts the title the way the template does', () => {
                expect(form.titlePrefix).toBe(template.title)
            })

            it('fills only fields the template has, under the same label', () => {
                for (const field of form.fields) {
                    expect(byId.get(field.id)?.label, field.id).toBe(field.label)
                }
            })

            it('offers only choices the template has, word for word', () => {
                for (const field of form.fields.filter((each) => each.type === 'dropdown')) {
                    expect(field.options, field.id).toEqual(byId.get(field.id)?.options)
                }
            })

            it('asks for everything the template needs', () => {
                const asked = new Set(form.fields.map((field) => field.id))

                for (const field of template.fields.filter((each) => each.required)) {
                    expect(asked.has(field.id), field.id).toBe(true)
                }
            })

            it('agrees on which answers are needed', () => {
                for (const field of form.fields) {
                    expect(field.required, field.id).toBe(byId.get(field.id)?.required)
                }
            })
        })
    }
})
