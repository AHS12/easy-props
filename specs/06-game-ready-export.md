# 06 — Game-ready export

Status: Done. All four phases are built and tested in code, and wind works on one tree in both engines. Never checked by hand: Godot collision, and LOD1, LOD2 and long distance in both engines.

### Phase 2 notes

- **Wind data depends only on position**, measured against the full-detail prop, so wood
  and leaves agree at a twig and every level moves alike. The extent is in `asset.json`.
- **Heatmap** is a Wind shading mode. Red is sway, green is flutter.
- **The kits live in `frontend/engine-kits/`**, not the repository root, so the app can
  ship them. "Save kit…" in the Export panel writes one to a folder.
- **The Unreal kit is written steps without a screenshot**, and no node snippet or Python
  script. A script that builds the materials is the likely next step.
- **The Godot kit works** on one tree, tested 2026-10-31: it sways with its leaves
  attached once the leaf texture is set. [`docs/godot-trees.md`](../docs/godot-trees.md)
  has the steps.
- **The Unreal wind works** on one tree in UE 5.8, tested 2026-10-31.
  [`docs/unreal-trees.md`](../docs/unreal-trees.md) has the steps. It needed a second sway
  wave, a smaller and shorter flutter than Godot's, and Two Sided Foliage on the leaves. The
  guide's steps were checked against that graph, not followed from scratch on a new tree.

### Phase 4 notes

- **The rename reached the code and the Go bindings** (`PropGenerator`, `ListProps`). The
  frontend's own `listTrees`-style helpers, saved files, the library folder and the
  scene's `kind: 'tree'` keep their names, so saved files stay readable.
- **Moved out of `assets/trees`:** the surface-nets mesher, the dab texture and both
  registries. The leaf-card builder stayed, because cards are planned from a tree's clumps;
  it moves when something other than the tree planner needs it.
- **A palette's stone colours** sit beside it in `assets/style/palettes.ts`, keyed by the
  same palette id, because a tree's custom colours are stored as the palette's own fields.
- **Rocks needed one export change, made generic:** `sways()` on a source, so any still
  prop skips wind. A rock has no other export code.
- **Foliage props are painted trees** with a new Stem height control and wider ranges.
  They are built from fronds and clumps as planned, so grass is broad blades, not fine
  blades. Each is tested to fit Background at LOD0 and Mobile at LOD2.
- **A prop already under the Mobile budget** need not hit a level's share, since it has
  little left to lose. The test allows this.

### Phase 1 notes

- **Tolerance on "within 25%".** 50 of the 56 presets meet it at every level. At LOD2,
  birch and scots-pine are slightly too light, and banana, dead-oak, burnt and
  round-canopy are too heavy. The test lists each with its allowance.
- **Fruit at LOD2** keeps one in three on leafy clumps rather than none, because
  dropping it all changes a fruit tree's colour.
- **"Reaches beyond the wood by more than 10%"** is measured against the length of
  the collision shape.
- **The roots sit below the origin.** The pivot is where the trunk meets the ground.
- **Viewport level preview** is three buttons on the viewport toolbar. A budget always
  counts full detail, whichever level is showing.
- **Leaves vanishing in Godot** came from its automatic LODs. Whether the cut-out also
  fades at long distance is still to be seen, in both engines. A GLB cannot carry
  hand-made mipmaps, so a cut-out fix would have to change the texture or its cut-off value.
- **A mesh with no texture of its own gets a plain white one**, so a file can hold two
  images. See the Unreal row of the table below.
- **Unreal makes its own collision on import.** It wrapped each mesh in a large convex
  cage, which a player meets as an invisible wall well before the trunk. Removing the
  collision from the meshes in Unreal cleared it (tested 2026-10-31). Unreal does not
  use `{name}_collision.glb` unless it is applied by hand.

### Phase 3 notes

- **Variations.** The first of each is the prop exactly as it is. The rest are its
  settings on a seed derived from the variation's number, which is why a batch repeats.
  A saved prop's hand edits follow it to a new seed only where those parts still exist.
- **Numbering** runs per name across the whole batch, so two props with the same name
  never overwrite each other. A later batch does replace files with the same names,
  and the panel says so.
- **The detail levels and collision** come from the choices in the Export panel.

## The goal

A prop goes from sliders to running in a game in minutes, without opening Blender
to fix it. Unreal Engine and Godot are the destinations. Blender stays available
for edge cases and for converting a file to FBX.

Everything here is built for props in general. Trees are the first user, rocks
prove it works for anything else.

## Scope

| Phase | Features |
|---|---|
| 1. Game-ready export | Merged meshes, clean export setup, detail levels, collision, budget checks |
| 2. Wind | Wind data, starter materials |
| 3. Production speed | Batch export |
| 4. Beyond trees | Generic pipeline proven, shared style, rocks, foliage props |

