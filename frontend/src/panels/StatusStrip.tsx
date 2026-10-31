import {BUDGET_TARGETS, checkBudget, findBudgetTarget, type BudgetTargetId} from '../core/export/pipeline/budget'
import {useEditorStore} from '../store/editor-store'

function statusLabel(state: 'ready' | 'busy' | 'error', message?: string): string {
    if (message) {
        return message
    }

    if (state === 'busy') {
        return 'Working'
    }

    if (state === 'error') {
        return 'Something went wrong'
    }

    return 'Ready'
}

export function StatusStrip() {
    const status = useEditorStore((state) => state.status)
    const faceCounts = useEditorStore((state) => state.faceCounts)
    const budgetTarget = useEditorStore((state) => state.budgetTarget)
    const setBudgetTarget = useEditorStore((state) => state.setBudgetTarget)
    const batch = useEditorStore((state) => state.batch)
    const openBatch = useEditorStore((state) => state.openBatch)

    const target = findBudgetTarget(budgetTarget)
    const budget = checkBudget(faceCounts, target)

    return (
        <footer className="statusbar">
            <span>
                <span className="statusbar__dot" aria-hidden="true" />
                {statusLabel(status.state, status.message)}
            </span>
            <span className="statusbar__right">
                {batch && !batch.summary ? (
                    <button type="button" className="statusbar__link" onClick={openBatch}>
                        Exporting {batch.done} of {batch.total}
                    </button>
                ) : null}
                {budget.warning ? <span role="status">{budget.warning}</span> : null}
                <span data-over={budget.over}>
                    {budget.faces.toLocaleString()} / {target.faces.toLocaleString()} faces
                </span>
                <select
                    className="statusbar__select"
                    aria-label="What this prop is for"
                    value={budgetTarget}
                    onChange={(event) => setBudgetTarget(event.target.value as BudgetTargetId)}
                >
                    {BUDGET_TARGETS.map(({id, label}) => (
                        <option key={id} value={id}>
                            {label}
                        </option>
                    ))}
                </select>
                <span>Seed 1</span>
            </span>
        </footer>
    )
}
