# 01 — Product Specification

Status: drafted, awaiting review
Source: [`tree_modeling_tool_TDR_Wails_Go.md`](../tree_modeling_tool_TDR_Wails_Go.md)

---

## 1. The promise

> **Make a good-looking game tree in five minutes, without learning 3D
> modeling.**

That sentence is the product. Every decision below is judged against it.

The TDR calls this tool "a focused modeling companion that hides technical
complexity and provides useful starting shapes immediately." The promise above
is the user-facing version of that, and it is what the interface has to
deliver.

### What the promise rules out

- The app may not open on an empty scene.
- The app may not require a user to build a tree part by part before seeing
  something worth keeping.
- No step of the five-minute path may require a 3D modeling term, a
  filesystem concept, or a manual.

---

## 2. Users

### Primary: Maya, hobbyist game developer

| | |
|---|---|
| **Context** | Shipping a small Unity or Godot game on a laptop, evenings and weekends. Has never modeled in Blender. Knows Unity materials and prefabs. |
| **Pressure** | Needs tree assets that match a stylized look, at a poly count the game can afford, and she cannot spend an evening learning topology. |
| **Skill with 3D** | Low. Comfortable with sliders and panels. Alarmed by "vertices". |
| **Success looks like** | A tree in the viewport that looks intentional, a GLB that imports cleanly, and no moment where she felt stupid. |
| **Fails when** | The app teaches 3D concepts; a control is named in engineering terms; an action is irreversible; she cannot tell what a button will do before clicking it. |

### Secondary: Dev, technical artist

| | |
|---|---|
| **Context** | Professional game studio. Knows 3D, wants speed and control. Will use the tool daily. |
| **Pressure** | Needs to build many variants of the same asset family quickly, and wants keyboard-driven speed and precision. |
| **Success looks like** | Same five-minute path, but faster: shortcuts, repeatable seeds, parameter recall, dense keyboard operation. |
| **Fails when** | The beginner-friendly UI gets in the way, or the tool cannot produce a variant on demand. |

### The asymmetry that drives the design

Maya is the one we optimize for, because the TDR's goal is a *beginner* tool
and because a tool that is friendly is also a tool Dev can tolerate. Dev gets
power features (shortcuts, seed control, numeric entry) as an **additive
layer** that never complicates Maya's default path.

Rule: **no advanced feature may add a control to the default view.** Advanced
features live behind an explicit toggle, a keyboard shortcut, or a panel the
user has to open.

---

## 3. The core journey

### 3.1 First run, target under five minutes

| # | Step | Time | What the user sees |
|---|---|---|---|
| 1 | App opens | 0:00 | A tree is already in the viewport. No landing page, no empty scene, no "new project" dialog. |
| 2 | App opens | 0:00 | A one-time coach mark points at three things: *presets*, *add parts*, *export*. Dismissible, never blocking. |
| 3 | Picks a starting point | 0:30 | A row of preset cards with real thumbnails. Click one, the tree swaps. |
| 4 | Tunes it | 1:30 | Three to five plain-language sliders in the right panel: Height, Thickness, Bend, Leaves, Detail. Each updates the tree live. |
| 5 | Adds a part | 2:30 | Clicks a branch from the library. It attaches to the trunk automatically, with a sensible position. |
| 6 | Shapes it | 3:30 | Drags the tip of the branch. The branch bends. |
| 7 | Exports | 4:30 | Clicks Export, picks a file. A GLB is written. |
| 8 | Verifies | 5:00 | Opens it in their engine or a viewer. It looks the same. |

**Step 1 is non-negotiable.** The app generating a tree on launch is what makes
the promise believable.

### 3.2 Returning session

Open the app → the last project is restored with its exact tree → continue
editing. No "recent files" gallery to navigate if there is exactly one
recent project; restore it and get out of the way.

### 3.3 Job story

> When I am building a level and need a tree that fits the mood, I want to
> combine ready-made parts and adjust a few plain properties, so I can get a
> usable asset without learning 3D modeling.

---

## 4. Feature scope

Priority: **M** = must ship in the MVP, **S** = should ship, **L** = later,
explicitly not in the MVP.

### 4.1 Creating

