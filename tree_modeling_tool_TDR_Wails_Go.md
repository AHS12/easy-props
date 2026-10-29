# Technical Design Requirements (TDR)

## Procedural Tree Modeling Tool for Game Assets

**Document status:** Initial implementation specification\
**Audience:** Coding agents and engineers\
**Product stage:** MVP\
**Primary objective:** Make it fast and approachable for a beginner to
create stylized low-poly and stylized-detailed trees, then export them
for refinement in Blender or use in a game engine.

------------------------------------------------------------------------

## 1. Product Summary

Build a lightweight desktop-oriented 3D modeling tool focused initially
on tree creation. The user should be able to create attractive trees in
a few clicks by combining a rich library of ready-made shapes,
structural parts, presets, and procedural generators. Users should be
able to drag and drop components into the scene, reposition and reshape
them with direct manipulation, adjust a small number of understandable
properties, and export the result.

This is **not** a general-purpose replacement for Blender. It is a
focused modeling companion that hides technical complexity and provides
useful starting shapes immediately.

The architecture must support future asset families such as rocks,
grass, bushes, roots, logs, and simple environmental props without
requiring a rewrite of the editor core.

### Core product principle

**Start with useful shapes and presets; let users assemble and adjust
them. Do not force users to generate every component from a blank
canvas.**

The initial experience should be closer to arranging and shaping
components than traditional polygon modeling.

------------------------------------------------------------------------

## 2. Goals

1.  Create a complete tree from a preset in one click.
2.  Support both:
    -   **Stylized low-poly:** clean silhouettes, simple geometry, low
        polygon counts.
    -   **Stylized detailed:** curved or twisted trunks, expressive
        roots, irregular branches, layered foliage.
3.  Make shape reuse central: provide a browsable library of ready-made
    trunks, branches, roots, fronds, foliage clusters, and tree presets.
4.  Support drag-and-drop placement of components and direct
    manipulation of their handles.
5.  Keep models procedurally editable after creation.
6.  Provide deterministic generation so the same project and seed
    reproduce the same result.
7.  Save and reopen editable projects.
8.  Export usable GLB/glTF assets for Blender, Unreal Engine, and Godot
    workflows.
9.  Keep the app lightweight and maintainable.
10. Allow future generators to plug into the same editor without
    changing shared editor infrastructure.

## 3. Non-goals for the MVP

Do not implement these unless explicitly requested later:

-   A complete Blender replacement.
-   General sculpting or arbitrary vertex/edge/face editing. **Amended
    2026-10-29:** at the user's explicit request, a constrained surface push
    and pull is now in scope. It is limited to pushing a part's surface in
    or out along its own normal. Arbitrary vertex, edge, and face editing
    stays out of scope. See §7.1.
-   Full skeletal rigging or animation authoring.
-   Advanced UV editing or a node-based material editor.
-   Terrain generation, physics simulation, or a full game engine.
-   AI generation as a required dependency.
-   A marketplace or plugin ecosystem.
-   A complex node graph for procedural modeling.

Blender remains the optional advanced-refinement step.

------------------------------------------------------------------------

## 4. Target User and UX Requirements

The target user is a beginner game developer who understands the shape
they want but does not want to learn traditional 3D modeling terminology
first.

### UX requirements

-   Show the 3D viewport immediately.
-   Use clear visual preset cards with thumbnails or simple previews.
-   Make common actions discoverable without reading documentation.
-   Prefer direct manipulation and plain-language controls over
    technical mesh controls.
-   Avoid exposing vertices, edges, faces, topology, or shader nodes in
    the default workflow.
-   Provide useful defaults; a generated tree must look intentional
    before any tweaking.
-   Keep controls contextual: show trunk controls when a trunk is
    selected, foliage controls when foliage is selected.
-   Provide undo and redo for user-visible edits.
-   Provide visible selection and hover feedback.
-   Do not require AI or internet connectivity for core functionality.

### Primary workflow

1.  Choose a tree preset or start from a blank tree.
2.  The application generates a complete, visually useful tree.
3.  Add parts from the shape library using drag-and-drop or a clear
    "Add" action.
4.  Select and drag trunk/branch/frond handles to change shape.
5.  Adjust simple properties such as height, thickness, curvature,
    foliage size, and density.
6.  Save the editable project.
7.  Export GLB when ready.

