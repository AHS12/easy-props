# 03 — Architecture Specification

Status: drafted, awaiting review
Source: [`tree_modeling_tool_TDR_Wails_Go.md`](../tree_modeling_tool_TDR_Wails_Go.md)

---

## 1. Principles

1. **Go is the desktop layer, not the engine.** Go handles native dialogs and
   file I/O. Every geometry decision happens in TypeScript.
2. **The scene graph is the source of truth.** The Three.js scene is a
   projection of it, rebuilt on demand. Nothing meaningful lives only in a
   mesh.
3. **Generators are pure.** Given parameters and a seed, a generator returns
   the same geometry, always. No `Math.random`, no `Date.now`, no reading
   global state.
4. **The geometry layer has no UI dependency.** Modules under
   `frontend/src/assets/` may not import React, Zustand, or the Wails
   bindings. This is enforced by lint, not by convention.
5. **A new asset family plugs in without touching the editor.** A future rock
   generator implements the contract in §3 and nothing else changes.
6. **Serialize everything that matters.** The project file must round-trip
   every editable parameter. If a user changed it, it survives a save and
   reload.

---

## 2. Module map

```text
frontend/src/
  app/
    App.tsx                  Shell composition, layout grid
    routes.ts                (future) screen routing
  components/                Shared presentational React components
  panels/
    TopBar.tsx
    LeftRail.tsx
    PresetsPanel.tsx
    PartsPanel.tsx
    Inspector.tsx
    InspectorGroup.tsx
    StatusStrip.tsx
  viewport/
    Viewport.tsx             Canvas host + Three.js lifecycle
    scene/
      scene.ts               Scene, camera, renderer, lights, ground
      camera-controls.ts     OrbitControls wiring and clamps
      picking.ts             Raycast selection and hover
      handles.ts             Handle meshes, drag interaction
      materials.ts           Material palette
    thumbnailer.ts           Offscreen preset/library renders
  core/
    scene/
      scene-model.ts         Scene, SceneAsset, SceneComponent types
      scene-ops.ts           Pure add/delete/duplicate/reparent operations
    selection/
      selection.ts           Selection state and rules
    interaction/
      drag-controller.ts     Direct manipulation state machine
    history/
      history.ts             Command stack, undo/redo
    project/
      project-file.ts        Schema, version, migration
      project-service.ts     Save/open through the Go bridge
  assets/
    shared/
      generator-types.ts     The generator contract (§3)
      parameters.ts          Shared parameter primitives and ranges
      random.ts              Seeded RNG (implemented)
      geometry-utils.ts      Tube, taper, curve and mesh helpers
      validation.ts          ValidationResult and clamping helpers
    trees/
      tree-model.ts          Tree-specific scene types
      branching-tree-generator.ts
      palm-tree-generator.ts
      components/
        trunk.ts
        branch.ts
        root.ts
        foliage-cluster.ts
        palm-frond.ts
        coconut-cluster.ts
      presets/
        index.ts             Preset definitions
        branching.ts
        palm.ts
    style/
      style-profiles.ts      Low-poly and detailed profiles
  export/
    glb-exporter.ts          GLB export pipeline
  store/
    editor-store.ts          Zustand store
  tests/
    setup.ts                 Vitest setup (implemented)
    random.test.ts           (implemented)
backend/
  app.go                     Wails app struct and lifecycle
  projectfiles/              Versioned JSON read/write
  dialogs/                   Native open/save dialogs
```

### 2.1 Dependency rules

```
app / panels / components / viewport   →  core  →  assets  →  shared
                                          ↓
                                       store (Zustand)
                                          ↓
                                    backend (Wails bindings)
```

- `assets/**` may import only `assets/**` and `three`. Enforced by an ESLint
  `no-restricted-imports` override scoped to `src/assets/**`:

  ```js
  {
    files: ['src/assets/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react', 'react-dom', 'zustand'], message: 'Geometry modules must stay UI-free.' },
          { group: ['**/wailsjs/**'], message: 'Geometry modules must not depend on the desktop shell.' },
        ],
      }],
    },
  }
  ```

