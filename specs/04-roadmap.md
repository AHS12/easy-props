# 04 — Roadmap

Status: drafted, awaiting review
Source: [`tree_modeling_tool_TDR_Wails_Go.md`](../tree_modeling_tool_TDR_Wails_Go.md) §15

---

## How this plan works

The TDR's five milestones are kept. Each one is expanded into concrete
deliverables and a **definition of done** that can be checked, not argued
about.

Three rules govern the order of work:

1. **Vertical slices, not layers.** Every milestone produces something a user
   can actually look at. No milestone ends with "the foundation is in place"
   and nothing on screen.
2. **The viewport comes first.** A tool whose first milestone is a data model
   is a tool that cannot be judged.
3. **The shape library is not a later milestone.** It is Milestone 3, and the
   TDR is explicit that it is an acceptance criterion for the MVP. If
   Milestone 3 slips, the MVP does not ship.

---

## Milestone 1 — Foundation

**Goal:** a running app with a real 3D viewport, the design system in place,
and the tooling to verify everything.

### Deliverables

| # | Deliverable | Notes |
|---|---|---|
| 1.1 | Design tokens as CSS custom properties | [`design-tokens.css`](./design-tokens.css) ported into `src/styles/tokens.css` |
| 1.2 | App shell layout | Top bar, left rail, viewport, inspector, status strip, per the UI spec §3.1 |
| 1.3 | Viewport | Renderer, perspective camera, OrbitControls with the clamps in UI spec §6.1, hemisphere + key + fill lights, ground disc, two-tier grid |
| 1.4 | Resize handling | Camera reframes on resize; layout holds from 1024×640 upward |
| 1.5 | Window minimum size | Enforced in `main.go`, not only in CSS |
| 1.6 | Selection | Raycast picking, hover rim highlight, click selection, `Escape` to deselect |
| 1.7 | Shell state | Zustand store with `scene`, `style`, `selection`, `status` |
| 1.8 | Placeholder scene | A single hand-built trunk mesh, so the viewport is never empty |
| 1.9 | Tooling | ESLint (done), Vitest (done), typecheck script (done), `pnpm build`, `wails build` |
| 1.10 | Light and dark themes | One visual language, two palettes, a top bar toggle, follows the operating system until the user chooses, remembered locally |

### Definition of done

- [ ] The app launches and shows a 3D viewport with a ground grid, lighting,
      and a visible object.
- [ ] Orbit, pan, and zoom work with a mouse and a trackpad, with the clamps
      applied.
- [ ] Clicking the object selects it; the selection is visible; `Escape`
      deselects; selection is announced in the live region.
- [ ] The window cannot be resized below 1024×640.
- [ ] Both themes render, the accent is identical in both, and the theme is
      remembered across restarts.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and
      `wails build` all pass.
- [ ] No user-visible string contains a 3D modeling term.
- [ ] The viewport survives a resize without stretching the camera.

### Not in this milestone

No trees yet. The placeholder object exists to prove the viewport, picking,
and lighting work.

---

## Milestone 2 — First useful tree

**Goal:** the app opens with a complete, good-looking tree that a beginner
would keep.

### Deliverables

| # | Deliverable | Notes |
|---|---|---|
| 2.1 | Generator contract | [`03-architecture-spec` §3](./03-architecture-spec.md) implemented in `assets/shared/generator-types.ts` |
| 2.2 | Scene graph | `core/scene/scene-model.ts` and `scene-ops.ts`, with pure operations |
| 2.3 | Parameter system | `NumberRange` metadata, Zod validation, clamping |
| 2.4 | Trunk generator | Curved, tapered, twistable, with real geometry |
| 2.5 | Foliage cluster generator | Round, oval, flat, layered variants |
| 2.6 | Branching tree generator | Trunk, branches, hierarchy, foliage distribution, roots, asymmetry |
| 2.7 | Style profiles | Low-poly and detailed, driving segment counts and shading |
| 2.8 | Round-canopy preset | A complete tree |
| 2.9 | Preset cards | Real offscreen renders as thumbnails |
| 2.10 | Inspector | Tree-level and component-level parameters, using the `control` hint |
| 2.11 | Handle: trunk bend points | Drag to reshape the trunk |
| 2.12 | Undo/redo | Command stack |
| 2.13 | Style toggle | Top bar, live, preserving structure |
| 2.14 | The sun | A movable sun with a shadow, time-of-day presets, and shadow strength |
| 2.15 | Shading modes | Lit, flat, and wireframe in the viewport |
| 2.16 | Colours | Bark and leaf colours from named swatches, carried into the export |

### Definition of done

- [x] The app opens with a tree already in the viewport.
- [x] The tree has a coherent silhouette. It does not look like disconnected
      cylinders.
- [x] Branches attach to the trunk without visible gaps.
- [x] Changing Height, Thickness, or Bend updates the tree live.
- [x] Switching Low-poly / Detailed changes the level of detail while keeping
      the same tree recognizable.
- [x] The same seed reproduces the same tree, byte for byte on the vertex
      buffers.
