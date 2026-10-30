/**
 * Reading bytes back from the Go boundary.
 *
 * Wails marshals `[]byte` with Go's `encoding/json`, which writes base64 —
 * even though the generated `App.d.ts` says `Array<number>`. Trusting that
 * declaration gives an empty array and a silent empty file, so every byte
 * read goes through here.
 */

function base64ToBytes(text: string): Uint8Array {
    try {
        const binary = atob(text)
        const bytes = new Uint8Array(binary.length)

        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
        }

        return bytes
    } catch {
        // Not base64: an already-decoded array arriving as a JSON string.
        return new Uint8Array(0)
    }
}

/** Bytes from whatever the binding returned: base64, or an array of numbers. */
export function bytesFromBinding(value: unknown): Uint8Array {
    if (typeof value === 'string') {
        return base64ToBytes(value)
    }

    if (value instanceof Uint8Array) {
        return value
    }

    if (Array.isArray(value)) {
        return Uint8Array.from(value as number[])
    }

    return new Uint8Array(0)
}

/** Text from whatever the binding returned. */
export function textFromBinding(value: unknown): string {
    return new TextDecoder().decode(bytesFromBinding(value))
}

/** A PNG data URL from whatever the binding returned, or null for nothing. */
export function pngDataUrlFromBinding(value: unknown): string | null {
    // The common case is already base64, which is exactly what a data URL
    // wants, so it is passed through rather than decoded and re-encoded.
    if (typeof value === 'string') {
        return value === '' ? null : `data:image/png;base64,${value}`
    }

    const bytes = bytesFromBinding(value)

    if (bytes.length === 0) {
        return null
    }

    let binary = ''
    const chunk = 0x8000

    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }

    return `data:image/png;base64,${btoa(binary)}`
}
