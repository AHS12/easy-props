import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {useEditorStore} from '../store/editor-store'
import {useSettingsStore} from '../store/settings-store'
import {useUiStore} from '../store/ui-store'
import {Tour} from './Tour'
import {availableSteps, placeCard, TOUR_STEPS, unzoomed} from './tour-steps'

const SCREEN = {width: 1200, height: 800}
const CARD = {width: 330, height: 200}

describe('where the card goes', () => {
    it('takes the side it asked for when there is room', () => {
        const place = placeCard('right', {left: 100, top: 100, width: 200, height: 100}, SCREEN, CARD)

        expect(place.side).toBe('right')
        expect(place.left).toBeGreaterThan(300)
    })

    it('moves to the other side when there is none', () => {
        expect(placeCard('right', {left: 1000, top: 100, width: 190, height: 100}, SCREEN, CARD).side).toBe('left')
        expect(placeCard('below', {left: 100, top: 700, width: 100, height: 90}, SCREEN, CARD).side).toBe('above')
    })

    it('never leaves the screen, wherever its target is', () => {
        for (const side of ['right', 'left', 'below', 'above', 'over'] as const) {
            for (const target of [
                {left: -50, top: -50, width: 60, height: 60},
                {left: 1190, top: 790, width: 60, height: 60},
                {left: 0, top: 0, width: 1200, height: 800},
            ]) {
                const place = placeCard(side, target, SCREEN, CARD)

                expect(place.left).toBeGreaterThanOrEqual(0)
                expect(place.top).toBeGreaterThanOrEqual(0)
                expect(place.left + CARD.width).toBeLessThanOrEqual(SCREEN.width)
                expect(place.top + CARD.height).toBeLessThanOrEqual(SCREEN.height)
            }
        }
    })

    it('sits in the middle with nothing to point at', () => {
        const place = placeCard('below', null, SCREEN, CARD)

        expect(place.left).toBe((SCREEN.width - CARD.width) / 2)
        expect(place.side).toBe('over')
    })

    it('points its arrow at the target, even when the card is pushed along', () => {
        const place = placeCard('below', {left: 1100, top: 20, width: 60, height: 30}, SCREEN, CARD)

        expect(place.left + place.arrow).toBeCloseTo(1130)
    })

    it.each([0.75, 1, 1.25, 1.5])('lands on what it measured at a scale of %f', (zoom) => {
        const measured = {left: 300, top: 150, width: 90, height: 30}
        const box = unzoomed(measured, zoom)

        // Placed in the page's units, then zoomed by the page, it is back on the target.
        expect(box.left * zoom).toBeCloseTo(measured.left)
        expect(box.width * zoom).toBeCloseTo(measured.width)
    })
})

describe('which steps there are', () => {
    it('leaves out what has nothing to point at, and only that', () => {
        const none = availableSteps(TOUR_STEPS.gallery, () => false)

        expect(none.some((step) => step.target === 'gallery-recent')).toBe(false)
        expect(none.some((step) => step.target === 'gallery-kinds')).toBe(true)
        expect(availableSteps(TOUR_STEPS.gallery, () => true)).toHaveLength(TOUR_STEPS.gallery.length)
    })

    it('never gives two steps one title, because they are told apart by it', () => {
        for (const steps of Object.values(TOUR_STEPS)) {
            expect(new Set(steps.map((step) => step.title)).size).toBe(steps.length)
        }
    })
})