- [x] Undo and redo work for every parameter change and handle drag.
- [x] The tree never looks broken: a property-based sweep over 10,000 random
      parameter sets produces finite geometry every time.
- [x] The first-run coach mark appears once and dismisses permanently.
- [x] The face-count chip shows a plausible, changing number.

### Manual check

Generate the default branching tree. Switch styles. Move a trunk bend point.
Undo. Reload the seed. It matches.

---

## Milestone 3 — Shape library and fast assembly

**Goal:** a beginner assembles a tree from reusable parts without touching a
numeric parameter.

### Deliverables

| # | Deliverable | Notes |
|---|---|---|
| 3.1 | Part generators | Trunk, branch, root, foliage cluster |
| 3.2 | Library data | Categories, names, thumbnail renders, default parameters |
| 3.3 | Parts panel | Search, collapsible categories, thumbnail rows |
| 3.4 | Click-to-add | Sensible default attachment, immediate selection, undoable |
| 3.5 | Smart attachment | New parts pick a valid parent and position |
| 3.6 | Copy and delete | `Ctrl+D`, `Delete`, undo toast |
| 3.7 | Handle: branch tips, root tips | Direct manipulation. The branch and root spine becomes a parameter, so a tip can be dragged. The point count is a parameter too, so a part can be given more places to bend |
| 3.8 | Randomize variation | Preserves structure, single undo step |
| 3.9 | Restore default | Per component and per tree |
| 3.10 | Drag-and-drop | Optional, only if 3.4 is solid first |
| 3.11 | Remaining presets | Wide canopy, tall narrow, twisted fantasy, exposed-root ancient |
| 3.12 | Shape tool | Push and pull a part's surface, stored as a parameter. See the note below |
| 3.13 | Surface push editing | Undo last push, clear pushes, and a push that survives save and reopen |

### A note on 3.12 and 3.13

Push and pull was **not** in the original scope. TDR §3 listed "general
sculpting or arbitrary vertex/edge/face editing" as a non-goal, with the
escape clause *"do not implement these unless explicitly requested later"*.
The user requested it explicitly, so the TDR was amended to record a
bounded exception: TDR §7.1.

The bound matters. It is a **surface** operation stored as a **parameter**,
not a mesh edit. The mesh is regenerated from the parameter, so the scene
graph stays the source of truth and undo, save and reopen, and seed
determinism all keep working. There is no vertex, edge, or face selection.

### Definition of done

- [x] Every library part can be added with one click and lands somewhere
      sensible.
- [x] Added branches attach to the trunk or another branch, never floating.
- [x] A copied branch keeps its parameters and gets a new identity.
- [x] Deleted parts can be restored with one click on the toast, or with
      `Ctrl+Z`.
- [x] Dragging a branch tip reshapes that branch and only that branch.
- [x] A part's number of control points can be changed without moving its
      shape, the same way a loop cut adds geometry without moving a
      silhouette.
- [x] A push changes only the part it was made on, and can be undone with
      `Ctrl+Z`.
- [ ] A push survives save and reopen, and produces the same geometry.
      (Deterministic and serialisable already; save and reopen arrive in M6.)
- [x] Randomize produces a visibly different but structurally similar tree,
      and does not throw away a part the user added.
- [x] Restore a part to its generator defaults.
- [x] Restore the tree to the preset it came from.
- [x] Five presets exist and each produces a complete tree, not an isolated
      part.
- [x] The library is visible on the first screen without opening a menu.
- [x] The parts panel groups by category and a group can be collapsed, with
      its count still showing.
- [x] The navigation compass shows the camera's orientation and looks down an
      axis when one is clicked.
- [x] Scrolling panels use a thin themed scrollbar, not the platform default.

### Manual check

Add a branch. Copy it. Drag its tip. Delete it. Undo. Push the bark out.
Save. Reopen. All intact.

---

## Milestone 4 — Palm tree

**Goal:** a recognizable coconut palm, from a dedicated generator.

### Deliverables

| # | Deliverable | Notes |
|---|---|---|
| 4.1 | Palm generator | Dedicated, not a branch generator with different defaults |
| 4.2 | Segmented trunk | Ringed appearance, curvature, taper |
| 4.3 | Palm crown | Position and size |
| 4.4 | Frond generator | Arched, drooping, upright variants |
| 4.5 | Leaflets | Count, spacing, width |
| 4.6 | Coconut clusters | Count, size, placement |
| 4.7 | Coconut palm preset | Complete |
| 4.8 | Tropical palm preset | Same generator, different defaults |
| 4.9 | Palm parts in the library | Fronds and coconut clusters as reusable parts |
| 4.10 | Frond handles | Drag to reshape a frond |

### Definition of done

- [ ] The coconut palm preset reads unmistakably as a palm.
- [ ] Fronds arch and droop according to their parameters.
- [ ] Leaflets are real geometry, not a texture.
- [ ] Coconuts cluster under the crown.
- [ ] Both palms work in both styles.
- [ ] The palm generator is a separate implementation, not a branch generator
      in disguise.

---

## Milestone 5 — Save and export

