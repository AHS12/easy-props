# 05 — Painted trees

Status: first tree built. Replaces the grown-tree direction in
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
| Detailed | under 11,000 |
| Low-poly | under 8,000 |

## Controls

Colours, Height, Spread, Trunk thickness, Fork height, Big branches, Gnarl, Leaf
clumps, Clump size, Fullness. A new kind of tree is a preset, meaning a set of
these values, not a new generator.

## Not done yet

- More recipes, and shapes the current limb rules cannot reach (pine, willow).
- A distant, lighter version of each tree.
- The export has only been reloaded with three.js in a browser. It has not been
  opened in Blender or imported into a game engine. Each clump is its own mesh,
  so a tree is about a dozen draw calls until they are merged on export.
- The export test skips painted trees, because jsdom has no canvas to write the
  leaf texture with.
- The style toggle only changes density on these trees, so "Low-poly" is a
  misleading label for them.
