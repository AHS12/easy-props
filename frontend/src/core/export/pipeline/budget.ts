/**
 * What a prop is for, and whether it fits.
 *
 * Starting values from common practice, not measurements. Going over warns and
 * never blocks an export.
 */

export type BudgetTargetId = 'hero' | 'standard' | 'background' | 'mobile'

export interface BudgetTarget {
    readonly id: BudgetTargetId
    readonly label: string
    readonly faces: number
    readonly drawCalls: number
}

export const BUDGET_TARGETS: readonly BudgetTarget[] = [
    {id: 'hero', label: 'Hero', faces: 30000, drawCalls: 2},
    {id: 'standard', label: 'Standard', faces: 14000, drawCalls: 2},
    {id: 'background', label: 'Background', faces: 5000, drawCalls: 2},
    {id: 'mobile', label: 'Mobile', faces: 2000, drawCalls: 2},
]

export const DEFAULT_BUDGET_TARGET: BudgetTargetId = 'standard'

export function findBudgetTarget(id: BudgetTargetId): BudgetTarget {
    return BUDGET_TARGETS.find((target) => target.id === id) ?? BUDGET_TARGETS[1]
}

export interface FaceCounts {
    readonly wood: number
    readonly leaves: number
}

export interface BudgetCheck {
    readonly faces: number
    readonly over: boolean
    /** Names what costs most, when the prop is over. */
    readonly warning: string | null
}

export function checkBudget(counts: FaceCounts, target: BudgetTarget): BudgetCheck {
    const faces = counts.wood + counts.leaves

    if (faces <= target.faces) {
        return {faces, over: false, warning: null}
    }

    const leavesCostMost = counts.leaves >= counts.wood
    const share = Math.round(((leavesCostMost ? counts.leaves : counts.wood) / faces) * 100)

    return {
        faces,
        over: true,
        warning: leavesCostMost
            ? `Leaves are ${share}% of this prop. Lower Leaf density or Clumps.`
            : `Wood is ${share}% of this prop. Lower Bark detail or Branches.`,
    }
}