------------------------------------------------------------------------

## 5. Critical Requirement: Shape Library and Fast Assembly

The shape library is a first-class feature, not a future nice-to-have.
The tool must make a large portion of the design work possible by
reusing existing shapes.

### 5.1 Initial shape library

Organize reusable parts into searchable or browsable categories:

**Trunks** - Straight tapered trunk - Slightly curved trunk - Strongly
curved trunk - Twisted trunk - Forked trunk - Thick ancient trunk - Slim
young trunk - Segmented palm trunk

**Branches** - Short upward branch - Long sweeping branch - Drooping
branch - Forked branch - Curved branch - Knotted/irregular branch -
Small twig - Branch with adjustable taper

**Roots** - Short root - Wide spreading root - Curved exposed root -
Buttress-like root - Multiple-root cluster

**Foliage clusters** - Round cluster - Oval cluster - Flat/wide
cluster - Tall cluster - Irregular cluster - Layered cluster - Sparse
cluster - Dense cluster

**Palm components** - Palm crown - Arched frond - Drooping frond -
Upright frond - Frond with generated leaflets - Coconut cluster

**Optional details** - Bark ridges - Knots - Hollow/trunk opening (later
if reliable) - Mushrooms, vines, or hanging roots (later)

These are reusable procedural components or mesh templates. The first
implementation does not need every listed variation to be perfect, but
the architecture and UI must allow the library to grow.

### 5.2 Preset trees

Initial presets should include: - Simple round-canopy tree - Wide-canopy
tree - Tall narrow tree - Twisted fantasy tree - Exposed-root ancient
tree - Coconut palm - Generic tropical palm

A preset must generate a complete tree, not just an isolated trunk or
canopy.

### 5.3 Assembly behavior

-   Users can add a library part to the selected tree with one click.
-   Drag-and-drop from the library into the viewport should be supported
    where practical; if implementation complexity is high, ship
    click-to-add first but design the library API to support
    drag-and-drop.
-   Added parts should have sensible default attachment points.
-   Branches should be attachable to trunks or other branches.
-   Palm fronds should attach to the palm crown.
-   Foliage clusters should be easy to place, duplicate, rotate, scale,
    and randomize.
-   Duplicating a component should preserve its editable parameters
    while giving it a unique identity.
-   Randomization must be seed-based and reproducible.
-   Provide a "Randomize variation" action that preserves the tree's
    overall structure rather than producing a completely unrelated
    result.

### 5.4 Avoid the "blank canvas" trap

The default experience must never require the user to build a tree part
by part from nothing. A complete preset and a usable set of component
shapes must be available from the beginning.

------------------------------------------------------------------------

## 6. Tree Generator Requirements

Trees are the first asset family. Use specialized tree-family generators
that share editor infrastructure and reusable geometry utilities.

### 6.1 Branching tree generator

Support: - Trunk height and base radius - Trunk taper - Trunk curvature
and twist - Branch count and distribution - Branch length, angle,
curvature, and taper - Branch hierarchy (major branches and child
branches) - Optional exposed roots - Foliage cluster count, size, shape,
and distribution - Asymmetry and controlled randomness - Style/detail
setting - Seed

The generated tree should have a coherent silhouette and reasonable
branch attachment. It should not look like disconnected cylinders unless
the user deliberately chooses a simple geometric style.

### 6.2 Palm generator

Palms are structurally different from branching broadleaf trees and must
use a dedicated generator.

Support: - Trunk height, curvature, and taper - Optional
segmented/ringed trunk appearance - Crown position and size - Frond
count - Frond length and arch - Frond droop - Leaflet count and
spacing - Leaflet width/shape (within a stylized scope) - Coconut count,
size, and cluster placement - Style/detail setting - Seed

Initial palm preset: coconut palm. A generic tropical palm can reuse the
same generator with different defaults.

### 6.3 Art styles

Use style profiles rather than duplicating each generator.

**Stylized low-poly** - Lower segment counts - Clear silhouettes -
Simple geometric foliage clusters - Flat shading as an option -
Controlled, restrained detail

**Stylized detailed** - More curve segments - More irregular trunk and
branch profiles - More expressive roots - Layered and varied foliage
clusters - Optional bark details

Art style should configure geometry and appearance defaults, not replace
the underlying tree structure.

