# Organic trees: geometry that holds together, and leaves that look like leaves

Research and plan. **Superseded by [05-painted-trees.md](./05-painted-trees.md)**: the
space-colonization tree was built and retired, because it aimed at realism rather than the
stylized look this tool is for. Kept for the research: the leaf rendering, licensing and
asset pipeline notes still apply.

The current trees are assembled, not grown. Every limb is a separate tapered tube placed
by an analytic curve, and every leaf is a blob on a tip. That is fine for blocks of green
and it is why the trees read as "stylised" rather than "wrong" — but it cannot reach the
reference picture, where every twig visibly descends from a thicker one, and where the
crown is a mass of individual leaves rather than clumps.

Two separate problems, needing two separate answers:

1. **Bark.** The branch graph must be generated first, as data, and the geometry swept
   over it, so that a branch cannot be anywhere its parent is not.
2. **Leaves.** A leaf needs to be leaf-shaped. That means cards with a leaf silhouette,
   gathered into shoots and pads, not spheres with noise.

---

## 1. Why the current trees have floating branches

All six causes are in `assets/trees/branching-tree-generator.ts`, and five of them are
one-liners to explain.

### 1.1 Children are placed on an analytic curve, not on the built geometry

`branchLocalPoint()` computes a branch's spine as `y = length · bend · t²`, and children
are placed with it:

```ts
const local = branchLocalPoint(parent.parameters, along)
const worldStart = local.applyQuaternion(parent.quaternion).add(parent.worldStart)
```

But the branch that is actually *drawn* is built by the part generator from
`spinePointPosition(point, 'outward', length, twist)` — which applies twist, and which
uses `parameters.spine`, the editable handle list. So:

- a dragged handle moves the drawn branch but not its children;
- any non-zero twist moves the drawn branch but not its children;
- `branchLocalPoint` ignores twist entirely.

This is the literal answer to "disconnecting branch leaves": the generator computes
attachment points from a curve that is no longer the shape on screen. It is only correct
while nobody has touched a handle and twist is zero.

### 1.2 No shared joint

Each limb is an independent tube with `capBase: true, capTip: true`. Two capped tubes
meeting at a point are two solids intersecting, not one tree. At any real angle you get a
seam, a visible plug, or a darkness where the caps meet — and a hole as soon as the child
thins below the parent's surface curvature. A tree is a single continuous surface; ours is
a pile of separate ones.

### 1.3 Radii are invented per branch

```ts
const trunkRadiusHere = parameters.trunkRadius * (1 - t * 0.55)
const baseRadius = Math.max(trunkRadiusHere * randomRange(random, 0.22, 0.34), 0.012)
```

and for children, `parent.baseRadius * 0.6` regardless of how many children there are.
This has no relation to the pipe model, so:
- three children of one parent get three times the cross-section their parent had;
- a branch's thickness does not depend on how much tree is above it;
- twigs are too fat (0.6 of parent) at depth 1 and far too fat at depth 3.

In the reference picture, thickness is a smooth field over the whole tree. Ours is a
random walk.

### 1.4 Angles are random draws, not a rule

`branchAngle + randomRange(-12, 12)`, `bend = randomRange(0.25, 0.7)`,
`curl = randomRange(-0.25, 0.25)`. Real trees obey insertion rules: the child leaves the
parent at a roughly constant angle, and the parent is deflected by its children. Random
angles produce the "spray" look — plausible individually, incoherent together.

### 1.5 Leaves are attached by cycling, not by growth

```ts
const node = tips[i % tips.length]
const along = 0.75 + (i / foliageCount) * 0.25
```

Leaf count is independent of tip count. With 20 tips and 60 clumps, three clumps land on
each tip at three different heights; with 2 tips and 60 clumps, all 60 pile onto two
branches. Nothing about the placement knows how a shoot works, so clumps read as
suspended blobs — which is exactly what they are.

### 1.6 No crown envelope

Branches are placed from 32% to 94% of trunk height with independent lengths, so the
silhouette is an accident. The reference tree's crown is an *envelope*: dense at the
surface, thinning inward, with a recognisable outline.

