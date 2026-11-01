/**
 * Turns the pixels in a style into rems, as the build reads each stylesheet.
 *
 * The interface scale sets the root font size, so anything in rems grows with it and
 * is really that size. Everything that measures the page, like a dropdown finding
 * room to open, then gets true numbers and needs no correcting. The stylesheets can
 * stay in pixels, at the 100% size. A hairline stays a pixel, so it stays crisp.
 */

const ROOT_PX = 16
const HAIRLINE_PX = 1
const PIXELS = /(?<![\w.#-])(-?\d*\.?\d+)px\b/g

export function pxToRem(value: string): string {
    // A picture written into the style has its own coordinates.
    if (value.includes('url(')) {
        return value
    }

    return value.replace(PIXELS, (match, amount: string) => {
        const px = Number(amount)

        return Math.abs(px) <= HAIRLINE_PX ? match : `${px / ROOT_PX}rem`
    })
}
