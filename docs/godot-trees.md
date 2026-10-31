# Using easy-props trees in Godot

How to get a tree from easy-props into Godot with its leaves and wind working. Tested
on Godot 4.6 with one tree, on 2026-10-31. See [Not tested yet](#not-tested-yet) for the
parts still unproven.

## Quick checklist

For someone who has done this before:

1. Export with **Engine: Godot** and **Wind data** on.
2. Drag the exported folder into Godot's FileSystem panel.
3. For each `_LOD` file: **Import** tab, untick **Meshes > Generate LODs**, press **Reimport**.
4. Copy in `wood.gdshader` and `leaves.gdshader` once per project.
5. Make a wood and a leaves `ShaderMaterial`, and put the `_1.png` image in the leaves' **Dab Texture**.
6. Add the tree to a scene, turn on **Editable Children**, and set each mesh's **Surface Material Override**.

## 1. Export from easy-props

1. Click **Export**.
2. Set **Engine** to **Godot**.
3. Tick **Wind data** if the tree should move.
4. Choose a folder and click **Export**.

You get these files:

| File | What it is |
|---|---|
| `name_LOD0.glb` | The full-detail tree |
| `name_LOD1.glb`, `name_LOD2.glb` | Lighter versions for middle and far distance |
| `name_collision.glb` | Simple shapes for the trunk and heavy branches |
| `name.asset.json` | The settings the tree was made from |

Export does not include the wind shaders. To get them, set **Engine** to **Godot** in the
Export panel and click **Save kit…**. That writes `easy-props-godot-kit` to the folder you
choose. You only need it once per Godot project. The same files are in
`frontend/engine-kits/godot` in this repository.

## 2. Import into Godot

1. Drag the exported folder into the **FileSystem** panel.
2. Click `name_LOD0.glb` and open the **Import** tab, next to the Scene tab.
3. Untick **Meshes > Generate LODs**.
4. Check that **Meshes > Light Baking** is not **Static Lightmaps**, which would replace the wind data.
5. Click **Reimport**.
6. Repeat for the other `_LOD` files.

**Do not skip step 3.** Godot's automatic LODs delete leaf cards, so most of the crown
disappears until the camera is close. The file cannot turn this off for you.

Import also creates two images beside each GLB:

| Image | What it is |
|---|---|
| `name_LOD0_0.png` | Plain white, for the wood. It looks empty, and that is correct |
| `name_LOD0_1.png` | The leaf texture, with the transparent brush shapes |

## 3. Without wind

If the tree does not need to move, you are done. Drag `name_LOD0.glb` into your scene.
The materials from the file show the bark and leaf colours.

## 4. Add wind

### Bring in the shaders

Drag `wood.gdshader` and `leaves.gdshader` from Windows Explorer into the FileSystem panel.

### Make the materials

1. Right-click in FileSystem and choose **Create New > Resource**.
2. Search for `ShaderMaterial` and save it as `wood.tres`.
3. Do the same again and save it as `leaves.tres`.
4. Click `wood.tres`, and drag `wood.gdshader` onto **Shader** in the Inspector.
5. Click `leaves.tres`, and drag `leaves.gdshader` onto **Shader**.
6. Still on `leaves.tres`, open **Shader Parameters** and drag `name_LOD0_1.png` onto **Dab Texture**.
7. Press **Ctrl+S**.

### Put them on the tree

1. Drag `name_LOD0.glb` into your scene.
2. Right-click it in the Scene panel and tick **Editable Children**.
3. Expand it and click the `name_wood` mesh.
4. In the Inspector, drag `wood.tres` onto **Surface Material Override > 0**.
5. Click the `name_leaves` mesh and drag `leaves.tres` onto its slot **0**.

The tree should now move. If it is hard to see, set **Sway Strength** to `1` in both
materials for a moment.

### Tune the wind

These are under **Shader Parameters**. **Give both materials the same sway settings**, or
the leaves slide away from the branches.

| Setting | Does | Default | In |
|---|---|---|---|
| Sway Strength | How far the tree bends, in metres at the tips | 0.25 | Both |
| Sway Speed | How fast it bends | 1.1 | Both |
| Wind Direction | Which way the wind blows | 1, 0, 0.3 | Both |
| Flutter Strength | How far each leaf moves | 0.04 | Leaves |
| Flutter Speed | How fast the leaves shimmer | 5 | Leaves |
| Cut Off | Where the leaf shape is cut. Lower gives fuller leaves | 0.5 | Leaves |

Trees in different places sway at different moments, so a group of trees does not move
in step.

## If something looks wrong

| What you see | Cause | Fix |
|---|---|---|
| Leaves only appear when the camera is close | Godot's automatic LODs | Untick **Generate LODs** and reimport |
| Leaves are big solid polygons | **Dab Texture** is empty or has the wrong image | Set it to the `_1.png` image |
| A `_0.png` looks blank | Nothing is wrong | It is the wood's plain white image |
| Nothing moves | Exported without wind, or the materials are not applied | Re-export with **Wind data** on, and check **Surface Material Override** |
| Leaves drift off the branches | The two materials have different sway settings | Give them the same values |

## How the wind works

The tree stays a normal still mesh. easy-props stores how much each vertex may move in
the file's second UV set, which Godot reads as `UV2`. The shader does the moving on the
graphics card, so many trees stay cheap.

| Channel | Meaning | Values |
|---|---|---|
| `UV2.x` | Sway, slow bending | 0 at the base, rising with height and distance from the trunk |
| `UV2.y` | Flutter, fast shimmer | 0 on wood, 0.5 to 1 on leaves |

The **Wind** view in the easy-props viewport shows these values: red is sway, green is
flutter.

## Not tested yet

- `name_LOD1.glb` and `name_LOD2.glb` in Godot. Godot does not switch between them
  automatically. Using them means setting visibility ranges on each by hand.
- `name_collision.glb`. Its shapes are named so Godot should import them as collision with
  no extra steps, but nobody has confirmed it.
- How the leaf cut-out holds up from very far away.
- Whether the sway looks good on trees of very different sizes.