**Goal:** the user leaves with a file and can come back.

### Deliverables

| # | Deliverable | Notes |
|---|---|---|
| 5.1 | Project schema | Versioned JSON, per architecture spec §8 |
| 5.2 | Go file service | Read and write, per architecture spec §10 |
| 5.3 | Native dialogs | Open, save, export, with filters |
| 5.4 | Save and open | Menu plus `Ctrl+S` |
| 5.5 | Schema validation | Zod on load, clear errors |
| 5.6 | Migration path | At least one version bump handled end to end |
| 5.7 | GLB exporter | Per architecture spec §9 |
| 5.8 | Export flow | Native save dialog, toast on success, clear failure |
| 5.9 | Export verification | Load the GLB back with `GLTFLoader` in a test |
| 5.10 | Manual verification | Open the GLB in Blender or a compatible viewer |

### Definition of done

- [ ] Save, close, reopen, and the tree is identical, including every
      edited parameter.
- [ ] Reopening a project with an unknown schema version fails with a clear
      message and does not damage the current session.
- [ ] Export writes a GLB that opens in Blender with correct geometry,
      materials, and colors.
- [ ] Exporting every preset produces a loadable file. This is an automated
      test.
- [ ] The exported file has meaningful object names.
- [ ] No exported geometry depends on application-specific custom data.

---

## Tree gallery — added after M5

**Why:** M1–M5 assumed one tree per session, so saving meant "overwrite the
file". In use the opposite was true: every save replaced the last one and the
work of a week was one document. The app now holds a collection.

### What it is

A dedicated page, and the first thing the app shows. Not a sidebar tab, not a
modal: it is where a beginner lands, sees their work, and starts or opens a
tree in one click.

| Part | Decision |
|---|---|
| Storage | One project file per tree in `%APPDATA%/easy-props/trees`, plus a PNG preview beside it. No database: files are readable, copyable, syncable, and a corrupt one loses one tree, not the collection. |
| Identity | A tree you are editing keeps one entry. `Ctrl+S` updates it. `Ctrl+Shift+S` saves a copy as a new entry, so the gallery grows only when the user chooses. |
| Previews | Rendered from the same generators as the viewport, framed to the tree's bounds, one shared WebGL renderer for every thumbnail. |
| Naming | Automatic from the starting preset ("Round canopy", then "Round canopy 2"), renameable in place. |
| Files on disk | Still the same format as Save to a file, so the two paths cannot drift, and a gallery tree can be exported or handed over as a plain file. |

### Definition of done

- [x] Saving twice updates one entry rather than making two.
- [x] A copy gets its own entry and a distinct name.
- [x] Every entry shows a preview of the tree it holds.
- [x] Deleting asks once, and only deletes that tree.
- [x] The library refuses ids that would write outside its folder.
- [x] An unreadable file is listed but cannot be opened.

---

## After the MVP

Deferred, in priority order. None of these are committed.

| Item | Why it is later |
|---|---|
| Rocks, bushes, grass generators | TDR §2 Goal 10 says the architecture must allow them, not that the MVP needs them |
| Drag-and-drop polish, multi-select | Usable without it |
| Leaflets as instanced geometry | Optimization, not a correctness issue |
| Terrain, scattering | Explicit non-goal in TDR §3 |
| Node graph | Explicit non-goal in TDR §3 |

---

## Dependencies between milestones

```
M1 Foundation
 └── M2 First tree
      ├── M3 Shape library
      │    └── M4 Palm          (needs the library plumbing for fronds)
      └── M5 Save and export
```

M5 depends only on M2. It can be built in parallel with M3 and M4, and doing
it earlier de-risks the export path.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The generator produces trees that look procedural rather than designed | High. Undermines the whole product | Iterate against real reference images early, in M2, not at the end. Preset quality is the acceptance bar, not the generator's flexibility. |
| "Beginner-friendly" turns into "dumbed down" | Medium | Keep the Dev power layer (numeric entry, shortcuts, seed control) additive and invisible to the default path |
| The library grows faster than the parts can be authored well | Medium | Ship a smaller library of excellent parts, not a large library of mediocre ones. The UI spec's thumbnail bar is the quality gate. |
| Undo/redo across regeneration proves fragile | Medium | Undo over the scene graph only, never over meshes. Decide this in M2, before there is a history to migrate. |
| Per-component regeneration is too slow with many components | Medium | Measure in M2 with the performance budget in architecture spec §14. Do not add workers before profiling. |
| Style switching changes the silhouette and breaks the promise | Low | A test asserts silhouette similarity across profiles |
| The palm generator gets built as a branch generator with tweaks | Medium | Write it standalone; a palm is not a tree with few branches |

---

## Working agreement

At the end of every milestone, report:

1. **Changed files** — what was added, changed, deleted.
2. **What works** — verified, with the commands run.
3. **What does not work** — stated plainly, no hedging.
4. **Known limitations** — especially anything that violates the TDR.
5. **The next milestone** — what it needs from you.

Do not claim a feature is complete unless it has been implemented *and*
verified, per TDR §15.
