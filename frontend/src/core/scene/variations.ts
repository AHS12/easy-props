/**
 * The seeds Show me more offers.
 *
 * They come from the prop's seed and the page number, so the same prop always
 * shows the same grid, and each page shows new ones.
 */

import {hashSeed} from '../../assets/shared/random'

/** How many others go around the prop as it is now. */
export const OTHERS_PER_PAGE = 8

export function pageSeeds(seed: number, page: number): readonly number[] {
    return Array.from({length: OTHERS_PER_PAGE}, (_, index) => hashSeed(seed, page + 1, index + 1))
}
