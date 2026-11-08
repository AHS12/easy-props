import {describe, expect, it} from 'vitest'
import {issueLink, MAX_LINK_LENGTH, reportText, TRIMMED_NOTE, type Report} from '../core/feedback/issue-link'
import {guessAction, propLine} from '../core/feedback/report-context'
import {createSceneFromPreset} from '../core/scene/initial-scene'

const bug = (fields: Record<string, string>, title = 'Leaves vanish after export'): Report => ({kind: 'bug', title, fields})
const paramsOf = (url: string) => new URL(url).searchParams

describe('the link to GitHub', () => {
    it('opens the matching template with the title after its prefix', () => {
        const query = paramsOf(issueLink(bug({})).url)

        expect(query.get('template')).toBe('bug_report.yml')
        expect(query.get('title')).toBe('[Bug]: Leaves vanish after export')
    })

    it('fills each answer under its field', () => {
        const query = paramsOf(issueLink(bug({frequency: 'Every time', version: '0.4.0', system: 'Windows 11'})).url)

        expect(query.get('frequency')).toBe('Every time')
        expect(query.get('version')).toBe('0.4.0')
        expect(query.get('system')).toBe('Windows 11')
    })

    it('keeps letters that need care, from & and # to line breaks and other languages', () => {
        const text = 'A & B #3 + 1 = 4\nZweite Zeile: Bäume 木'
        const query = paramsOf(issueLink(bug({'what-happened': text})).url)

        expect(query.get('what-happened')).toBe(text)
    })

    it('writes spaces so GitHub doesn’t read them as plus signs', () => {
        expect(issueLink(bug({})).url).not.toContain('+')
    })

    it('leaves out empty answers', () => {
        expect(paramsOf(issueLink(bug({steps: '   '})).url).has('steps')).toBe(false)
    })

    it('leaves out fields the kind doesn’t have', () => {
        const query = paramsOf(issueLink({kind: 'feature', title: 'Idea', fields: {idea: 'More', version: '0.4.0'}}).url)

        expect(query.get('idea')).toBe('More')
        expect(query.has('version')).toBe(false)
    })

    it('cuts the longest answer so the link fits, and says so', () => {
        const long = 'word '.repeat(4000)
        const {url, trimmed} = issueLink(bug({'what-happened': long, steps: 'Open it'}))

        expect(trimmed).toBe(true)
        expect(url.length).toBeLessThanOrEqual(MAX_LINK_LENGTH)
        expect(paramsOf(url).get('what-happened')!.endsWith(TRIMMED_NOTE.trim())).toBe(true)
        expect(paramsOf(url).get('steps')).toBe('Open it')
    })

    it('leaves a short report whole', () => {
        expect(issueLink(bug({'what-happened': 'It broke'})).trimmed).toBe(false)
    })
})

describe('the report as text', () => {
    it('lists each question with its answer', () => {
        const text = reportText(bug({'what-happened': 'It broke', frequency: 'Sometimes'}))

        expect(text).toContain('[Bug]: Leaves vanish after export')
        expect(text).toContain('What happened?\nIt broke')
        expect(text).toContain('How often does it happen?\nSometimes')
    })
})

describe('what the app fills in', () => {
    const place = {onHome: false, exporting: false, exportingMany: false, partSelected: false}

    it('guesses what the person was doing from where they are', () => {
        expect(guessAction({...place, onHome: true})).toBe('Browsing the home page or my saved props')
        expect(guessAction({...place, exporting: true})).toBe('Exporting one prop')
        expect(guessAction({...place, exportingMany: true})).toBe('Exporting many props at once')
        expect(guessAction({...place, partSelected: true})).toBe('Selecting or changing one part of a prop')
        expect(guessAction(place)).toBe('Shaping a prop with the sliders')
    })

    it('names the open prop by its preset and seed, with its style and look', () => {
        const scene = createSceneFromPreset('maple')

        expect(propLine(scene, 'maple', 'lit')).toBe(`Red maple, seed ${scene.assets[0].seed}`)
        expect(propLine(scene, 'maple', 'cel')).toBe(`Red maple, seed ${scene.assets[0].seed}, Comic look`)
    })

    it('says nothing about a prop when none is open', () => {
        expect(propLine({id: 's', assets: []}, 'maple', 'lit')).toBeNull()
    })
})
