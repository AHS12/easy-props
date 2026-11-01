/**
 * What the view shows while it gets ready, for a computer where that takes a while.
 *
 * It fades in after a moment, so a fast computer never sees it flash. The bar moves by
 * transform, which the browser draws apart from the page, so it keeps moving while
 * the step it stands for holds up everything else.
 */

import {useEditorStore} from '../store/editor-store'
import {LOAD_SHARE, loadStepLabel, type LoadStep} from './load-steps'

export function ViewportLoading({step}: {step: LoadStep}) {
    const name = useEditorStore((state) => state.treeName)

    return (
        <div className="viewport-loading">
            <div className="viewport-loading__box" role="status">
                <span>{loadStepLabel(step, name)}</span>
                <div className="viewport-loading__track" aria-hidden="true">
                    <div className="viewport-loading__bar" style={{transform: `scaleX(${LOAD_SHARE[step]})`}} />
                </div>
            </div>
        </div>
    )
}
