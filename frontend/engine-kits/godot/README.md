# Wind in Godot

Export the prop with **Engine: Godot** and **Wind data** on.

## Import

1. Put the exported folder and these `.gdshader` files in your project.
2. Select each `_LOD` file, open the **Import** tab, untick **Meshes > Generate LODs**,
   and press **Reimport**. Godot's automatic levels delete leaves. Also make sure
   **Meshes > Light Baking** is not **Static Lightmaps**, which replaces the wind data.
3. Double-click the file and open **Advanced Import**, then the **Materials** tab.
   Note the names ending in `_wood` and `_leaves`.

## Make the materials

1. In the FileSystem panel, right-click and choose **Create New > Resource > ShaderMaterial**.
   Save it as `wood.tres`. Make another called `leaves.tres`.
2. Open `wood.tres` and set **Shader** to `wood.gdshader`.
3. Open `leaves.tres` and set **Shader** to `leaves.gdshader`.
4. Still on `leaves.tres`, open **Shader Parameters** and set **Dab Texture** to the image
   the import made beside the file, the one ending in `_LOD0_1.png`. The `_0.png` is plain
   white, and with it the leaves show as solid polygons.

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
| Sway Strength | How far the whole tree bends, in metres at the tips |
| Sway Speed | How fast it bends |
| Flutter Strength | How far each leaf moves |
| Flutter Speed | How fast the leaves shimmer |
| Wind Direction | Which way the wind blows |
