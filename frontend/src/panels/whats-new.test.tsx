import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import changelog from '../../../CHANGELOG.md?raw'
import {parseChangelog, whatsNewDue} from '../core/changelog'
import {APP_VERSION} from '../core/export/export-preferences'
import {useEditorStore} from '../store/editor-store'
import {useSettingsStore} from '../store/settings-store'
import {useUiStore} from '../store/ui-store'
import {WhatsNewDialog} from './WhatsNewDialog'

describe('reading the changelog', () => {
    it('reads versions, dates, notes, groups and items over several lines', () => {
        const [first, second] = parseChangelog(
            ['# Changelog', '', 'Intro.', '', '## 2.0 (May 1)', '', '**Big**', '', '- One', '  more', '- Two', '', '## 1.0', '', 'First.', '', '- Three'].join('\r\n'),
        )

        expect(first).toEqual({version: '2.0', date: 'May 1', notes: [], groups: [{title: 'Big', items: ['One more', 'Two']}]})
        expect(second).toEqual({version: '1.0', date: '', notes: ['First.'], groups: [{title: null, items: ['Three']}]})
    })

    it('has an entry for this version, first, so a release cannot ship without one', () => {
        expect(parseChangelog(changelog)[0].version).toBe(APP_VERSION)
    })
})

describe('when it opens by itself', () => {
    const ready = {loaded: true, wanted: true, seenVersion: '0.1.0', version: '0.1.5', tourSeen: true, tourOpen: false}

    it('opens after an update', () => {
        expect(whatsNewDue(ready)).toBe(true)
    })

    it.each([
        ['the settings are unread', {loaded: false}],
        ['it is turned off', {wanted: false}],
        ['this version was shown', {seenVersion: '0.1.5'}],
        ['the tour is still to come', {tourSeen: false}],
        ['a tour is open', {tourOpen: true}],
    ])('waits when %s', (_, change) => {
        expect(whatsNewDue({...ready, ...change})).toBe(false)
    })
})

describe('the dialog', () => {
    const setShow = (value: boolean) => useSettingsStore.getState().setValue('showWhatsNew', value)

    beforeEach(() => {
        useUiStore.setState({tourOpen: false, whatsNewOpen: false})
        useEditorStore.setState({page: 'gallery'})
        useSettingsStore.setState({loaded: true, galleryTourSeen: false, tourSeen: false, lastSeenVersion: ''})
        setShow(true)
    })

    afterEach(cleanup)

    it('comes after the tour, then not again', () => {
        render(<WhatsNewDialog />)
        expect(screen.queryByText("What's new")).toBeNull()

        act(() => useSettingsStore.getState().setGalleryTourSeen(true))
        expect(screen.getByText("What's new")).toBeTruthy()
        expect(screen.getByText(`Version ${APP_VERSION}`, {exact: false})).toBeTruthy()

        fireEvent.click(screen.getByRole('button', {name: 'Got it'}))
        expect(useUiStore.getState().whatsNewOpen).toBe(false)
        expect(useSettingsStore.getState().lastSeenVersion).toBe(APP_VERSION)
    })

    it('stays away when turned off, but still opens when asked', () => {
        setShow(false)
        useSettingsStore.setState({galleryTourSeen: true})
        render(<WhatsNewDialog />)
        expect(useUiStore.getState().whatsNewOpen).toBe(false)

        act(() => useUiStore.getState().setWhatsNewOpen(true))
        expect(screen.getByText("What's new")).toBeTruthy()
    })
})