---

## 2. The math that fixes it

### 2.1 Skeleton first, geometry second

The single change that fixes 1.1, 1.2, 1.3 and 1.4 at once: generate the tree as **data**
before generating a single vertex.

```ts
type SkeletonNode = {
    readonly id: string
    readonly parentId: string | null
    readonly position: Vec3          // where this node sits in world space
    readonly radius: number          // from the pipe model, not from a random draw
    readonly order: number           // Strahler: 1 = twig, higher = closer to the trunk
    readonly direction: Vec3         // tangent leaving the parent
}

type Skeleton = {
    readonly nodes: readonly SkeletonNode[]
    readonly params: GrowthParameters
    readonly seed: number
}
```

Everything else is derived from the skeleton:

- the trunk and branch meshes are sweeps over node chains;
- leaf clusters are attached to nodes by order and position;
- the handles in the viewport move **skeleton nodes**, and every child moves because it
  is defined relative to them;
- a component's parameters become a *reference* into the skeleton (a node range), not a
  copy of a curve.

This keeps the current per-part regeneration and per-part editing, and it deletes the
class of bug in 1.1 rather than patching an instance of it. A child's start position is
its parent node's position, by definition; there is no second curve to drift.

### 2.2 Branching rule: space colonization

The reference picture is unmistakably space colonization or a close relative (the
commercial "The Grove" grows trees the same way). Runions, Lane & Prusinkiewicz, *Modeling
Trees with a Space Colonization Algorithm* (Eurographics NPH 2007). It is short, cheap, and
it produces branching that looks grown because it is: branches compete for space.

```
A ← sample N points inside the crown envelope      # attractors
S ← { root node }                                  # skeleton

while A is not empty and |S| < maxNodes:
    for each attractor a in A:
        find n = nearest node with |a − n| < d_i          # perception radius
        if n exists: associate a with n, keep the closest
    for each node n that has attractors:
        d ← normalize( Σ (a − n)/|a − n|  +  w_light·up  +  w_grav·down )
        create child c at n + d · step, parent n
        remove every attractor within d_k of c             # kill distance
    A ← A minus removed attractors
```

Parameters, and what a beginner should see:

| Math | Slider | What it changes |
|---|---|---|
| `N` attractor count | **Fullness** | How dense the crown is; more attractors, more twigs |
| `d_i` perception radius | **Branch spread** | Long smooth limbs (large) vs busy, twiggy (small) |
| `d_k` kill distance | **Twig density** | How close two twigs may grow |
| `step` | *(internal)* | Segment length; affects smoothness and node count |
| `w_light · up` | **Reach for light** | How strongly branches climb |
| `w_grav · down` | **Droop** | How much weight bends limbs down |
| envelope shape | **Crown shape** | Ellipsoid / cone / dome / irregular |
| envelope noise | **Irregularity** | How ragged the silhouette is |

Cost: naive nearest-attractor search is O(N · nodes). With a uniform spatial hash it is
linear in practice; 2,000 attractors and ~1,500 nodes is a few milliseconds in JS, tens at
worst. Two quality levels is enough — a coarse one while a slider is being dragged, full
quality on release — which is the pattern the store already uses for previews.

**Space colonization alone is not enough.** It produces a *polyline* branch graph with
uniform-ish twigs. Three post-passes make it a tree:

1. **Strahler order** — label every node by branching depth. Order drives length, radius
   and leaf attachment, so a twig is never thicker than its parent's branch.
2. **Pipe model radii** (below).
3. **Insertion offset** — children grow out of the parent's *side*, distributed by
   phyllotaxis, not out of its centre line. This is what gives real trees their
   two-and-a-half-dimensional feel and it is invisible in the raw algorithm.

**The alternative: Weber–Penn.** The parametric model behind most "procedural tree"
tools: explicit levels with counts, length ratios, angles, curve back/down, taper, whorls.
It is faster, fully deterministic per level, and gives textbook-shaped trees — but it
looks like a parametric tree, and its angles are the random draws we already have. Use it
for *preset silhouettes* if needed; use space colonization for the picture.

