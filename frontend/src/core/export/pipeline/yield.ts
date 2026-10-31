/**
 * Letting the interface breathe during a long export.
 *
 * A message rather than a timer, because a browser slows timers to a crawl in a
 * window that is not in front, and an export should keep going behind others.
 */

/** About one frame's worth of work, leaving the frame room to draw. */
const WORK_MS = 10

let lastYield = 0

function nextTask(): Promise<void> {
    return new Promise((resolve) => {
        const {port1, port2} = new MessageChannel()

        port1.onmessage = () => {
            port1.close()
            resolve()
        }
        port2.postMessage(null)
    })
}

/** Gives way if this task has run long enough, and carries straight on if not. */
export async function yieldIfBusy(): Promise<void> {
    if (performance.now() - lastYield >= WORK_MS) {
        await nextTask()
        lastYield = performance.now()
    }
}