- `viewport/**` may import `assets/**` and `core/**`, never the reverse.
- `core/**` may import `assets/**`, never `viewport/**`.
- `backend/**` is only reachable through `frontend/src/core/project/**`.

---

## 3. Generator contract

The single extension point for new asset families.

```ts
// assets/shared/generator-types.ts

export type GeneratorId = string

export interface GenerationContext {
  /** Deterministic randomness for this generation. */
  readonly random: RandomSource
  /** The style profile in effect. */
  readonly style: StyleProfile
}

export interface ValidationIssue {
  readonly path: string
  readonly message: string
}

export interface ValidationResult {
  readonly valid: boolean
  /** Parameters after clamping into their legal range. */
  readonly parameters: unknown
  readonly issues: readonly ValidationIssue[]
}

export interface GeneratedPart {
  /** Stable id of the part within the generated asset. */
  readonly id: string
  readonly name: string
  /** Geometry, already transformed into asset-local space. */
  readonly geometry: BufferGeometry
  readonly material: MaterialKind
}

export interface GeneratedAsset {
  readonly parts: readonly GeneratedPart[]
  /** Optional per-part editable metadata for the scene graph. */
  readonly metadata: Readonly<Record<string, unknown>>
}

export interface AssetGenerator<P, M = unknown> {
  readonly id: GeneratorId
  readonly version: number
  readonly label: string
  createDefaultParameters(): P
  validate(parameters: P): ValidationResult
  generate(parameters: P, context: GenerationContext): GeneratedAsset
}
```

### 3.1 Rules

- `version` increments whenever the output of an unchanged parameter set
  changes. The project file stores it, so an old project can be detected and
  migrated.
- `validate` never throws. It clamps and reports.
- `generate` receives already-validated, already-clamped parameters.
- `generate` must not mutate its inputs.
- A generator returns **parts**, not a single mesh. A tree is a trunk part,
  several branch parts, root parts, and foliage parts. This is what makes
  per-component regeneration and per-component selection possible.

### 3.2 Two generator kinds

| Kind | Responsibility | Generators |
|---|---|---|
| **Tree generator** | Produces a whole tree's component set | `branching-tree`, `palm-tree` |
| **Part generator** | Produces one reusable library part | `trunk`, `branch`, `root`, `foliage-cluster`, `palm-frond`, `coconut-cluster` |

A tree generator composes part generators. Adding a new part kind does not
require a new tree generator.

---

## 4. Scene graph

The editable model. Serializable, Three.js-free.

```ts
// core/scene/scene-model.ts

export type ComponentType =
  | 'trunk' | 'branch' | 'root' | 'foliage-cluster'
  | 'palm-frond' | 'palm-crown' | 'coconut-cluster'

export interface Transform {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

export interface SceneComponent {
  readonly id: string
  readonly type: ComponentType
  readonly generatorId: GeneratorId
  readonly generatorVersion: number
  /** Attachment target. null means it is a root of its asset. */
  readonly parentId: string | null
  readonly transform: Transform
  /** Generator parameters. Shape depends on generatorId. */
  readonly parameters: Readonly<Record<string, unknown>>
  /** Per-component overrides of the asset's style profile. */
  readonly styleOverrides: Readonly<Partial<StyleProfile>> | null
  /** Deterministic variation seed for this component. */
  readonly seed: number
}

export interface SceneAsset {
  readonly id: string
  readonly kind: 'tree'
  readonly generatorId: GeneratorId
  readonly generatorVersion: number
  /** Flat list. parentId expresses hierarchy. */
  readonly components: readonly SceneComponent[]
  readonly seed: number
  /** The tree's own parameters, shown as tree-level controls. */
  readonly parameters: Readonly<Record<string, number | string>>
  /** The colours the tree is painted with. Part of the tree, so it is
   *  undoable and it travels into the export. */
  readonly materials: SceneMaterials
}

/** The colours the user chooses. Everything else is derived from these. */
export interface SceneMaterials {
  readonly bark: string
  readonly leaves: string
}

export interface Scene {
  readonly id: string
  readonly assets: readonly SceneAsset[]
}
```

### 4.1 Why a flat list