### 2.3 Radii: the pipe model (da Vinci's rule)

The cross-section feeding a branch must equal the sum of its children's:

```
r_parent^n = Σ r_child^n          n ≈ 2 … 2.5
```

`n = 2` conserves area (Shinozaki's pipe model: cross-section ∝ leaf area above).
Measurements on real trees put `n` near **2.49** (Eloy & Fournier's da Vinci rule fits).
Practically: take `n = 2.3`, clamp twigs at a minimum radius, and radii become a smooth
field from trunk to twig with no arbitrary per-branch factor.

Consequences worth having: a trunk with many branches is thick; removing branches
regenerates thinner ones; and a twig can never be fatter than what carries it.

Also from real trees, and cheap to add:

- **Insertion angle** roughly constant per species (25–60°), with the parent deflected by
  the child — Clarkson's rule: the mother branch bisects the angle between her daughters.
- **Length ratio** per order around 0.6–0.8 of the parent, not a random 0.5–0.8.
- **Gravity** bends higher-order limbs down; the trunk stays vertical. Together with
  light-seeking this is what makes a crown look heavy rather than sprayed.

### 2.4 Sweeping without seams

Two things, both standard:

- **Rotation-minimising frames** (parallel transport / double reflection) instead of
  deriving a frame from the tangent each step. Tangent-derived frames flip at inflection
  points, which twists the bark texture and pinches the tube; ours will too as soon as
  branches curve properly.
- **Junctions are bridged, not capped.** At a branch point, create a ring on the parent
  at the insertion, share those vertices, and bridge to the child's first ring. Caps only
  at real tips (`capBase: false` whenever a parent exists). Radius at the join is the
  parent's local radius, tapering into the child's — not an independent number.

Because the skeleton already guarantees positions, this turns "branches meet" from a hope
into a construction.

### 2.5 Crown envelope

Sample attractors inside a shape, not a box: `(x/a)² + (y/b)² + (z/c)² = 1` for a dome or
ellipsoid, a cone for conifers, then push each sample outward by noise on the sphere
(`1 + 0.15·noise(θ, φ)`) for irregularity. The result is a crown with a *silhouette* you
can dial, which is how the reference gets its recognisable outline.

### 2.6 Leaves: distribution, not decoration

- **Phyllotaxis.** Successive leaves around a shoot at the golden angle,
  `137.5° = π(3 − √5)` — the same constant already in the generator for branch azimuth,
  applied one level down to leaves.
- **Shoots, not sprinkles.** A leaf-bearing unit is a short final-order segment with ~3–8
  leaves along it, each rotated ~30–70° off the shoot axis and drooping under its own
  weight. This is what makes the reference's pads read as foliage rather than confetti.
- **Pads.** Groups of shoots share a parent, so the crown has local density variations —
  bright lumps at the surface, darker gaps behind them. Straightforward: attach leaves by
  *node*, and let the node distribution come from the skeleton.
- **Orientation to light.** Leaf normals blend outward, up, and toward the light, then
  jitter — real leaves are not random but they are not aligned either.
- **Falloff.** Leaf size shrinks toward the crown interior and near the envelope edge.

---

## 3. Leaves that look like leaves

### 3.1 Three representations, chosen by distance

| Level | What it is | Tris | Use |
|---|---|---|---|
| **L0 leaf** | one quad with a leaf silhouette, or 4–6 tris of actual leaf shape | 2–6 | close up, editor default |
| **L1 cluster** | one quad carrying a baked cluster of ~20 leaves, crossed in 2–3 planes | 4–12 | mid distance, thumbnails, gallery |
| **L2 billboard** | one camera-facing quad per crown, baked | 2 | far, many props in a scene |

The reference picture is L0 leaves arranged into L1-looking pads: many individual leaves,
each 2–6 tris. A 20-cluster tree at 30 leaves per cluster is 600 leaves ≈ 1,800 tris of
foliage plus a few thousand for bark. That is a nothing budget. The thing that must never
happen is one draw call per leaf: leaves go into a single `InstancedMesh` per tree (or one
merged `BufferGeometry`), so the whole crown costs one call.

### 3.2 Alpha-tested cards, not transparent ones

The classic own-goal in three.js foliage:

```ts
// wrong for leaves: sorting artifacts, shadow bugs, overdraw
new THREE.MeshStandardMaterial({map, transparent: true})

// right: cut out, depth-write, no sorting
new THREE.MeshStandardMaterial({
    map, alphaTest: 0.5, transparent: false, depthWrite: true,
    side: THREE.DoubleSide, alphaToCoverage: true,
})
```

`alphaToCoverage` with MSAA gives soft edges without sorting. Add:
- a **normal map** (or a "bent normal" trick: lerp the leaf normal toward the crown's
  outward direction) so cards read as volume rather than paper;
- **backlight/subsurface approximation** — leaves lit from behind glow; a cheap term in
  `onBeforeCompile` does more for believability than doubling the leaf count;
- **per-instance colour jitter** (a slight hue/value offset per leaf or per cluster) so a
  thousand copies of one texture do not read as one texture.

### 3.3 Where the leaf art comes from

Two layers, and the order matters:

1. **Leaf mesh/geometry: ours.** A handful of leaf outlines (oval, lobed, needle, palm
   frond segment) as small procedural meshes, generated from the same parameters as the
   tree. This keeps our style coherent and stays editable — "leaf shape" becomes a real
   control, not a texture swap.
2. **Leaf textures/atlases: CC0, or baked from our own meshes.** If we want photographic
   leaves, use CC0 atlases (below). If we want our style, render the procedural leaves to
   a 1024² atlas at build time: eight variants of one leaf in a 4×4 grid, one texture, UV
   offsets per instance. Self-consistent, no attribution, no download.

Recommendation: **do both** — procedural leaves for L0, a generated atlas for L1/L2. An
asset that is generated cannot be mis-licensed and cannot go stale.

---

## 4. Free assets: what exists, and what we may ship

| Source | Licence | Usable? |
|---|---|---|
| [Poly Haven](https://polyhaven.com/) — models, textures, HDRIs | **CC0** | Yes. Ship freely. |
| [ambientCG](https://ambientcg.com/) — incl. `Leaf001` material | **CC0** (public domain) | Yes. Ship freely. |
| [3DTexel](https://3dtexel.com/free-library/) — foliage atlases, 1,600+ assets | **CC0** | Yes, worth checking for leaf atlases. |
| [Sketchfab](https://sketchfab.com/) with the CC0 / CC-BY filter | CC0 or CC-BY | CC0 ships; CC-BY needs an attribution file. Read each asset page. |
| Blender **Sapling** add-on | GPLv3 (the add-on) | Use as a *tool*; generated meshes are your output. Do not vendor the GPL code. |
| **The Grove 3D** | Commercial, paid | Reference and inspiration only. Do not ship its output unless licensed. |
| **Arbaro**, **ngPlant**, standalone **Tree It** | Free, licences differ (GPL-ish / custom) | Same rule as Sapling: tool yes, code no. Verify before shipping any bundled asset. |
| Quixel **Megascans** on Fab | Free-tier terms have changed more than once | **Verify per asset, per project.** Do not assume. |

The rule that keeps this simple:

- **CC0** → ship, no obligations (credit anyway, in `assets/CREDITS.md`).
- **CC-BY** → ship with a recorded author, URL and licence, in one place.
- **GPL tool** → fine to *run*, never vendor the code, never copy its output into a
  GPL-contaminated form.
- **Paid / unclear** → reference only: measure it, do not ship it.

### The honest answer on "download trees and break them into parts"

**For leaves: yes.** Leaf cards, atlases and leaf silhouettes are exactly what downloaded
assets are good for. They are static art; nothing about our editing depends on them.

**For branch structure: no, and it would hurt.** A downloaded tree is a frozen mesh. Our
value is that a branch is a *control*: drag its handle, change its thickness, regenerate
one part. Importing someone's tree gives static geometry we cannot edit, in a style we did
not choose, at a licence we must track. What downloaded trees are genuinely useful for is
**measurement**: use them to calibrate the numbers the generator uses — branch angle
distributions, radius ratios per order, leaf counts per shoot, crown proportions. Measure,
then generate. That is what makes our trees look like trees rather than like our trees.

---

## 5. The asset pipeline (download → parts → our style)

Needed only for the leaf/atlas path, but worth having anyway:

```
# Inspect what is actually in the file
gltf-transform inspect tree.glb

# Split by material: bark in one file, leaves in another
gltf-transform partition tree.glb parts.glb

# Clean, then reduce for the far LOD
gltf-transform weld parts.glb parts.weld.glb
gltf-transform simplify parts.weld.glb parts.lod1.glb --ratio 0.25 --error 0.001
gltf-transform dedup parts.lod1.glb parts.lod1.dedup.glb
gltf-transform textureCompress parts.lod1.dedup.glb out.glb \
    --target webp --resize 1024 --slots baseColor
```

For Blender-side extraction (`blender -b tree.blend -P scripts/assets/split.py`):
- `bpy.ops.mesh.separate(type='LOOSE')` to break into parts;
- select by material to isolate leaves from bark;
- `bpy.ops.object.modifier_add(type='DECIMATE')` for LODs;
- bake a leaf atlas with Cycles if harvesting a look;
- `bpy.ops.export_scene.gltf(export_format='GLB')`.

Every downloaded file gets a line in `assets/provenance.json`
(`url`, `license`, `author`, `retrieved`, `sha256`) and — if the licence requires it — a
line in `assets/CREDITS.md`. Thumbnails and derived textures inherit the provenance of
their source.

---

## 6. What this means for the codebase

New module, deliberately separate from the part generators:

```
core/growth/
  growth-parameters.ts     # the parameters, their ranges, and their beginner names
  skeleton.ts              # Skeleton types, node chains, Strahler ordering
  space-colonization.ts    # attractor sampling + growth loop + spatial hash
  envelope.ts              # crown shapes and noise
  pipe-model.ts            # radii from children, da Vinci exponent
  sweep.ts                 # RMF frames, ring bridging, junction welding
  leaf-scatter.ts          # shoots, phyllotaxis, pad distribution
```

Changes:

- `branching-tree-generator.ts` becomes: parameters → `Skeleton` → components. Component
  parameters store a *node range* into the skeleton rather than a copied spine curve, which
  is what stops children drifting from parents.
- `branch.ts` / `trunk.ts` stop computing their own spine by formula; they sweep a node
  chain. The handle editing moves from "spine points" to "skeleton nodes" — the same
  interaction, the same undo, but now the tree knows its own shape.
- `foliage-cluster.ts` is replaced by `leaf-card` (one leaf) and `leaf-cluster` (cards in a
  pad). The old blob can stay as an L2/LOD representation — it is already cheap and reads
  fine at thumbnail size.
- Project schema bumps to 3, because component parameters change shape. Migration 2 → 3
  expands the old analytic spine into skeleton nodes and keeps the tree looking the same;
  the migration is where the old formula lives on, in one place, forever.
- The GLB exporter already writes one group per component with transforms; leaf instances
  must be baked into that group as merged geometry, or the export loses the leaf art.

---

## 7. Roadmap

Each milestone is judged by a measurement, not by a feeling.

### Milestone 6 — A bare tree that is one piece

Skeleton, RMF sweep, junction bridging, caps only at tips.

- **Accept:** for every child limb, `distance(child.start, parent.surface) < 1e-4 m`; no
  geometry is capped where a parent exists; dragging any handle moves all descendants
  (asserted in a test, not by eye).

### Milestone 7 — Radii that obey the pipe model

da Vinci exponent, per-order taper, length and insertion-angle rules, gravity.

- **Accept:** for every node, `|r_parent^n − Σ r_child^n| / r_parent^n < 0.05`; radius is
  monotonically non-increasing along any chain; a tree with more branches has a thicker
  trunk at the same height.

### Milestone 8 — Space colonization

Envelope sampling, growth loop, spatial hash, coarse/full preview under drag.

- **Accept:** the same seed produces identical vertex data; generation under 16 ms at
  preview quality and under 150 ms at full quality; crown silhouette within 10% of the
  chosen envelope; the bare tree is recognisably the reference picture's *kind* of tree.

### Milestone 9 — Leaves

Procedural leaf meshes, atlas bake, instanced cards, shoots and pads, backlight shading,
per-instance jitter.

- **Accept:** one draw call for all foliage; leaf count and size follow the skeleton;
  `alphaTest` with no transparent sorting; white-background silhouette shows leaf outlines
  rather than blobs; export carries the leaves.

### Milestone 10 — LOD, wind, and the gallery

L1 cluster cards and L2 billboards generated from the tree itself; a wind term in the
vertex shader driven by one time uniform; thumbnails rendered at L1.

- **Accept:** switching LOD never pops more than ~2% of the projected silhouette; the
  gallery thumbnail pipeline gets faster, not slower; wind costs no extra draw calls.

---

## 8. Open questions

1. **How far from low-poly do we go?** Procedural leaves are a style decision, not a
   technical one. A tree that is geometrically exact but shaded photorealistically will
   look worse in this app than an exact tree shaded plainly. Suggestion: exact geometry,
   deliberately simple materials (flat-ish colours, one normal map at most).
2. **Space colonization vs hand-tuned presets.** Colonization gives realism and variety
   but makes *predictable* silhouettes harder. Presets may need a seeded attractor set
   saved with the preset, so "Ash" looks like Ash every time. Cheap: store the seed and the
   envelope, which the schema already does for other things.
3. **Editing a grown tree.** A skeleton with 1,500 nodes is not eight draggable handles.
   Either handles exist only on limbs above a threshold order, or the inspector exposes
   *fields* that regenerate (as now) and handles remain a trunk-level affordance. This is
   the biggest UX decision in the plan.
4. **Regeneration cost on drag.** A slider that regrows the whole tree per frame will not
   hold 60 fps. The coarse/full pattern is required, not optional — and it means a visible
   "settle" when you let go. Worth designing for rather than discovering.
5. **Licence sweep before shipping.** Any CC0 asset we incorporate needs its provenance
   recorded at the moment it enters the repo, not in a later audit.

---

## Sources

- [Modeling Trees with a Space Colonization Algorithm — Runions, Lane, Prusinkiewicz (NPH 2007)](http://www.algorithmicbotany.org/papers/colonization.egwnp2007.html)
- [Creation and Rendering of Realistic Trees — Weber & Penn (SIGGRAPH 1995)](https://courses.cs.duke.edu/fall01/cps124/resources/p119-weber.pdf)
- [Maintenance mechanisms of the pipe model relationship and Leonardo da Vinci's rule in *Acer rufinerve*](https://link.springer.com/article/10.1007/s10265-008-0177-5)
- [glTF Transform — functions and CLI](https://gltf-transform.dev/)
- [glTF Transform — command-line quickstart](https://gltf-transform.dev/cli)
- [meshoptimizer / gltfpack](https://github.com/zeux/meshoptimizer)
- [three.js — alphaTest for leaf textures](https://salivity.github.io/three.js/article/how-to-use-alpha-test-in-three-js-for-leaf-textures)
- [three.js — instancing, LOD and draw-call batching](https://aetumi.app/news/threejs-performance-instancing-lod/)
- [The Grove 3D — natural tree growth simulation](https://www.thegrove3d.com/)
- [The Grove 2.3 — Digital Production](https://digitalproduction.com/2026/03/02/the-grove-2-3/)
- [Poly Haven — CC0 HDRIs, textures and models](https://polyhaven.com/)
- [ambientCG — CC0 materials and models](https://ambientcg.com/)
- [ambientCG — Leaf001](https://ambientcg.com/view?id=Leaf001)
- [3DTexel — free CC0 library (foliage atlases)](https://3dtexel.com/free-library/)
- [Free CC0 texture libraries compared (2026)](https://3dtexel.com/free-cc0-texture-libraries-compared/)
