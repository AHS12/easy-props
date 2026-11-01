# Using easy-props trees in Unreal

How to get a tree from easy-props into Unreal with its leaves and wind working. Tested
on Unreal Engine 5.8 with one kind of tree, on 2026-11-01. See [Not tested yet](#not-tested-yet)
for the parts still unproven.

An Unreal material is a binary file, so easy-props cannot ship one. You build the wind
function and two materials by hand, once per project. After that, each new tree only
needs importing and its materials assigned.

## The quick way

The Unreal kit (**Export > Engine kit > Save kit**) includes `setup_props.py`, which does
everything below for you:

1. Export with **Engine: Unreal**, **Wind data** on and **Join parts** on.
2. In the **Output Log**, switch the box at the bottom to **Cmd** and run this, with your own paths:

       py "C:/path/to/setup_props.py" "C:/path/to/export/folder"

The folder can hold one prop or many. Each prop goes to `/Game/EasyProps/<name>`, and the
shared `MF_PropWind`, `M_PropWood` and `M_PropLeaves` go to `/Game/EasyProps/Shared`. They
are made only once, so your changes to them are kept. Add a third argument to use another
place. The script needs Unreal's Python Editor Script Plugin.

With **Join parts** on, a prop is one mesh with a material slot for each material, and its
collision shapes are inside the `_LOD0` file. Place it with the Foliage tool or PCG. Without
it, you get separate meshes as described below, and the script gives the wood a capsule.

The script imports the full-detail file only. Imports use Nanite by default, which doesn't
need lighter levels.

## Quick checklist

For someone who has done this before:

1. Export with **Engine: Unreal** and **Wind data** on.
2. Import `name_LOD0.glb` into its own folder, with **Recompute Normals** off.
3. Remove the collision from `name_leaves`, and give `name_wood` a capsule.
4. Once per project: build `MF_PropWind`, `M_PropWood` and `M_PropLeaves`.
5. For each new tree: duplicate `M_PropLeaves` and set the tree's leaf texture.
6. Assign the materials to `name_wood` and `name_leaves`, and place both meshes at the same **Location**.

## 1. Export from easy-props

1. Click **Export**.
2. Set **Engine** to **Unreal**.
3. Tick **Wind data** if the tree should move.
4. Choose a folder and click **Export**.

You get these files:

| File | What it is |
|---|---|
| `name_LOD0.glb` | The full-detail tree |
| `name_LOD1.glb`, `name_LOD2.glb` | Lighter versions for middle and far distance |
| `name_collision.glb` | Simple shapes for the trunk and heavy branches |
| `name.asset.json` | The settings the tree was made from |

## 2. Import into Unreal

1. Make a folder for the tree in the Content Browser.
2. Drag `name_LOD0.glb` into it.
3. Keep **Recompute Normals** off, or the soft leaf shading is lost.
4. Keep **Generate Lightmap UVs** off, so nothing can overwrite the wind data.

You get a `name_wood` mesh, a `name_leaves` mesh and the leaf texture
`name_LOD0_texture_1`.

Unreal wraps each mesh in a large collision cage, which feels like an invisible wall:

1. Open `name_leaves` and choose **Collision > Remove Collision**.
2. Open `name_wood` and choose **Collision > Remove Collision**.
3. Still on `name_wood`, choose **Collision > Add Capsule Simplified Collision** and fit it to the trunk.

## 3. Without wind

If the tree does not need to move, you are done. Drag both meshes into your level and
give them the same **Location**.

## 4. Add wind

**Edit a material in one place at a time.** A material tab works on its own copy. If a
script or tool changes the asset while the tab is open, saving the tab can overwrite
those changes. Close the tab first.

### Build the wind function

Make a new **Material Function** called `MF_PropWind`. Its result is a sway part and a
flutter part added together.

**Tree offset,** so that trees do not move in step:

1. Add **Object Position** and a **Constant3Vector** of `0.001, 0.0015, 0`.
2. Connect both to a **Dot**.
3. **Add** a **Per Instance Random** to the **Dot**. Trees placed with the Foliage tool all
   read the same **Object Position**, so this is what keeps them apart.

**First sway wave:**

1. Multiply **Time** by a **Constant** `0.2`.
2. **Add** the Tree offset.
3. Connect that to a **Sine**.

**Second sway wave,** so that the tree does not swing like a pendulum:

1. Multiply the same **Time** by a **Constant** `0.46`.
2. **Add** the same Tree offset.
3. Connect that to a new **Sine**.
4. Multiply it by a **Constant** `0.4`.

**Sway:**

1. **Add** the first wave and the second wave.
2. Add a **TextureCoordinate** with **Coordinate Index** `1`, and a **Mask (R)** from it.
3. Multiply the waves by the **Mask (R)**. **This mask is what holds the base of the tree still.**
4. Multiply that by a **Constant3Vector** of `25, 8, 0`.

**Flutter:**

1. Multiply a **Time** by a **Constant** `0.8`.
2. Connect **Absolute World Position** and a **Constant3Vector** of `1, 1, 1` to a **Dot**.
3. Divide the **Dot** by a **Constant** `60`.
4. **Add** the results of steps 1 and 3, and connect that to a **Sine**.
5. Add a **Mask (G)** from the same **TextureCoordinate**, and multiply the **Sine** by it.
6. Multiply that by a **Constant** `1.5`.
7. Multiply that by **Vertex Normal WS**.

**Finish:** **Add** the Sway and the Flutter, connect the result to the **Output**, and
click **Save**.

### Make the wood material

Make a material called `M_PropWood`:

1. Connect **Vertex Color** to **Base Color**.
2. Connect a **Constant** `0.85` to **Roughness**.
3. Add `MF_PropWind` and connect it to **World Position Offset**.

### Make the leaves material

Make a material called `M_PropLeaves`:

1. Click the empty graph. In **Details**, set **Blend Mode** to **Masked** and **Shading
   Model** to **Two Sided Foliage**.
2. Leave the **Two Sided** checkbox off. The leaf cards already have both faces, and
   turning it on spoils their soft shading.
3. Add a **Texture Sample** using `name_LOD0_texture_1`.
4. Multiply its **RGB** by **Vertex Color**, and connect that to **Base Color**.
5. Multiply the same result by a **Constant** `0.5`, and connect that to **Subsurface Color**.
6. Connect the sample's **A** to **Opacity Mask**.
7. Connect a **Constant** `1` to **Roughness**.
8. Add `MF_PropWind` and connect it to **World Position Offset**.

The Subsurface Color lets light pass through the leaves, so the side away from the sun
does not go nearly black.

### Put them on the tree

1. Assign `M_PropWood` to `name_wood` and `M_PropLeaves` to `name_leaves`.
2. Drag both meshes into your level.
3. Give both the same **Location**, or the leaves separate from the branches.
4. Turn on **Realtime** in the viewport. The tree should now move.

### Adding another tree

You do not rebuild the wind function or the wood material. Each tree has its own leaf
texture, so:

1. Follow sections 1 and 2 for the new tree.
2. Duplicate `M_PropLeaves` and point its **Texture Sample** at the new tree's texture.
3. Assign `M_PropWood` and the new leaves material, as above.

### Tune the wind

These are all in `MF_PropWind`, so wood and leaves always sway together. Editing it
recompiles every material that uses it.

| Setting | Does | Value |
|---|---|---|
| Sway `Constant3Vector` | How far the tree bends and which way, in centimetres at full sway | 25, 8, 0 |
| First wave `Constant` | Speed of the main bend, in swings per second | 0.2 |
| Second wave `Constant` | Speed of the second wave. Keep it 2.3 times the first | 0.46 |
| Second wave strength `Constant` | How much the second wave adds | 0.4 |
| Tree offset `Constant3Vector` | How differently trees in different places move | 0.001, 0.0015, 0 |
| Flutter strength `Constant` | How far each leaf moves, in centimetres | 1.5 |
| Flutter speed `Constant` | How fast the leaves shimmer, in cycles per second | 0.8 |
| Flutter divide `Constant` | Size of the ripple. Bigger makes larger, more liquid waves | 60 |

The sway peaks at about 1.4 times the vector, when both waves line up. For a calmer tree,
try `15, 5, 0`. In `M_PropLeaves`, lower the `0.5` Subsurface Color constant to `0.25` if
the leaves look too bright.

## If something looks wrong

| What you see | Cause | Fix |
|---|---|---|
| The whole tree slides, base included | The **Mask (R)** is not connected to the sway | Reconnect it |
| The tree bends far too much | The sway vector has the wrong value | Check it reads `25, 8, 0` |
| Leaves move like liquid | Flutter is too strong or its waves too large | Use strength `1.5` and divide by `60` |
| Your changes vanish, or a tab shows an old graph | A tab with an old copy of the material was saved | Close the tab without saving, reopen it, and check the graph |
| Leaves are black on the side away from the sun | Default Lit shading | Use **Two Sided Foliage** with **Subsurface Color** |
| Leaves are too bright | Too much light passes through | Lower the Subsurface Color constant to `0.25` |
| Leaves are big solid polygons | **Opacity Mask** is not connected or the texture is wrong | Connect the sample's **A**, and use the tree's own texture |
| Black speckles in the leaves | Possibly leaf cards shadowing each other | Untick **Cast Shadow** on the leaves to test. If they go, shadows are the cause |
| Leaves separate from the branches | The two meshes have different locations | Give them the same **Location** |
| You walk into an invisible wall | The collision cage from import | Remove the collision as in section 2 |
| Nothing moves | **Realtime** is off, or exported without wind | Turn on **Realtime**, or re-export with **Wind data** on |

## How the wind works

The tree stays a normal still mesh. easy-props stores how much each vertex may move in
the file's second UV set, which Unreal reads as **TextureCoordinate** index 1. The
material does the moving on the graphics card through **World Position Offset**.

| Channel | Meaning | Values |
|---|---|---|
| `UV1` R | Sway, slow bending | 0 at the base, rising with height and distance from the trunk |
| `UV1` G | Flutter, fast shimmer | 0 on wood, 0.5 to 1 on leaves |

The **Wind** view in the easy-props viewport shows these values: red is sway, green is
flutter.

The leaf cards are shaded as one soft clump, so neighbouring leaves share almost the same
normal. Flutter pushes along those normals, which is why large flutter waves make whole
clumps swell and shrink like a liquid. Short, small waves avoid that.

Unreal's values differ from Godot's because Unreal works in centimetres and its **Sine**
does one full swing per unit, where Godot's `sin` uses radians.

## Not tested yet

- `name_LOD1.glb` and `name_LOD2.glb` in Unreal.
- `name_collision.glb` on its own. With **Join parts**, shapes inside the `_LOD0` file do import.
- How a forest moves by eye, and what its wind costs. 64 trees placed with the Foliage tool
  rendered with different **Per Instance Random** values, but that's all that was checked.
- PCG scattering.
- The steps in [Adding another tree](#adding-another-tree) by hand. The script has run on one
  tree, joined and apart.
- Whether the black speckles are fully gone.
- Whether the sway and flutter look good on trees of very different sizes.
- Other Unreal versions.
