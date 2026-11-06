/** How many faces share each edge. A closed surface has exactly two on every one. */
export function edgeUse(indices: ArrayLike<number>): Map<string, number> {
    const use = new Map<string, number>()

    for (let at = 0; at < indices.length; at += 3) {
        for (let k = 0; k < 3; k++) {
            const a = indices[at + k]
            const b = indices[at + ((k + 1) % 3)]
            const key = a < b ? `${a}-${b}` : `${b}-${a}`

            use.set(key, (use.get(key) ?? 0) + 1)
        }
    }

    return use
}