### Not in this plan

- **FBX export.** GLB is the only format we write. Blender converts when needed.
- **Far-distance images** (impostors). Detail levels cover most of the need first.
- **Bark textures and UVs.** Only matters for close-up shots.
- **Constructed props** such as fences and crates. They need their own parts and
  assembly system, and their own spec.
- **Forest placement, in-app wind simulation, engine lighting.** These belong to
  the engine.

## What we know and what we do not

Checked against vendor documentation on 2026-10-31.

| Question | Answer | Confidence |
|---|---|---|
| Does Godot read our GLB? | Yes, glTF is a supported scene import | Documented |
| Does Godot make LODs itself? | Yes, with meshoptimizer on import, automatically | Documented |
| Can Godot use LODs we made? | Not through that system. Authored levels go through visibility ranges | Documented |
| How is Godot collision named? | `-col`, `-colonly`, `-convcolonly` name suffixes | Documented |
| Does Unreal import GLB? | Yes, through Interchange | Documented |
| Does Unreal read LODs from a GLB? | Unknown. FBX LOD groups are documented, glTF is not | **Test needed** |
| Does Unreal read `UCX_` collision from a GLB? | Unknown. Documented only for FBX | **Test needed** |
| Does Unreal keep our normals and vertex colours? | Yes for both, on one tree seen by eye. But its generated material ignored vertex colours on a mesh with no texture, so every mesh now has one | Tested 2026-10-31, the white texture brought the bark marks back |
| Does a two-sided material keep the soft leaf shading? | Unknown. glTF flips the back-face normal, which is why leaves carry both windings today | **Test needed** |
| Does automatic reduction suit leaf cards? | No. Godot's deleted most of a crown, and turning off Generate LODs on import brought it back. A GLB cannot carry that setting, so the export panels say so | Tested 2026-10-31 |

Blender opening a file proves nothing about the unknowns above, because Blender
does not use these engine conventions. The design below therefore does not depend
on any of them, and reading everything from one file is added later if the tests
allow it.

## The pipeline

Today `exportGLB` writes one mesh per component, with tree knowledge in the
generators and none in the exporter. That is the right place to build on.

```
Generator (tree, rock, ...)
    │  parts, each tagged with what it is
    ▼
Build at a detail level          ← repeated for each level
    ▼
Merge by material
    ▼
Add wind data                    ← only if the prop asks for it
    ▼
Collision shapes                 ← from the generator, once
    ▼
Budget check → Package → Write
```

New module: `frontend/src/core/export/pipeline/`. `glb-exporter.ts` becomes the
last step, and keeps its guarantee that a broken coordinate is never written.

### What a generator has to provide

```ts
/** What a part is made of, which decides how the pipeline treats it. */
type PartRole = 'solid' | 'foliage' | 'thin'

interface GeneratedPart {
    // ...as today
    readonly role?: PartRole
}

interface ExportSource {
    /** The parts of this prop at a share of its full detail, 1 down to about 0.1. */
    buildAtDetail(detail: number): readonly GeneratedPart[]
    /** Simple solid shapes, in the prop's own space. Empty for none. */
    collision(): readonly CollisionShape[]
    /** How much each vertex sways. Absent for a prop that does not move. */
    wind?(position: Vec3, part: GeneratedPart): WindWeight
}
```

The pipeline may not import anything from `assets/trees`. A test holds this.

## Phase 1: game-ready export

### 1. Merged meshes

A tree exports as two meshes, not one per clump or frond.

| Mesh | Holds | Material |
|---|---|---|
| `{name}_wood` | Bark | Opaque, vertex colours |
| `{name}_leaves` | Clumps, fronds, strands, fruit | Cut-out, vertex colours, dab texture |

- Each part's transform is baked in before merging.
- A prop with one material exports as one mesh.
- The viewport keeps its separate parts, because they are what you click. Merging
  happens only in the export.
- Hand edits survive, because the export builds from the same plan.

**Done when:** every preset exports with at most 2 meshes and 2 materials, with the
same triangle count and bounds as before merging.

### 2. Clean export setup

- Pivot at the centre of the base, on the ground, at the origin.
- One unit is one metre, and height matches the Height slider.
- Names come from the prop: `oak_01_wood`, never `foliage-cluster_cmp-clump-l0b1_mesh`.
- The dab texture is embedded once, not once per part.
- The file name comes from the saved prop's name, not `my-tree.glb`.
- A hidden click tube never reaches a file (already true, and now tested per level).

**Done when:** a test reads an exported file back and checks pivot, bounds, names,
mesh count and texture count.

### 3. Detail levels (LOD)

Three levels, each its own GLB.

| Level | Target, against full detail | For |
|---|---|---|
| LOD0 | 100% | Near |
| LOD1 | About 40% | Middle distance |
| LOD2 | About 12% | Far |

