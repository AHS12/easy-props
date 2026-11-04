/** A saved prop's picture, shared by Home and Your props. */

import {useState} from 'react'
import type {SavedTree} from '../platform/library'
import {FAMILY_ICONS} from './prop-labels'

/** The prop's picture, or the icon of its kind until one is drawn or when it won't load. */
export function PropPicture({tree, iconSize = 30}: {tree: SavedTree; iconSize?: number}) {
    const Icon = FAMILY_ICONS[tree.kind ?? 'tree']
    const [failed, setFailed] = useState<string | null>(null)

    return tree.thumbnail && failed !== tree.thumbnail ? (
        <img
            src={tree.thumbnail}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(tree.thumbnail)}
        />
    ) : (
        <Icon size={iconSize} aria-hidden="true" />
    )
}