A flat list with `parentId` keeps serialization trivial, makes undo diffing
easy, avoids deep-cloning nested trees on every edit, and survives schema
migration more gracefully than a nested structure. Hierarchy is derived on
read when needed.

### 4.2 Operations

`core/scene/scene-ops.ts` holds pure functions over `Scene`. Every one returns
a **new** `Scene`; nothing is mutated in place.

| Operation | Signature |
|---|---|
| `addComponent` | `(scene, assetId, component, options?) => Scene` |
| `removeComponent` | `(scene, assetId, componentId) => Scene` (removes descendants) |
| `duplicateComponent` | `(scene, assetId, componentId) => Scene` |
| `updateParameters` | `(scene, assetId, componentId, patch) => Scene` |
| `updateTransform` | `(scene, assetId, componentId, transform) => Scene` |
| `reparentComponent` | `(scene, assetId, componentId, newParentId) => Scene` |
| `setAssetSeed` | `(scene, assetId, seed) => Scene` |

### 4.3 Regeneration

The renderer keeps a `Map<componentId, THREE.Object3D>`. On any scene change:

1. Diff the previous component id set against the new one.
2. For added or changed components, run the generator and build a new
   `Object3D`.
3. For removed components, remove the object and **dispose its geometry**.
4. For unchanged components, leave the object alone.

This satisfies TDR §13's "avoid regenerating unrelated assets" and "dispose
obsolete geometries".

---

## 5. Parameters and validation

### 5.1 Range metadata

Every numeric parameter declares its range once, in one place.

```ts
// assets/shared/parameters.ts

export interface NumberRange {
  readonly min: number
  readonly max: number
  readonly step: number
  readonly unit?: 'm' | 'cm' | 'deg' | 'ratio' | 'count'
  readonly default: number
  /** The control the UI should render for this parameter. */
  readonly control: 'slider' | 'segmented'
  readonly options?: readonly { value: number; label: string }[]
}
```

`control` is a UI hint stored with the parameter definition. The inspector
reads it and renders a slider or a segmented control accordingly. This is how
"Straight / Curved / Very curved" and "Bend 0.5" are decided in one place
rather than per component.

### 5.2 Validation

Zod schemas per generator, plus a shared clamping layer.

```ts
// assets/shared/validation.ts

export interface ValidationResult {
  readonly valid: boolean
  readonly parameters: unknown
  readonly issues: readonly ValidationIssue[]
}
```

Rules:

- Out-of-range values are **clamped**, not rejected. The issue list records
  what was clamped so the UI can say *"Height was raised to the minimum of
  1 m"*.
- `NaN` and `Infinity` are rejected outright and replaced with the default.
- A missing required parameter falls back to the generator default.
- Validation never throws; the caller decides how to report.

### 5.3 Derived, user-facing values

The inspector renders a value using the same `NumberRange` that generated it,
so the displayed unit and precision always match the legal range. A `count`
shows as an integer; a `ratio` shows as a percentage.

### 5.4 Editable spines and surface pushes

Two kinds of parameter are not a single number. Both are still parameters,
not mesh edits, so the scene graph stays the source of truth.

**An editable spine.** A trunk, a branch, and a root each carry a spine of
control points that the handles drag. The coarse controls (Bend, Curl, Drop)
regenerate the default spine; the spine is what the geometry is actually
built from. Touching a coarse control replaces the dragged spine and moving
a handle replaces the control's result, so neither can leave the other dead.

The two layouts differ because the parts are built differently:

```ts
/** The trunk: rises along Y, offsets on X and Z. */
export interface SpinePoint {
  readonly t: number
  readonly x: number
  readonly z: number
}

/** A branch or a root: reaches along X, offsets on Y and Z. */
export interface LimbSpinePoint {
  readonly t: number
  readonly y: number
  readonly z: number
}
```

A limb is built along X because its transform then points that axis at
whatever it is attached to. `assets/shared/spines.ts` is the only place that
knows the difference, so the generators and the handles are written once.

A spine point can only move across its part's axis: those are the only two
numbers stored beside `t`. The drag therefore happens in the plane through
the handle that the axis is normal to, which means the handle lands exactly
under the pointer. For a trunk that plane is horizontal; for a limb it turns
with the limb.