| Role | How it gets lighter |
|---|---|
| Solid | Re-meshed from the same field on a coarser grid, so it stays one clean surface. `prepareBark` already takes a detail value |
| Thin | Fewer rings and sides, then dropped, smallest first |
| Foliage cards | Fewer cards, each larger, so the covered area and silhouette hold |
| Fronds and strands | Fewer leaflets, each wider |
| Fruit | Fewer sides, then dropped at LOD2 |

Rules that keep a level from visibly popping:

- A lower level keeps a subset of the cards above it, chosen by a stable hash. It
  never rerolls them.
- Colours and shading normals stay the same function of position, so a level
  changes shape and not tone.
- The silhouette matters most. A test compares each level's bounding box with
  LOD0 and allows 10%.

The viewport gets a level preview, so a level can be judged before exporting.
Export presets choose how many levels to write.

Bark takes tens of milliseconds and a tree has three levels, so a whole export runs
on the existing worker pool, with progress shown.

**Done when:** every preset meets its targets within 25% at each level, levels line
up by eye when switched in the viewport, and the file for each level imports.

### 4. Collision

Simple shapes for the wood, and none for leaves, so a player walks through a crown
and into a trunk.

- Tapered prisms along the trunk and the heaviest limbs. A straight prism is convex
  by construction, so nothing needs decomposing.
- At most 8 shapes per prop, heaviest wood first, and about 8 sides each.
- Written to `{name}_collision.glb`, with names set by the engine preset:

| Engine | Node name | Status |
|---|---|---|
| Godot | `{name}_0-convcolonly` | Documented |
| Unreal | `UCX_{name}_LOD0_00` | Documented for FBX, test for GLB |

If Unreal does not read these from a GLB, the file still works as a shape to apply
by hand, and the import notes say how. Collision can be switched off per export.

**Done when:** every preset produces valid closed convex shapes, no shape reaches
beyond the wood it follows by more than 10%, and Godot imports them as collision
with no manual step.

### 5. Budget checks

You pick what a prop is for, and the app says whether it fits.

| Target | LOD0 faces | Draw calls |
|---|---|---|
| Hero | 30,000 | 2 |
| Standard | 14,000 | 2 |
| Background | 5,000 | 2 |
| Mobile | 2,000 | 2 |

Starting values from common practice, not measurements, and all editable in
settings. The status bar shows the current count against the target. Going over
warns and never blocks an export. A warning names what is costing most, such as
"Leaves are 82% of this tree. Lower Leaf density or Clumps."

**Done when:** the number shown equals what a test counts in the exported file, for
every preset.

### Export dialog

Replaces the immediate save-as. Beginners press Export and get good defaults.

| Control | Default |
|---|---|
| Engine | Remembers the last choice: Unreal, Godot or Plain GLB |
| Name | From the saved prop |
| Detail levels | 3 |
| Collision | On |
| Wind data | On for props that move |
| Folder | Remembers the last folder |

It shows the list of files and their face counts before writing. Writing a folder
needs a new Go binding (`ChooseFolder`, `WriteFiles`) beside the existing
`SaveFileDialog` and `WriteFile`.

### What gets written

```
oak_01/
  oak_01_LOD0.glb
  oak_01_LOD1.glb
  oak_01_LOD2.glb
  oak_01_collision.glb
  oak_01.asset.json
```

`asset.json` holds the generator, its version, every parameter, the seed, the face
counts and the app version. The prop can be regenerated or inspected from it later,
and a build script can read it.

## Phase 2: wind

Wind is shared work. This app stores how much each vertex may move. A material in
the engine does the moving, every frame, on the graphics card. So the prop stays a
still mesh and a forest stays cheap.

### 6. Wind data

Written to the second UV set (`TEXCOORD_1`), because the vertex colours already hold
the paint. The Godot tutorial and most examples use vertex colours, so our materials
have to read this channel instead.

| Channel | Meaning | Tree |
|---|---|---|
| U | Sway, the whole tree and its big limbs | 0 at the base, rising with height and with distance from the trunk |
| V | Flutter, fast and small | 0 on heavy wood, 1 at leaf and frond tips |

- A plan knows every limb and where a leaf sits, so this needs no painting.
- Fronds and strands sway from their base, so a frond bends instead of sliding.
- A heatmap view in the viewport shows the values, using the shading modes already
  there. In-app animation is not planned.
- All detail levels use the same values at the same positions.

Rotating about each branch's own pivot, as Pivot Painter does, looks better and costs
more. It is only added if the simple version looks poor on a real tree.

**Done when:** values are finite and in 0–1, trunk bases are 0, and they pass through
the export read back from the file.

### 7. Starter materials

A wind material does nothing unless it is set up in the engine, and without a
material the vertex colours do not show at all. So we ship one kit per engine, with
both jobs done.

