# easy-props

A desktop app that makes game-ready 3D props for people with no 3D experience. Wails (Go)
for the shell, React, TypeScript and Three.js for everything else.

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Its rules apply to you, and this file only
adds what an agent needs on top of them.

## Commands

Run these from the repository root. On Windows, `make` uses Git Bash.

| Command | Does |
|---|---|
| `make check` | Every lint, test and build check. Run this before calling work done |
| `make lint` | TypeScript types, ESLint, golangci-lint |
| `make test-frontend` | Vitest, using Node 22 fetched by `pnpm dlx` |
| `make test-go` | Go tests |
| `make web` | The interface alone, in a browser |
| `make dev` | The desktop app with hot reload |
| `make previews` | Draw every preset's picture again, in a browser |

To run one test file:

```bash
cd frontend && pnpm dlx node@22 node_modules/vitest/vitest.mjs run src/tests/grass.test.ts
```

The hooks run lint on commit and all tests on push. Don't skip them with `--no-verify`.
Commit or push only when asked. Work on `dev`, and don't touch `main`.

## How the code is arranged

- `backend/` only handles files and native dialogs. Geometry, editing and export are all
  TypeScript. The frontend reaches Go through `frontend/src/platform`, and
  `frontend/wailsjs` is generated, so don't edit it by hand.
- `frontend/src/assets/` is pure geometry. ESLint rejects React, Zustand and Wails imports
  there.
- `frontend/src/assets/prop-generators.ts` lists every prop generator, and
  `assets/shared/generator-types.ts` is their contract.
- `frontend/src/assets/trees/presets/index.ts` holds the presets for every kind of prop, not
  only trees.
- The scene model in `core/scene` is the source of truth. The Three.js scene is rebuilt from
  it, so nothing that matters can live only in a mesh.

## Rules that are easy to break

- **Randomness:** generators use only the random source and seed they're given. Nothing
  enforces this, so check it yourself. There's no lint rule for `Math.random` or `Date.now`.
- **Generator output:** if the same settings now make different geometry, raise `version`.
  Keep old generators so saved props still open.
- **Words on screen:** follow the terminology table in `docs/terminology.md`. "Mesh",
  "vertex", "UV" and "normal" are never shown. Write labels, tooltips and the changelog in
  plain language.
- **Preset pictures:** these ship with the app, so nobody's computer has to draw them. A test
  fails when one is out of date. Run `make previews` and commit the pictures.
- **Sizes:** a postcss step in `vite.config.ts` turns stylesheet pixels into rems, and the
  interface scale sets the root font size. In code, use `rem` or `uiScale()`, never CSS zoom.
- **Licensing:** add no downloaded assets or copied code. Things are generated.
- **Long work:** use `afterPaint()` from `core/export/pipeline/yield.ts`, so progress can draw
  before slow work blocks the page.

## Style

Match the code around you: four-space indent, no semicolons, single quotes, no spaces inside
import braces. Comments are few, and explain why rather than what. Test names read as plain
sentences about behavior. Tests sit in `frontend/src/tests`, or beside the code they cover.

## Reporting your work

Say what you ran and what you actually saw. A passing test doesn't show that a slider feels
right or that a scene looks good, so for visual work, look at it, and say so if you couldn't.

## Skills

Task guides are in `.claude/skills/`. Read the matching one before starting, whichever agent
you are:

- `add-prop`: a new preset or prop generator
- `try-in-browser`: run the interface and check a change by looking at it
- `release`: publish a new version