describe('the tours', () => {
    const firstOf = (page: 'gallery' | 'editor') => TOUR_STEPS[page][0].title

    beforeEach(() => {
        useUiStore.setState({tourOpen: false})
        useSettingsStore.setState({loaded: true, tourSeen: false, galleryTourSeen: false})
        useEditorStore.setState({page: 'gallery'})
    })

    afterEach(cleanup)

    it('waits for the settings before deciding anything', () => {
        useSettingsStore.setState({loaded: false})
        render(<Tour />)

        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('starts the gallery tour on the gallery', () => {
        render(<Tour />)

        expect(screen.getByRole('heading').textContent).toBe(firstOf('gallery'))
    })

    it('does not come back once seen', () => {
        useSettingsStore.setState({galleryTourSeen: true})
        render(<Tour />)

        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('starts the editor tour from its own first step, wherever the gallery tour had got to', () => {
        render(<Tour />)
        fireEvent.click(screen.getByRole('button', {name: 'Next'}))
        fireEvent.click(screen.getByRole('button', {name: 'Next'}))

        act(() => useEditorStore.setState({page: 'editor'}))

        expect(screen.getByRole('heading').textContent).toBe(firstOf('editor'))
        expect(screen.getByText(/^Step 1 of/)).toBeTruthy()
    })

    it('does not carry a replayed tour into a page already seen', () => {
        useSettingsStore.setState({galleryTourSeen: true, tourSeen: true})
        render(<Tour />)

        act(() => useUiStore.setState({tourOpen: true}))
        expect(screen.getByRole('heading').textContent).toBe(firstOf('gallery'))

        act(() => useEditorStore.setState({page: 'editor'}))
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('replays the tour of the page you are on', () => {
        useEditorStore.setState({page: 'editor'})
        useSettingsStore.setState({galleryTourSeen: true, tourSeen: true})
        render(<Tour />)

        act(() => useUiStore.setState({tourOpen: true}))

        expect(screen.getByRole('heading').textContent).toBe(firstOf('editor'))
    })

    it('closes from its last step, whatever button that is', () => {
        render(<Tour />)

        while (screen.queryByRole('button', {name: 'Next'})) {
            fireEvent.click(screen.getByRole('button', {name: 'Next'}))
        }

        fireEvent.click(screen.getByRole('button', {name: 'Pick a prop'}))

        expect(screen.queryByRole('dialog')).toBeNull()
        expect(useSettingsStore.getState().galleryTourSeen).toBe(true)
    })

    it('still closes if remembering it fails', () => {
        const setGalleryTourSeen = useSettingsStore.getState().setGalleryTourSeen
        const originalError = console.error
        // React reports the failure to the window as well, where it would fail the whole run.
        const expected = (event: ErrorEvent) => event.preventDefault()

        window.addEventListener('error', expected)
        console.error = () => undefined
        useSettingsStore.setState({
            setGalleryTourSeen: () => {
                throw new Error('could not write')
            },
        })
        render(<Tour />)

        // The failure surfaces after the tour has closed, so a reader of the page still gets through.
        try {
            fireEvent.click(screen.getByRole('button', {name: 'Skip tour'}))
        } catch {
            // React may rethrow it here. The tour is what matters.
        }

        expect(useUiStore.getState().tourOpen).toBe(false)

        useSettingsStore.setState({setGalleryTourSeen})
        console.error = originalError
        window.removeEventListener('error', expected)
    })

    it('remembers each tour apart', () => {
        render(<Tour />)
        fireEvent.click(screen.getByRole('button', {name: 'Skip tour'}))

        expect(useSettingsStore.getState().galleryTourSeen).toBe(true)
        expect(useSettingsStore.getState().tourSeen).toBe(false)
    })

    it('opens the panels for the editor tour, and puts them back', () => {
        useEditorStore.setState({page: 'editor'})
        useSettingsStore.getState().setLayout({leftOpen: false, rightOpen: false})
        render(<Tour />)

        expect(useSettingsStore.getState().layout.leftOpen).toBe(true)

        fireEvent.click(screen.getByRole('button', {name: 'Skip tour'}))

        expect(useSettingsStore.getState().layout.leftOpen).toBe(false)
    })

    it('goes forward and back with the arrow keys, and ends with Escape', () => {
        render(<Tour />)

        fireEvent.keyDown(window, {key: 'ArrowRight'})
        expect(screen.getByRole('heading').textContent).not.toBe(firstOf('gallery'))

        fireEvent.keyDown(window, {key: 'ArrowLeft'})
        expect(screen.getByRole('heading').textContent).toBe(firstOf('gallery'))

        fireEvent.keyDown(window, {key: 'Escape'})
        expect(screen.queryByRole('dialog')).toBeNull()
    })
})
