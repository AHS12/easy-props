# easy-props

A procedural tree modeling tool for game assets.

`easy-props` lets a beginner game developer create stylized low-poly and
stylized-detailed trees from reusable shapes and presets, adjust them with
plain-language controls, and export them as GLB for Blender, Unreal Engine, or
Godot. It is a focused modeling companion, not a general-purpose replacement
for Blender.

The full product specification lives in
[`tree_modeling_tool_TDR_Wails_Go.md`](./tree_modeling_tool_TDR_Wails_Go.md).

## Stack

| Layer      | Technology                                          |
|------------|-----------------------------------------------------|
| Desktop    | Wails v2 (Go)                                       |
| UI         | React 19 + TypeScript                               |
| 3D         | Three.js                                            |
| State      | Zustand                                             |
| Validation | Zod                                                 |
| Tests      | Vitest (frontend), Go `testing` (backend)           |
| Packages   | pnpm                                                |

Go is responsible for desktop integration only: native open/save dialogs and
reading and writing versioned project JSON. All procedural geometry, editor
state, and GLB export live in TypeScript.

## Getting started

Requires Go, Node.js, pnpm, and the Wails CLI (`wails doctor` should report
success).

```bash
# Live development with hot reload
wails dev

# Production build -> build/bin/easy-props.exe
wails build
```

## Frontend scripts

Run from the `frontend/` directory.

| Script              | Purpose                              |
|---------------------|--------------------------------------|
| `pnpm dev`          | Vite dev server                      |
| `pnpm build`        | Typecheck and bundle for production  |
| `pnpm typecheck`    | TypeScript type checking only       |
| `pnpm lint`         | ESLint                               |
| `pnpm test`         | Vitest test suite                    |
| `pnpm test:watch`   | Vitest in watch mode                 |

## Project layout

```text
frontend/src/
  assets/shared/    Seeded random utilities and shared generator helpers
  tests/            Test suite
backend/            Go packages: project files, dialogs
main.go, app.go     Wails entry points
```

The procedural geometry modules under `frontend/src/assets/` are plain
TypeScript with no React or Wails dependency, so they stay independently
testable and reusable in another runtime.

## Status

Work proceeds in the milestones defined in the TDR. The current milestone is
tracked in the repository history.