The spine lives on the component, not on the tree, so a hand-shaped part is
protected by the same `edited` flag as any other parameter change.

**A surface push.** Pushing or pulling a part's surface is recorded as a
list of pushes on the part's parameters. Each push is applied to the
generated geometry, along the surface normal, with a falloff.

```ts
export interface SurfacePush {
  /** Where on the surface, in the part's own space. */
  readonly point: readonly [number, number, number]
  /** Which way, in the part's own space. Usually the surface normal. */
  readonly direction: readonly [number, number, number]
  /** How far, in metres. Negative pulls in. */
  readonly strength: number
  /** How far the push reaches, in metres. */
  readonly radius: number
}
```

Rules:

- A push is stored in the part's **own** space, so it follows the part when
  the part is moved, and it means the same thing on every part.
- Pushes are applied after the base geometry is built and before the
  normals are computed.
- The falloff is smooth, so a push does not leave a crease.
- Pushes are deterministic and serialisable. They survive undo, save and
  reopen, and they do not break seed determinism.
- There is no vertex, edge, or face selection anywhere. A push moves the
  whole surface within its radius.

---

## 6. Style profiles

```ts
// assets/style/style-profiles.ts

export interface StyleProfile {
  readonly id: 'low-poly' | 'detailed'
  readonly label: string
  /** Radial segments on generated tubes. */
  readonly radialSegments: number
  /** Height segments along generated tubes. */
  readonly heightSegments: number
  readonly flatShading: boolean
  readonly foliageDetail: 'simple' | 'layered'
  readonly barkDetail: 'smooth' | 'ridged'
  /** Soft ceiling used by generators to scale detail. */
  readonly polygonBudget: number
}
```

| Profile | radial | height | flat | foliage | bark | budget |
|---|---|---|---|---|---|---|
| `low-poly` | 5 | 3 | yes | simple | smooth | 2,500 |
| `detailed` | 8 | 6 | no | layered | ridged | 8,000 |

