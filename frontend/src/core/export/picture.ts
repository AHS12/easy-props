/**
 * Saving a picture of a prop: the file's name and its bytes.
 *
 * The drawing itself is the view's, so the picture looks as the prop does on screen.
 */

/** The sizes offered, as the picture's longer side in pixels. */
export const PICTURE_SIZES = [1024, 2048] as const

export type PictureSize = (typeof PICTURE_SIZES)[number]

/** Characters no system allows in a file name. Control characters are left out too. */
const UNSAFE = new Set('\\/:*?"<>|')

/** The prop's name as a PNG file name, or a plain one when nothing of it is left. */
export function pictureFileName(propName: string): string {
    const kept = [...propName].map((character) => (UNSAFE.has(character) || character.charCodeAt(0) < 32 ? ' ' : character)).join('')
    const safe = kept.replace(/\s+/g, ' ').trim().replace(/^\.+/, '')

    return `${safe || 'Prop picture'}.png`
}

/** The bytes of a PNG data URL. */
export function bytesOfDataUrl(dataUrl: string): Uint8Array {
    const comma = dataUrl.indexOf(',')
    const binary = atob(comma === -1 ? dataUrl : dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(binary.length)

    for (let at = 0; at < binary.length; at++) {
        bytes[at] = binary.charCodeAt(at)
    }

    return bytes
}

/** The folder a saved file is in, for Show the files. */
export function folderOf(path: string): string | undefined {
    const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))

    return cut > 0 ? path.slice(0, cut) : undefined
}
