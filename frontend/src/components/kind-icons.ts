/**
 * The icon for each kind of prop, the same in menus, tabs and tiles.
 */

import {createLucideIcon, Flower2, Mountain, Shrub, TreeDeciduous, TreePalm, Wheat, type LucideIcon} from 'lucide-react'
import type {PropFamily} from '../assets/trees/presets'

/** Lucide has no cactus, so this one is drawn in its manner: a column with two raised arms. */
export const Cactus = createLucideIcon('Cactus', [
    ['path', {d: 'M10 21V5a2 2 0 0 1 4 0v16', key: 'trunk'}],
    ['path', {d: 'M10 14H8a2 2 0 0 1-2-2V9', key: 'left'}],
    ['path', {d: 'M14 11h2a2 2 0 0 0 2-2V7', key: 'right'}],
    ['path', {d: 'M7 21h10', key: 'ground'}],
])

export const FAMILY_ICONS: Readonly<Record<PropFamily, LucideIcon>> = {
    tree: TreeDeciduous,
    palm: TreePalm,
    bush: Shrub,
    flower: Flower2,
    grass: Wheat,
    cactus: Cactus,
    rock: Mountain,
}