| Feature | Pri | Notes |
|---|---|---|
| Complete tree from preset, one click | M | 7 presets: round canopy, wide canopy, tall narrow, twisted fantasy, exposed-root ancient, coconut palm, tropical palm |
| Tree generated on first launch | M | The default is the round-canopy tree at its default seed |
| Shape library, browseable by category | M | Trunks, branches, roots, foliage clumps, palm parts, details |
| Click-to-add from library | M | Ships first; drag-and-drop may follow |
| Drag-and-drop from library into viewport | S | Library API must support it from day one |
| Smart attachment on add | M | New part picks a sensible parent and position |
| Duplicate a component | M | Keeps parameters, gets a new identity |
| Delete a component | M | Undoable, no confirm dialog |
| Randomize variation | M | Preserves overall structure |
| Reset a component to preset defaults | M | Undoable |
| Add a second tree to the scene | L | Not in MVP |

### 4.2 Editing

| Feature | Pri | Notes |
|---|---|---|
| Orbit, pan, zoom | M | Standard; must work with a trackpad |
| Select tree or component | M | Click; visible selection feedback |
| Move, rotate, scale a component | M | Via panel controls first, viewport drag in M3 |
| Drag handles: trunk curve, branch tip, root tip, frond tip | M | M3 for branch/frond, M2 for trunk |
| Contextual inspector (tree params vs. component params) | M | Required by TDR §4 |
| Undo / redo | M | Command-based, records meaningful edits |
| Switch Low-poly ↔ Detailed | M | One control, immediate visible difference |
| Numeric entry for values | S | Dev-facing, inside the same control |

### 4.3 Saving and exporting

| Feature | Pri | Notes |
|---|---|---|
| Versioned JSON project save / open | M | Native dialogs via Go |
| GLB export | M | Real geometry and materials |
| Autosave draft | S | Recovery, not a replacement for explicit save |
| Export as glTF (separate textures) | L | Not in MVP |
| Export OBJ | L | Not in MVP |

### 4.4 Explicitly out of scope

Carried over from TDR §3 without change: Blender replacement, general
sculpting, rigging and animation, UV editing, node material editor, terrain,
physics, a game engine, required AI, a marketplace, a plugin ecosystem, and a
generic procedural node graph.

### 4.5 The blank-canvas trap

TDR §5.4 is an acceptance criterion, not a nice-to-have. Concretely:

- The app **never** opens to an empty viewport.
- The shape library is visible in the first screen, not buried behind a menu.
- A new user who touches nothing must still export a usable tree.

---

## 5. Terminology mapping

**This table is binding on every user-visible string.** If a control needs a
term not in the "user sees" column, either the control is badly designed or a
new user-facing term must be agreed here first.

| Technical term | The user sees | Notes |
|---|---|---|
| Mesh, geometry, poly model | *(never shown)* | |
| Vertex, edge, face, topology | *(never shown)* | |
| Polygon count | **Faces** | Only in the advanced chip: "2,340 faces" |
| Radius | **Thickness** | |
| Base radius / top radius | **Thickness** + **Taper** | Taper shown as a segmented choice |
| Taper | **Thickness taper** | Segmented: Even / Thicker at base / Thinner at base |
| Curvature | **Bend** | Segmented: Straight / Curved / Very curved |
| Twist | **Twist** | Acceptable — the word is intuitive |
| Segments, radial segments | **Detail** | Segmented: Low-poly / Detailed |
| Foliage, foliage cluster | **Leaves** / **Leaf clump** | |
| Foliage density | **Amount of leaves** | Segmented: Few / Medium / Many |
| Foliage size | **Leaf size** | |
| Branch hierarchy, child branches | **Branches** / **Small branches** | |
| Exposed roots | **Roots** | |
| L-system | *(never shown)* | |
| Transform, gizmo | **Move**, **Turn**, **Resize** | |
| Translate / rotate / scale | **Move** / **Turn** / **Resize** | |
| Duplicate | **Copy** | |
| Modifier, stack | *(never shown)* | |
| UV, unwrap | *(never shown)* | |
| Normal, tangent | *(never shown)* | |
| Shader, material graph | **Material** | Fixed presets only in MVP |
| Seed | **Seed** | Plus a shuffle button |
| LOD | *(never shown in MVP)* | |
| Pivot | *(never shown)* | |
| Export as glTF | **Export** (GLB) | The extension is not a choice in MVP |
| Project file | **Project** | With save/open in a File menu |

### 5.1 Button voice

One verb per button. The verb names the outcome.

