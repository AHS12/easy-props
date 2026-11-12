# easy-props in Godot

Export the prop with **Engine: Godot** and **Wind data** on.

## Import

1. Put the exported folder in your project. With **Materials** on when you export, the
   `.gdshader` files for your look and `easy_props_import.gd` are already in it. Otherwise,
   add them from this kit.
2. Set this up once for the whole project, so every prop imports right, now and later. Open
   **Project > Project Settings > Import Defaults** and choose **Scene**. Set **Import Script >
   Path** to `easy_props_import.gd`, untick **Meshes > Generate LODs**, and press **Save**.
   Then select the exported files, open the **Import** tab, and press **Reimport**.
   - From Godot 4.7, props come in white without the import script: Godot leaves off the
     colours easy-props paints on them. The script turns them back on, each time the file
     is imported. Godot 4.6 and earlier don't need it, but it does no harm.
   - Godot's automatic detail levels delete leaves, so a tree looks bare from a little way
     off. Use the levels in the export instead.
   - Make sure **Meshes > Light Baking** is not **Static Lightmaps**, which replaces the
     wind data.
3. Double-click the file and open **Advanced Import**, then the **Materials** tab.
   Note the names ending in `_wood` and `_leaves`.

## Make the materials

1. In the FileSystem panel, right-click and choose **Create New > Resource > ShaderMaterial**.
   Save it as `wood.tres`. Make another called `leaves.tres`.
2. Open `wood.tres` and set **Shader** to `wood.gdshader`.
3. Under **Shader Parameters**, use the images the import made beside the file: set **Bark
   Texture** to the one ending in `_LOD0_0.png` and **Relief Texture** to `_LOD0_1.png`.
4. Open `leaves.tres` and set **Shader** to `leaves.gdshader`.
5. Under **Shader Parameters**, set **Dab Texture** to the image ending in `_LOD0_2.png`.
   With the wrong one, the leaves show as solid polygons.

For a tree of a different kind, the numbers can differ. Open the image to check it: bark is
pale, relief is blue-purple, and leaves are scattered dabs.

## Use them

1. Drop the `_LOD0` file into a scene and select the node.
2. Right-click it and tick **Editable Children**.
3. Select each mesh and set **Surface Material Override > 0** to the matching material.

If you exported with **Join parts**, there is one mesh with a surface for each material.
Set **Surface Material Override > 0** and **> 1**, matching the names you noted above.

## Change the look

The settings are under **Shader Parameters**. Give both materials the same sway
settings, or the leaves slide away from the branches.

| Setting | Does |
|---|---|
| Relief Strength | How deeply the bark looks carved |
| Sway Strength | How far the whole tree bends, in metres at the tips |
| Sway Speed | How fast it bends |
| Flutter Strength | How far each leaf moves |
| Flutter Speed | How fast the leaves shimmer |
| Wind Direction | Which way the wind blows |

## Cartoon and Comic looks

The kit also has toon materials. They move in the wind as the ones above do.

| Look | Wood | Leaves |
|---|---|---|
| Cartoon: light in soft bands | `wood_cartoon.gdshader` | `leaves_cartoon.gdshader` |
| Comic: flat colours and hard, deep shadows | `wood_comic.gdshader` | `leaves_comic.gdshader` |

For Comic, export with **Look: Comic**. That makes the colours in the file flat and turns the
leaves' light to follow the round shape of each clump, so a crown shades in one piece. Cartoon
works with props exported in any look.

Make the materials as above, with the toon shader in place of `wood.gdshader` and
`leaves.gdshader`. They take the same textures. The Comic wood material leaves the relief
texture out, so you can skip it.

Comic is made for one sun, a **DirectionalLight3D** with shadows on. Other lights add light but
no shadow colour. The scene's ambient light lifts the shadows, so keep it low: in your
**WorldEnvironment**, set **Ambient Light > Energy** to about 0.3. **Colour Boost** and **Shadow
Darkness** under **Shader Parameters** tune the colours.

## Outlines

`outline.gdshader` draws dark lines around shapes over the whole picture. It needs the
**Forward+** renderer, which is Godot's default for desktop.

1. Select your **Camera3D** and add a **MeshInstance3D** as its child.
2. Set its **Mesh** to a new **QuadMesh**, and the QuadMesh's **Size** to 2 by 2.
3. Under **Geometry**, set **Extra Cull Margin** to the largest value it takes, so the lines
   never switch off.
4. Set **Material Override** to a new **ShaderMaterial** with `outline.gdshader`.

| Setting | Does |
|---|---|
| Line Width | Width in pixels. 3 for Comic, 1.5 for Cartoon |
| Line Strength | How dark. 1 for Comic, 0.45 for Cartoon |
| Depth Gap | How far behind a surface must be to get a line. Raise it if leaf crowns get speckled |
| Gap Size | Gaps among leaves narrower than this go without a line |

The lines are found from how far away each point is, so a crown gets a few more small marks
than in the app, and the far edge of a ground that ends against the sky gets a line too.