Switching profiles regenerates geometry with the same parameters and the same
seed. The silhouette must stay recognizably identical — this is a
TDR §6.3 requirement ("art style should configure geometry and appearance
defaults, not replace the underlying tree structure").

---

## 7. Determinism

### 7.1 Seed derivation

```
tree.seed
  └── hashSeed(tree.seed, componentIndex)  →  component.seed
```

Component seeds are derived from the **component's position in the tree's
component list**, not from a counter that increments on every add. Adding a
branch therefore does not reshuffle the randomness of existing branches.

### 7.2 Rules

- No generator may call `Math.random()`. A lint rule bans it under
  `src/assets/**`.
- No generator may call `Date.now()`.
- Regeneration with the same parameters and seed must produce byte-identical
  vertex buffers. This is directly testable and directly asserted.

### 7.3 Per-component randomness

A generator receives one `RandomSource` per component, seeded from that
component's seed. If a generator needs several independent streams, it derives
them with `hashSeed(componentSeed, streamIndex)`.

---

## 8. Project file

Versioned JSON. Written by Go, produced by TypeScript.

```jsonc
{
  "schemaVersion": 1,
  "generator": "easy-props",
  "createdAt": "2026-10-29T12:00:00.000Z",
  "modifiedAt": "2026-10-29T12:34:56.000Z",
  "style": "low-poly",
  "scene": {
    "id": "scene-1",
    "assets": [
      {
        "id": "asset-1",
        "kind": "tree",
        "generatorId": "branching-tree",
        "generatorVersion": 1,
        "seed": 12345,
        "components": [
          {
            "id": "cmp-1",
            "type": "trunk",
            "generatorId": "trunk",
            "generatorVersion": 1,
            "parentId": null,
            "transform": {
              "position": [0, 0, 0],
              "rotation": [0, 0, 0],
              "scale": [1, 1, 1]
            },
            "parameters": { "height": 4.2, "baseRadius": 0.32, "taper": 0.7 },
            "styleOverrides": null,
            "seed": 991
          }
        ]
      }
    ]
  }
}
```

### 8.1 Rules

- `schemaVersion` is required. An unknown higher version is a hard error with
  a clear message, not a silent load.
- Unknown extra keys are preserved on load and written back, so a newer
  build's additions are not lost by an older build. (Round-trip fidelity.)
- Loading validates the whole document with Zod before anything touches the
  scene.
- A migration function exists per version bump: `migrate1to2(doc)` and so on.
  The chain runs from the file's version to the current one.
- A failed load leaves the current session untouched.

---

## 9. GLB export

```ts
// export/glb-exporter.ts
export async function exportGLB(scene: Scene, options: ExportOptions): Promise<ArrayBuffer>
```

### 9.1 Pipeline

1. Build a **temporary** `THREE.Scene` containing only the generated meshes.
2. Create one `THREE.Group` per scene component, named after the component
   type and id (`trunk_cmp-1`). Object names must be meaningful in Blender.
3. Apply each component's transform to its group, so the hierarchy and
   transforms are preserved rather than baked into the vertices.
4. Assign the fixed material palette (§7.4 of the UI spec), using the same
   `MeshStandardMaterial` instances the viewport uses so exported colors match.
5. Run `GLTFExporter` with `{ binary: true }`.
6. Return the `ArrayBuffer`.

### 9.2 Rules

- The export must not mutate the live viewport scene. It builds its own.
- Normals must be valid. `computeVertexNormals()` is run where the generator
  did not produce them; geometry is never exported with `NaN` coordinates.
- No custom application data is required for the exported geometry to render.
- The exporter's scene is disposed after use, geometry and materials included.
- Export is verified by loading the result back with `GLTFLoader` in a test,
  asserting a non-zero mesh count and finite vertex data.

---

## 10. The Go/Wails boundary

Deliberately small. The TDR says "keep the Go API small and explicit".

```go
// backend/app.go
package backend

type App struct{ ctx context.Context }

func (a *App) startup(ctx context.Context)
func (a *App) shutdown(ctx context.Context)

// dialogs
func (a *App) OpenFileDialog(title string, filters []string) (string, error)
func (a *App) SaveFileDialog(title string, defaultName string, filters []string) (string, error)

// project files
func (a *App) ReadFile(path string) ([]byte, error)
func (a *App) WriteFile(path string, contents []byte) error
```

**Go must not:**

- Generate, modify, or validate geometry.
- Know what a tree is.
- Contain a copy of any generator logic.

**Go must:**

- Return native dialogs with sensible filters (`.json` for projects, `.glb`
  for exports).
- Read and write bytes, and nothing else. All JSON validation is TypeScript's
  job, so error messages reach the user in the UI's voice.
- Refuse to write outside a user-chosen path, and report failures as plain
  errors.

Go tests cover: file round-trip, path handling, and error propagation for
missing and unwritable paths.

---

## 11. Editor state

Zustand, one store.

```ts
interface EditorStore {
  // serializable
  scene: Scene
  style: StyleProfileId
  /** The preset the tree came from. */
  presetId: string
  /** Where the sun is and how strong the shadow is. */
  lighting: SceneLighting
  /** How the viewport draws the tree. */
  shadingMode: ShadingMode
  selection: SelectionState
  status: { state: 'ready' | 'busy' | 'error'; message?: string }
  // non-serializable, deliberately kept out of the persisted state
  history: History
}
```

Rules:

- Only `scene`, `style`, and the user-facing portion of `selection` are
  persisted. History is session-only.
- Components subscribe to slices; a slider drag must not re-render the whole
  tree panel.
- The Three.js scene is **not** in the store. It lives in the viewport
  module and reads the store.

### 11.1 What is part of the tree and what is part of the view

The distinction decides what is undoable and what travels into the export.

| | Part of the tree | Part of the view |
|---|---|---|
| Shape, proportions | yes | |
| Colours | yes | |
| Style profile (low-poly / detailed) | yes | |
| The sun and its shadow | | yes |
| The shading mode (lit / flat / wireframe) | | yes |

A view preference is not undoable and is not written to the project file.
The style profile is on the left because it changes the geometry, so it
belongs to the document and is undoable like any other edit.

### 11.2 The theme store

The theme is app chrome rather than editor content, so it has its own small
store. It is deliberately separate from the editor store: switching the
theme must not touch the scene, and the scene must not be able to change the
theme.

The theme is applied by writing `data-theme` onto the document element, so
the whole interface flips through one CSS cascade rather than a per-component
branch. The choice is stored in local storage under `easy-props.theme`; it is
a UI preference, not project data, so it does not belong in the Go-backed
project file.

Until the user makes an explicit choice, the store follows the operating
system preference, including live changes to it.

---

## 12. Undo and redo

A command stack over `Scene` operations.

```ts
interface Command {
  readonly label: string          // "move branch tip"
  apply(scene: Scene): Scene
  invert(scene: Scene): Scene
}
```

- Each command stores the **before** and **after** scene, not a mesh.
- A slider drag creates one command on release, not one per frame.
- Depth is capped at 200 entries.
- Undo restores the scene and regenerates only the affected components.
- The history is not persisted across sessions.

This satisfies TDR §7's requirement to "record meaningful edits rather than
cloning all mesh buffers for every operation".

---

## 13. Testing strategy

TDR §14 lists nine required tests. Here is where each one lives.

| TDR §14 requirement | Test file |
|---|---|
| 1. Default parameters are valid | `assets/trees/branching-tree-generator.test.ts` |
| 2. Invalid parameters are rejected or clamped | `assets/shared/validation.test.ts` |
| 3. Same parameters and seed produce equivalent output | `assets/shared/determinism.test.ts` |
| 4. Different seeds vary without breaking constraints | `assets/shared/determinism.test.ts` |
| 5. Branch attachment references are valid | `core/scene/scene-ops.test.ts` |
| 6. Generated geometry contains finite coordinates | `assets/shared/geometry-utils.test.ts` |
| 7. Generated meshes are non-empty when expected | `assets/trees/branching-tree-generator.test.ts` |
| 8. Project save/load preserves editable parameters | `core/project/project-file.test.ts` |
| 9. GLB export completes for the representative presets | `export/glb-exporter.test.ts` |

Plus, from this spec:

| Requirement | Test file |
|---|---|
| Scene ops are pure (input is not mutated) | `core/scene/scene-ops.test.ts` |
| Undo/redo round-trips the scene | `core/history/history.test.ts` |
| Style switching preserves silhouette | `assets/style/style-profiles.test.ts` |
| Geometry layer imports no UI code | ESLint rule, enforced in CI |

**Test layers**

1. **Unit** — pure functions, generators, validation. Fast, no DOM.
2. **Geometry invariants** — a property-based sweep over 10,000 random
   parameter sets asserting finite coordinates, non-empty geometry, and
   bounded polygon counts.
3. **Integration** — scene ops, history, project round-trip.
4. **Export** — export each preset, reload with `GLTFLoader`, assert mesh
   count and finite vertices.
5. **Go** — file I/O and dialog wrappers.

---

## 14. Performance budget

| Operation | Target |
|---|---|
| Generate a default tree | Under 50ms |
| Regenerate one component | Under 8ms |
| Regenerate a whole tree after a style switch | Under 200ms |
| Live slider drag | 60fps, no dropped frames |
| Export GLB | Under 1s |
| Cold start to a visible tree | Under 2s |

If a target is missed, profile before optimizing. TDR §13 is explicit that
worker threads and GPU compute are out of scope until profiling proves the
need.

---

## 15. Traceability to the TDR

| TDR section | Spec section |
|---|---|
| §6.3 Art styles as profiles | §6 |
| §6.4 Geometry quality | §9, §13, §14 |
| §7 Editing model | §4, §11 |
| §7 Undo/redo | §12 |
| §8 Stack and the important boundary | §1.4, §2.1 |
| §8 Go/Wails responsibility boundary | §10 |
| §9 Proposed project structure | §2 |
| §10 Generator contract | §3 |
| §11 Project file and persistence | §8 |
| §12 GLB export | §9 |
| §13 Performance and quality | §13, §14 |
| §14 Testing requirements | §13 |
