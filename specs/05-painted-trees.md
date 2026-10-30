# 05 — Painted trees

Status: built, with per-part editing. Replaces the grown-tree direction in
[`03-organic-trees.md`](./03-organic-trees.md).

## The target

Stylized game trees: soft, painterly and bold, not faceted low-poly and not
realistic. A heavy characterful trunk, a few limbs ending in thin dark whips,
and big soft masses of leaves with a brush-stroke edge. Generated from maths
alone, with no downloaded art.

The look belongs in the asset, not in a shader, so it survives export to any
engine. Lighting, bloom and fog belong to the game.

## Why not the grown tree

Space colonization produced thousands of joints and 17,000 triangles of bare
bark, with every seed looking alike. It answers "how does a real tree branch",
and in a tree like this you hardly see the branching. What you see is the
trunk, the crown's big shapes, and colour.

## How a tree is made

| Stage | File | What it does |
|---|---|---|
| Plan | `painted/plan.ts` | Rule-based limbs, 4 levels; clumps from merged branch tips; crown fitted to Height |
| Heavy wood | `painted/wood-field.ts`, `bark-mesh.ts` | A signed distance field with smooth unions, ridges and flare, meshed by surface nets |
| Thin wood | `painted/bark-mesh.ts` | Tapered tubes starting inside the heavy wood, ending in a point |
| Leaves | `painted/clump-mesh.ts`, `dab-texture.ts` | Lobes covered in brush-dab cards over a small core, with rounded shading normals |
| Colour | vertex colours | Painted per vertex from a palette whose shadows shift hue |

Three decisions matter most:

1. **Fake normals on leaves.** Every card is shaded as if it sat on the smooth
   lobe, so hundreds of cards take light as one soft volume. This is the look.
2. **Both windings instead of a double-sided material.** A double-sided
   material flips the normal on the back face, which would undo the first point
   in the viewport and in every engine.
3. **Sculpted joints.** Fitting swept tube rings to the field left sockets and
   shards, because rings are too far apart to hold a fillet. Heavy wood is meshed
   from the field directly.

## Budgets

Asserted in `tests/painted-tree.test.ts`, at default settings.

| Style | Triangles |
|---|---|
| Detailed | under 14,000 |
| Low-poly | under 10,000 |

## Controls

Whole-tree controls, grouped in the inspector. A new kind of tree is a preset,
meaning a set of these values, not a new generator.

| Group | Controls |
|---|---|
| Trunk | Height, Thickness, Lean, Bend, Corkscrew, Twist, Ridge depth, Ridges, Base flare, Roots, Root length |
| Branches | Big branches, Fork height, Spread, Angle, Droop, Gnarl, Side branches, Twigs |
| Leaves | Clumps, Clump size, Merge, Flatness, Lumpiness, Leaf density, Leaf size |
| Colours | Palette, Variation, and five pickers for your own colours |
| Bark detail | Mesh detail, Roughness, Burls, Hollow, Moss |

## Editing one part

Click the trunk, a root, a branch or a clump.

- A limb has drag handles, Length and Thickness, and can be removed.
- A clump can be moved, sized, flattened, recoloured and removed, and has its own
  leaf density, leaf size and lumpiness.

A part's panel holds only what changes that part. The tree's counts stay in the
Whole tree panel, because a count under a selected clump could delete that clump
while it is being edited. The trunk is the exception: there is one, nothing can
take it away, so its panel also has its shape, bark detail and bark colours.

Three decisions make this hold together:

1. **One list of edits, on the tree.** An edit is a tree parameter, keyed by the
   part's stable name, so undo, save and rebuild treat it like a slider and a
   later slider change cannot lose it. Parts never own a copy of their shape.
2. **Limbs are controls, not meshes.** The wood is one blended surface, so a limb
   renders only an invisible tube for the pointer to land on, which is never
   exported. Twigs have no part: there are too many, and they are too fine to hit.
3. **Each part has its own random stream**, named after it. Adding a branch adds
   a branch instead of reshuffling the tree.

The crown is fitted to Height without the hand edits, so dragging one branch up
does not squash the rest of the tree.

## Presets

Blossom, Spring and Autumn, plus Round canopy to compare against the old style.
The other old presets, including the palms, are no longer offered. They stay
findable so a saved tree that came from one can still be restored, and the palm
generator's code is untouched.

## Speed

Drawing a frame takes about 1 ms, and nearly all of a slider's cost is sculpting
the bark. So the viewport builds a bark on a pool of Web Workers (`bark-pool.ts`):

- It keeps showing the old tree until the new bark arrives, then shows bark and
  leaves in one frame, so a slider never waits and the crown never leaves the wood.
- A change that needs no new bark, like Leaf density, appears at once.
- One build runs at a time. A fast drag skips the values it has already passed.
- The threads practise on the first tree, so the first drag is not the slowest.
- The camera reframes for a new Height only when the pointer is released.
- Cells are sculpted in slices and joined in order, so the result is identical to
  `buildBark`, which export still calls directly. A test holds this.
- If workers cannot start, the same bark is built on the main thread.

Measured in a browser on a Ryzen 7 5700X: about 84 ms on one thread, about 37 ms on
eight, with the main thread never held for more than about 6 ms by the build.

## Not done yet

- More recipes, and shapes the current limb rules cannot reach (pine, true willow).
- A coarse preview while dragging: the bark still rebuilds in full at each step,
  so it can trail the leaves and handles slightly.
- A distant, lighter version of each tree.
- Opens correctly in Blender. Not yet imported into Unreal or Godot, which are the
  real destinations. Each clump is its own mesh, so a tree is about a dozen draw
  calls until they are merged on export.
- The export test skips painted trees, because jsdom has no canvas to write the
  leaf texture with.
- The style toggle only changes density on these trees, so "Low-poly" is a
  misleading label for them.
