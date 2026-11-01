import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {useEditorStore} from '../store/editor-store'
import {loadStepLabel, type LoadStep} from './load-steps'
import {ViewportLoading} from './ViewportLoading'

describe('the loading screen', () => {
    beforeEach(() => useEditorStore.setState({treeName: 'Blossom tree'}))
    afterEach(cleanup)

    it('names the prop it is building', () => {
        render(<ViewportLoading step="prop" />)

        expect(screen.getByRole('status').textContent).toContain('Building Blossom tree')
    })

    it('says something different at every step', () => {
        const steps: LoadStep[] = ['view', 'prop', 'draw', 'scene']

        expect(new Set(steps.map((step) => loadStepLabel(step, 'x'))).size).toBe(steps.length)
    })

    it('moves its bar forward through opening a prop', () => {
        const share = (step: LoadStep) => {
            const {container, unmount} = render(<ViewportLoading step={step} />)
            const bar = container.querySelector<HTMLElement>('.viewport-loading__bar')
            const value = Number(/scaleX\((.+)\)/.exec(bar?.style.transform ?? '')?.[1])

            unmount()

            return value
        }

        expect(share('view')).toBeLessThan(share('prop'))
        expect(share('prop')).toBeLessThan(share('draw'))
    })
})
