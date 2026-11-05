# Wind in Unreal

Export the prop with **Engine: Unreal** and **Wind data** on. An Unreal material is a
binary file, so you build this one yourself, once per project. Tested on Unreal Engine
5.8 with one tree.

The file stores movement in its second UV set: **UV1 red (R) is sway** and **UV1 green
(G) is flutter**.

## The quick way

Turn on **Join parts** when you export, so each prop is one mesh you can place with the
Foliage tool or PCG. Then, in the **Output Log**, switch the box at the bottom to **Cmd**
and run:

    py "C:/path/to/setup_props.py" "C:/path/to/export/folder"

This needs Unreal's Python Editor Script Plugin. It imports every prop in the folder to
`/Game/EasyProps`, builds the materials below once, and gives each prop its own material
instances. It imports the full-detail version only, so add lighter levels yourself if you
turn Nanite off. It also works without Join parts.

The rest of this guide does the same by hand.

## Import

1. Import the `_LOD0` file into its own folder.
2. Keep **Recompute Normals** and **Generate Lightmap UVs** off.
3. Unreal wraps each mesh in a large collision cage, which feels like an invisible wall.
   For each tree, open the `_leaves` mesh and the `_wood` mesh and choose
   **Collision > Remove Collision**. On the wood, add
   **Collision > Add Capsule Simplified Collision** and fit it to the trunk.

## Build the wind

Make a new **Material Function** called `MF_PropWind`. Close any material tab before a
script or tool edits the same asset, because saving the tab can overwrite those changes.

1. Connect **Object Position** and a **Constant3Vector** `0.001, 0.0015, 0` to a **Dot**, and **Add** a **Per Instance Random** to it. This keeps trees out of step.
2. First wave: multiply **Time** by `0.2`, **Add** that offset, and connect the result to a **Sine**.
3. Second wave: multiply **Time** by `0.46`, **Add** that offset, connect the result to a **Sine**, and multiply it by `0.4`.
4. **Add** the two waves.
5. Add **TextureCoordinate** with **Coordinate Index 1**. Multiply the waves by its **Mask (R)**, which holds the base of the tree still.
6. Multiply by a **Constant3Vector** `25, 8, 0`. That is the sway.
7. For flutter, connect **Absolute World Position** and a **Constant3Vector** `1, 1, 1` to a **Dot**, and divide it by `60`.
8. **Add** that to **Time** times `0.8`, and connect the result to a **Sine**.
9. Multiply by the **Mask (G)** of the same TextureCoordinate, by `1.5`, and by **Vertex Normal WS**.
10. **Add** the sway and the flutter, and connect the sum to the **Output**.

Sizes are in centimetres. In a wood material the G channel is 0, so it never flutters.

## Make the two materials

Wood, named `M_PropWood`:

1. Add a **Texture Sample** using the imported bark texture. Multiply its **RGB** by **Vertex Color**, and connect that to **Base Color**.
2. Add a second **Texture Sample** using the imported relief texture, and connect it to **Normal**.
3. Add a constant 0.85 to **Roughness**.
4. Connect `MF_PropWind` to **World Position Offset**.

Leaves, named `M_PropLeaves`:

1. Set **Blend Mode** to **Masked** and **Shading Model** to **Two Sided Foliage**. Leave **Two Sided** off: the leaf cards already have both faces, and turning it on spoils their soft shading.
2. Add a **Texture Sample** using the imported leaf texture, the one of scattered dabs.
3. Multiply its **RGB** by **Vertex Color**, and connect that to **Base Color**.
4. Multiply the same result by 0.5, and connect that to **Subsurface Color**.
5. Connect its **A** to **Opacity Mask**.
6. Add a constant 1 to **Roughness**.
7. Connect `MF_PropWind` to **World Position Offset**.

## Use them

Assign `M_PropWood` to the `_wood` mesh and `M_PropLeaves` to the `_leaves` mesh, and give
both the same **Location**. Each tree has its own leaf texture, so duplicate `M_PropLeaves`
for each new tree. Trees sway in the editor if **Realtime** is on in the viewport.

## Cartoon and Comic looks

Toon materials for Unreal are not in the kit yet. You can already export with **Look: Comic**:
the colours in the file are flat, and the leaves' light follows the round shape of each clump,
ready for a toon material of your own.