### 6.4 Geometry quality

-   Generate real 3D geometry; viewport-only fake geometry is not
    acceptable.
-   Avoid obvious gaps at branch attachment points where feasible.
-   Ensure geometry is stable when parameters change.
-   Clamp invalid values and validate parameter ranges.
-   Provide sensible minimum and maximum values.
-   Optimize geometry to avoid excessive polygon counts by default.
-   Keep generated geometry exportable to GLB.
-   Prefer geometry reuse and regeneration of only affected components
    where practical, but correctness is more important than premature
    optimization.

------------------------------------------------------------------------

## 7. Editing and Interaction Requirements

### Required interactions

-   Orbit, pan, and zoom the viewport.
-   Select a tree or individual component.
-   Move, rotate, and scale selected components.
-   Drag editable handles for trunk curves, branch endpoints, roots, and
    fronds.
-   Duplicate and delete components.
-   Push and pull the surface of a selected component.
-   Undo and redo.
-   Reset a component or tree to its preset defaults.
-   Randomize a tree while preserving its primary parameters.
-   Switch between low-poly and stylized-detailed styles.

### 7.1 Surface push and pull

A user can push a part's surface out or pull it in, by hand, to make a tree
look more natural than a generator produced it. This is explicitly requested
and is a deliberate, bounded exception to §3.

-   It is a **surface** operation, not a mesh operation. The push is stored
    as a generator parameter, and the mesh is regenerated from it. The
    parameterized scene graph stays the source of truth, so undo, save and
    reopen, and seed determinism all keep working.
-   It is limited to moving a part's surface along its own normal. There is
    no vertex selection, no edge selection, no face selection, and no
    arbitrary mesh editing.
-   It applies to the trunk, branches, roots, and foliage clusters.
-   A push is recorded with where it was made, how far, and how wide it
    reaches, so it survives a save and reopen.

### Editing model

The editable source of truth is a parameterized scene graph, not the
generated mesh alone.

Each procedural component should have: - Stable unique ID - Component
type - Parent/attachment reference where applicable - Transform -
Generator parameters - Optional style overrides - Seed or deterministic
variation data

When a user edits a component, update its parameters and regenerate its
mesh. Do not make the generated Three.js mesh the only representation of
the user's work.

### Undo/redo

