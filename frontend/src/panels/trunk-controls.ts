/**
 * Which tree control each of the trunk's shared controls writes to.
 *
 * The trunk's panel is its own, but five of its controls are the tree's: the
 * trunk carries the tree's shape. Their names differ in two cases, so the
 * mapping is written down once rather than guessed at in the panel.
 *
 * `controlPoints` is deliberately absent: how many points the trunk's spine
 * has is the part's own business.
 */
export const TRUNK_TREE_KEYS: Readonly<Record<string, string>> = {
    height: 'height',
    baseRadius: 'trunkRadius',
    taper: 'taper',
    bend: 'bend',
    twist: 'twist',
}