| Engine | Delivered as | Notes |
|---|---|---|
| Godot | `.gdshader` files for wood and leaves, plus a one-page setup | Text files, so they ship ready to use |
| Unreal | A material recipe with a screenshot of the node graph, plus a copy-and-paste node snippet or an editor Python script if testing shows either is reliable | `.uasset` files are binary, so we cannot generate one |

Kits live in `engine-kits/` and can be saved to a folder from the app. Each covers
the import settings that matter, above all keeping the file's normals in Unreal,
since recomputing them would lose the soft shading.

**Done when:** you have seen a tree sway correctly in both engines from the written
steps alone, on one try.

## Phase 3: production speed

### 8. Batch export

- Pick presets or saved props, and how many seed variations of each.
- Files go in one folder, named `oak_01`, `oak_02`, and so on.
- Runs in the background with progress and can be cancelled. The interface stays
  usable, and one failure does not stop the rest.
- Ends with a summary: how many, total size, which went over budget.

**Done when:** 50 variations export without blocking the interface, and running the
same batch twice gives identical files.

## Phase 4: beyond trees

### 9. Generic pipeline

Written generically from the start of Phase 1. This is where that gets proven.

- Move what is not about trees out of `assets/trees`, such as the distance-field
  mesher and the leaf-card builder.
- Rename `TreeGenerator` to `PropGenerator`, and `ListTrees`-style Go bindings to
  match, keeping saved files readable.
- The Rock and Bush tabs become real.

### 10. Shared style

Palettes and painting rules move to `assets/style`, so a rock and an oak belong to
the same game. A palette has wood, leaf and stone colours, and a pack can share one.

### 11. Rocks

Rocks, boulders and cliffs, from the same field and surface nets as bark. Solid only,
so no wind and one mesh.

**This is the test of the pipeline.** If rocks need any change in
`core/export/pipeline`, that change is made generic before moving on.

**Done when:** a rock gets merging, levels, collision, budgets and batch export with
no rock-specific export code.

### 12. Foliage props

Bushes, ferns, grass and flowers, using clumps and fronds. Small props need a much
lower budget than trees, so their cards and leaflets get tested at the Background
and Mobile targets.

## Your part

Nobody can run Unreal or Godot from this environment, so each of these needs you.

| When | Check | Decides |
|---|---|---|
| Start of Phase 1, on one hand-made test file | Import into Unreal and Godot. Do normals, colours, cut-outs and scale look right? Do named LODs and collision get picked up? | Whether one file can carry everything |
| Same test | Try a two-sided leaf material | Whether leaf triangles can be halved |
| End of Phase 1 | A full tree with its levels and collision in both engines | Whether Phase 1 is done |
| End of Phase 2 | The wind kits, following only the written steps | Whether the steps and the look are good enough |

The first check comes first because it is cheap and can change the file layout.

## Effort

Rough, and measured in working sessions about the size of the 55-preset batch.

| Phase | Sessions |
|---|---|
| 1. Game-ready export | 3–4 |
| 2. Wind | 2 |
| 3. Production speed | 1 |
| 4. Beyond trees | 3–4 |

## Risks

| Risk | If it happens |
|---|---|
| Unreal ignores LODs and collision in a GLB | Separate files already work. Assign by hand, or script it with the kit's Python |
| Unreal recomputes or loses our normals | Document the import setting. If it cannot be kept, this blocks the look and comes before all else |
| LOD2 leaves look thin or blocky | Larger cards first. Far-distance images come back into scope |
| Merged leaves overdraw badly | Reduce overlap in the inner card layer, which is mostly there to hide the sky |
| Simple wind looks like wobbling | Tune the values, then consider per-branch pivots |
| Batch memory grows | Build one prop at a time and dispose before the next, as the exporter already does |

## Sources

- [Godot: node type customization on import](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/node_type_customization.html)
- [Godot: mesh level of detail](https://docs.godotengine.org/en/stable/tutorials/3d/mesh_lod.html)
- [Godot: making trees sway](https://docs.godotengine.org/en/4.2/tutorials/shaders/making_trees.html)
- [Unreal: FBX import options](https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-import-options-reference-in-unreal-engine)
- [Unreal: importing with Interchange](https://dev.epicgames.com/documentation/en-us/unreal-engine/importing-assets-using-interchange-in-unreal-engine)
- [Unreal: Pivot Painter](https://docs.unrealengine.com/4.26/Resources/ContentExamples/PivotPainter)
- [Wind in production, Book of the Dead](https://origin.80.lv/articles/book-of-the-dead-using-megascans-setting-up-wind-and-more/?amp=1)
- [UE 5.5 report on UCX with grouped LODs](https://forums.unrealengine.com/t/ucx-collisions-not-importing-with-lods-in-unreal-engine-5-5/2382620), one user's report