Use a command or state-history approach that records meaningful edits
(e.g., "move branch endpoint," "add foliage cluster," "change trunk
thickness"), rather than cloning all mesh buffers for every operation.

------------------------------------------------------------------------

## 8. Recommended Technology Stack

-   **Backend/native language:** Go
-   **Desktop shell:** Wails
-   **Frontend language:** TypeScript
-   **UI:** React
-   **3D viewport and procedural geometry:** Three.js
-   **State management:** Zustand, or a similarly lightweight store
-   **Frontend schema validation:** Zod
-   **Frontend testing:** Vitest
-   **Go testing:** Go's standard `testing` package
-   **Export:** Three.js-compatible glTF/GLB exporter
-   **Editable project format:** Versioned JSON
-   **Package manager:** Use one package manager consistently (prefer
    pnpm if no repository convention exists)

Use current stable, mutually compatible versions at implementation time.
Avoid adding dependencies without a clear need. Follow Wails' standard
project structure and generated bindings conventions.

### Important boundary

The procedural geometry modules must not depend on React or the desktop
shell. They should be ordinary TypeScript modules that can be tested
independently and potentially reused in another runtime.

Three.js objects may be used at the rendering boundary, but the editable
model and generation parameters should remain serializable and
independent from UI state.

### Go/Wails responsibility boundary

Use **Wails + Go for desktop integration**, not as the primary 3D geometry
engine.

Go should handle:
- Native open/save dialogs and other desktop OS integration.
- Reading and writing versioned project JSON files.
- App-level file operations and safe path handling.
- Small native utilities only when they are actually needed.

TypeScript should handle:
- React UI and editor state.
- Three.js viewport, scene interaction, and geometry generation.
- Procedural tree and component generators.
- Undo/redo state, parameter validation, and GLB export.

Keep procedural geometry in TypeScript because it is built around
Three.js and needs to update interactively in the viewport. Do not
duplicate the same generator logic in Go. Use Wails-generated bindings
for calls from the frontend to Go, and keep the Go API small and explicit.
The core editor and generator modules must remain testable without
launching the desktop shell.

------------------------------------------------------------------------


### Desktop framework decision

The selected desktop framework is **Wails with Go**. Do not scaffold
Tauri, Rust, `src-tauri`, or a Rust backend. Use the official Wails
project generator and follow the generated project conventions. The
frontend remains a normal React + TypeScript application, and all
procedural 3D generation remains in TypeScript/Three.js.

## 9. Proposed Project Structure

Adjust names as needed to fit repository conventions, but preserve
separation of responsibilities.

``` text
frontend/
  src/
    app/
    components/
    panels/
    viewport/
    core/
      scene/
      selection/
      interaction/
      history/
      project/
    assets/
      shared/
        generator-types.ts
        parameters.ts
        random.ts
        geometry-utils.ts
      trees/
        tree-model.ts
        tree-generator.ts
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
    export/
      glb-exporter.ts
    tests/

backend/
  app.go
  projectfiles/
  dialogs/
  # Add Go packages only when needed.

main.go
wails.json
go.mod
package.json
```

This is a conceptual layout. Use the structure generated by the selected
Wails version as the starting point, and adapt names without fighting its
conventions.

Do not create empty abstractions for every future idea. Introduce
modules when they support the MVP, while keeping the generator boundary
clean.

------------------------------------------------------------------------

## 10. Generator Contract

Define a shared, typed generator contract for all procedural asset
families. The exact implementation may evolve, but it should cover:

-   Stable generator ID and version
-   Default parameter creation
-   Parameter validation
-   Deterministic generation using a seed
-   Generation of one or more renderable meshes
-   Metadata needed to preserve editable components
-   A way to regenerate after parameter changes

Conceptual example:

``` ts
interface AssetGenerator<P, M> {
  id: string;
  version: number;
  getDefaultParameters(): P;
  validate(parameters: P): ValidationResult;
  generate(parameters: P, seed: number): GeneratedAsset<M>;
}
```

Use concrete TypeScript types for actual implementation. Avoid `any` and
avoid turning the generator contract into an overly generic framework
before a second real generator exists.

Future generators (rocks, grass, bushes) should be able to implement
this contract without changes to selection, undo/redo, project
persistence, or export infrastructure.

------------------------------------------------------------------------

## 11. Project File and Persistence

Use a versioned JSON project format. It must preserve: - Project schema
version - Asset/component IDs - Generator IDs and versions - Editable
parameters - Component hierarchy and attachment references -
Transforms - Style settings - Random seeds - Optional user overrides

Requirements: - Validate project data when loading. - Handle unknown or
unsupported schema versions with a clear error. - Never silently discard
editable parameters. - Keep project data separate from Three.js runtime
objects. - Provide a migration path when the project schema changes. -
Saving and reopening a project should reproduce the same generated tree.

The exact schema should be implemented alongside the first working tree
generator rather than speculated into excessive complexity.

------------------------------------------------------------------------

## 12. GLB Export

Export a valid GLB/glTF file that can be opened in Blender and imported
into Unreal Engine or Godot.

Requirements: - Export real mesh geometry and materials. - Preserve
object transforms correctly. - Use sensible object names. - Support
exporting the complete tree. - Ensure generated meshes have valid
normals. - Avoid relying on application-specific custom data for the
exported geometry to render. - Verify export with at least one test
asset in a compatible viewer or Blender.

The editable project file and exported GLB serve different purposes. GLB
is the generated asset; the versioned project file is the source for
further procedural editing.

Do not promise perfect UVs or advanced material authoring in the MVP.
Identify any export limitations clearly.

------------------------------------------------------------------------

## 13. Performance and Quality

-   The app should remain responsive while editing typical low-poly
    trees.
-   Use reasonable default polygon budgets.
-   Avoid regenerating unrelated assets when one component changes.
-   Dispose of obsolete Three.js geometries and materials when replacing
    them.
-   Keep random generation deterministic.
-   Use unit tests for parameter validation, seed determinism, and
    geometry invariants.
-   Include visual/manual test cases for silhouette, attachment, and
    export quality.
-   Handle malformed project files and invalid parameters without
    crashing.
-   Avoid premature worker-thread or GPU-compute complexity until
    profiling demonstrates a need.

------------------------------------------------------------------------

## 14. Testing Requirements

At minimum, add tests for: 1. Default parameters are valid. 2. Invalid
parameter values are rejected or safely clamped. 3. The same parameters
and seed produce equivalent output. 4. Different seeds can produce
variation without breaking constraints. 5. Branch attachment references
are valid. 6. Generated geometry contains finite coordinates. 7.
Generated meshes have non-empty geometry when expected. 8. Project
save/load preserves editable parameters. 9. GLB export completes for the
representative tree presets.

Manual acceptance checks: - Generate the default branching tree. -
Generate a coconut palm. - Switch both between low-poly and
stylized-detailed settings. - Add, duplicate, move, and delete a branch
or foliage component. - Save, reopen, and continue editing. - Export GLB
and inspect it in Blender or a compatible viewer.

------------------------------------------------------------------------

## 15. Implementation Plan for the Coding Agent

Work incrementally. Do not implement the entire roadmap in one pass.

### Milestone 1: Foundation

-   Inspect the repository and follow its existing conventions.
-   If the repository is empty, scaffold the agreed stack.
-   Set up the viewport, camera controls, lighting, ground/grid, and
    basic selection.
-   Add linting, type checking, and tests.
-   Keep the application runnable.

### Milestone 2: First useful tree

-   Implement the editable tree model and generator contract.
-   Implement trunk generation and simple foliage clusters.
-   Add at least one complete branching-tree preset.
-   Add basic parameters in the UI.
-   Ensure it looks like an intentional stylized tree immediately after
    generation.

### Milestone 3: Shape library and fast assembly

-   Add a visible library of ready-made trunk, branch, root, and foliage
    shapes.
-   Allow users to add and duplicate components quickly.
-   Implement direct manipulation for the most important control points.
-   Prioritize sensible attachment defaults and rapid iteration.

### Milestone 4: Palm tree

-   Implement the specialized palm generator.
-   Add fronds, leaflets, and optional coconut clusters.
-   Include a complete coconut palm preset.

### Milestone 5: Save and export

-   Add versioned JSON project persistence.
-   Add GLB export and verify the result outside the application.

After each milestone, run type checking and tests, fix regressions, and
report what works and what remains incomplete.

Do not claim a feature is complete unless it has been implemented and
verified.

------------------------------------------------------------------------

## 16. Acceptance Criteria for the Initial MVP

The MVP is acceptable when a beginner can:

1.  Open the app and see a usable 3D viewport.
2.  Create a complete tree from a preset with one click.
3.  Browse and reuse ready-made tree components.
4.  Add, duplicate, move, and remove components without traditional mesh
    editing.
5.  Adjust basic tree parameters.
6.  Produce both low-poly and stylized-detailed appearances.
7.  Create a recognizable coconut palm from a preset.
8.  Save and reopen an editable project.
9.  Export a GLB that opens correctly in Blender or a compatible viewer.
10. Complete the core workflow without AI or internet connectivity.

The shape library is a core acceptance criterion. A tool that only
exposes numeric sliders and forces users to construct every tree
component from scratch does not satisfy the intended product vision.

------------------------------------------------------------------------

## 17. Guidance for the Coding Agent

-   First inspect the existing repository, its package manager, and
    current architecture.
-   If code already exists, adapt the design to the repository rather
    than replacing working infrastructure unnecessarily.
-   Implement the smallest complete vertical slice first.
-   Prefer readable, strongly typed code over premature abstractions.
-   Keep the geometry algorithms independently testable.
-   Do not build a generic procedural node system for the MVP.
-   Do not make AI, Blender, or network access mandatory.
-   Do not substitute a static screenshot or a decorative mockup for a
    functioning viewport.
-   Do not implement only a primitive viewer; the first meaningful
    milestone must produce a complete tree.
-   Treat shape presets and component reuse as essential product
    functionality.
-   When a requirement is ambiguous, choose the simplest implementation
    that preserves editability and future extensibility, document the
    decision, and continue.
-   At the end of each milestone, summarize changed files,
    functionality, tests run, known limitations, and the next milestone.

## 18. Guiding Principle

**Make the first tree easy, make editing intuitive, and make adding the
next asset family inexpensive.**

The MVP should prove that a beginner can create and customize useful
game-ready tree shapes quickly. All architecture should serve that goal
rather than become an end in itself.
