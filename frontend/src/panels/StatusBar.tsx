/**
 * The status bar. On the left, what you can do right now, which helps a beginner
 * more than any tutorial. On the right, the facts about the prop.
 */

import {AlertTriangle} from 'lucide-react'
import {findPropGenerator} from '../assets/prop-generators'
import {BUDGET_TARGETS, checkBudget, findBudgetTarget, type BudgetTargetId} from '../core/export/pipeline/budget'
import {hasUnsavedChanges, useEditorStore} from '../store/editor-store'
import {useSetting} from '../store/settings-store'
import {SeedPanel} from './SeedPanel'
import {hintFor} from './status-hint'

export function StatusBar() {
    const status = useEditorStore((state) => state.status)
    const moveTool = useEditorStore((state) => state.moveTool)
    const selection = useEditorStore((state) => state.selection)
    const scene = useEditorStore((state) => state.scene)
    const faceCounts = useEditorStore((state) => state.faceCounts)
    const shownFaceCounts = useEditorStore((state) => state.shownFaceCounts)
    const previewLevel = useEditorStore((state) => state.previewLevel)
    const budgetTarget = useEditorStore((state) => state.budgetTarget)
    const setBudgetTarget = useEditorStore((state) => state.setBudgetTarget)
    const batch = useEditorStore((state) => state.batch)
    const openBatch = useEditorStore((state) => state.openBatch)
    const dirty = useEditorStore(hasUnsavedChanges)
    // A new prop has nothing to lose yet, but it isn't saved anywhere either.
    const neverSaved = useEditorStore((state) => state.currentTreeId === null && state.filePath === null)
    const scheme = String(useSetting('cameraScheme'))

    const target = findBudgetTarget(budgetTarget)
    const asset = scene.assets[0]
    const budget = checkBudget(faceCounts, target, asset ? findPropGenerator(asset.generatorId)?.budgetAdvice : undefined)

    return (
        <footer className="statusbar" data-coach="status">
            <span className="statusbar__hint" data-state={status.state} role="status">
                {hintFor({status, moveTool, selection, scene}, scheme)}
            </span>
            <span className="statusbar__right">
                {batch && !batch.summary ? (
                    <button type="button" className="statusbar__link" onClick={openBatch}>
                        Exporting {batch.done} of {batch.total}
                    </button>
                ) : null}
                {budget.warning ? (
                    <span className="statusbar__warning" title={budget.warning}>
                        <AlertTriangle size={11} aria-hidden="true" />
                        Over budget
                    </span>
                ) : null}
                {asset ? <SeedPanel seed={asset.seed} /> : null}
                {previewLevel > 0 ? (
                    <span className="tabular" title="Faces in the detail level on screen">
                        LOD{previewLevel}: {(shownFaceCounts.wood + shownFaceCounts.leaves).toLocaleString()} faces
                    </span>
                ) : null}
                <span className="tabular" data-over={budget.over} title="Faces at full detail, against this budget">
                    {previewLevel > 0 ? 'Full detail: ' : null}
                    {budget.faces.toLocaleString()} / {target.faces.toLocaleString()} faces
                </span>
                <select
                    className="statusbar__select"
                    aria-label="What this prop is for"
                    title="What this prop is for"
                    value={budgetTarget}
                    onChange={(event) => setBudgetTarget(event.target.value as BudgetTargetId)}
                >
                    {BUDGET_TARGETS.map(({id, label}) => (
                        <option key={id} value={id}>
                            {label}
                        </option>
                    ))}
                </select>
                <span>{dirty ? 'Unsaved' : neverSaved ? 'Not saved yet' : 'Saved'}</span>
            </span>
        </footer>
    )
}