| Do not write | Write |
|---|---|
| OK | Copy / Cancel — or name the outcome |
| Apply | Update tree |
| Confirm | Delete branch |
| Submit | Save project |
| Reset | Restore default |
| Generate | Build tree |
| Randomize | Surprise me |
| OK, Cancel in a dialog | Delete branch, Keep branch |

### 5.2 Error voice

Errors state what broke, why, and what to do next. The user is never blamed.

> "That branch is bigger than the trunk it is attached to. Try a smaller
> branch, or make the trunk thicker."

Not: "Invalid operation", "Error: branch radius exceeds trunk radius", or
anything that leaks an internal message.

### 5.3 Empty state voice

Empty states teach the space: what belongs here, why it matters, what fills it.

> **No trees yet**
> Trees you create appear here. Start from a preset to get your first tree.

Not: "No data available."

---

## 6. Success metrics

Measured locally, no telemetry, no network. The TDR requires the tool to work
offline; metrics stay local for the same reason.

| Metric | Target | How it is measured |
|---|---|---|
| Time to first export | Under 5 minutes | Manual, five first-time users |
| Preset-to-export conversion | Over 80% of sessions that touch a preset end in an export | Local counter in the project store |
| Library adoption | Over 30% of exported trees contain at least one added library part | Local counter |
| Parameter reach | The average session adjusts at least two distinct properties | Local counter |
| Export success | 100% of exports produce a loadable GLB | Automated test over all presets |
| Regeneration stability | No crash or non-finite geometry across 10,000 random parameter sets | Fuzz test |
| Time to first tree on launch | Under 2 seconds | Measured in the app |

### 6.1 The "5-minute test"

The TDR's manual acceptance list becomes a repeatable check before each
milestone is called done:

1. Generate the default branching tree.
2. Generate a coconut palm.
3. Switch both between low-poly and stylized-detailed.
4. Add, copy, move, and delete a branch or leaf clump.
5. Save, reopen, continue editing.
6. Export GLB, inspect it in Blender or a compatible viewer.

Plus the time-boxed first-run check: a new user with no instructions produces
and exports a tree in under five minutes.

---

## 7. Open decisions

| Question | Owner | Needed by |
|---|---|---|
| Does the first launch write a default project to disk, or hold it in memory until the user saves? | Product | Before M2 |
| Is the "Surprise me" action one button or does it offer "same shape, different seed" vs. "new shape"? | Product | Before M3 |
| Do library parts carry a color/style of their own, or inherit the tree's palette? | Design + Product | Before M3 |
| Is the viewport background fixed, or can the user pick a backdrop for judging the asset? | Design | Before M2 |
| Does the app ship a real "Undo" toast after delete, or rely on the toolbar button alone? | Design | Before M2 |

---

## 8. Traceability to the TDR

| TDR section | Covered in |
|---|---|
| §2 Goals 1-2 | §1 Promise, §4.1 Presets |
| §2 Goals 3, §5 Shape library | §4.1 Shape library, §4.5 Blank-canvas trap |
| §2 Goals 4-5, §7 Editing | §4.2 Editing |
| §2 Goal 6, §6.4 Determinism | §3, [03-architecture-spec](./03-architecture-spec.md) §4 |
| §2 Goals 7-8 | §4.3 Saving and exporting |
| §2 Goal 10 | [03-architecture-spec](./03-architecture-spec.md) §2 |
| §4 UX requirements | §2, §5, [02-ui-ux-spec](./02-ui-ux-spec.md) |
| §5 Shape library | §4.1, §4.5 |
| §6 Generators | [03-architecture-spec](./03-architecture-spec.md) §3, §5 |
| §7 Editing model, undo/redo | [03-architecture-spec](./03-architecture-spec.md) §3, §6 |
| §8 Stack | [03-architecture-spec](./03-architecture-spec.md) §2 |
| §10 Generator contract | [03-architecture-spec](./03-architecture-spec.md) §3 |
| §11 Project file | [03-architecture-spec](./03-architecture-spec.md) §7 |
| §12 GLB export | [03-architecture-spec](./03-architecture-spec.md) §8 |
| §13 Performance and quality | §6, [03-architecture-spec](./03-architecture-spec.md) §9 |
| §14 Testing | [03-architecture-spec](./03-architecture-spec.md) §10, [04-roadmap](./04-roadmap.md) |
| §15 Implementation plan | [04-roadmap](./04-roadmap.md) |
| §16 Acceptance criteria | §3.1, §4, [04-roadmap](./04-roadmap.md) |
