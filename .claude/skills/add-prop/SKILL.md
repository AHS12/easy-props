---
name: add-prop
description: Add a preset or a new prop generator to easy-props. Use when asked to add, tune or change a tree, rock, bush, plant, grass or other prop, or a starting point in the gallery.
---

# Adding a prop

Decide first which one this is. A new look from existing controls is a **preset**. A shape
the existing controls can't reach is a **generator**. Prefer a preset.

## A preset

1. Add it to `frontend/src/assets/trees/presets/index.ts`, which holds every kind of prop,
   using the helper its neighbours use.
2. Give it a plain name, a short `sub` line and a fixed seed. Only set the parameters that
   differ from the generator's defaults.
3. Look at it. See the `try-in-browser` skill.

## A generator

1. Read `frontend/src/assets/shared/generator-types.ts`, then copy the structure of the
   closest generator. `grass/grass-generator.ts` is a compact example.
2. Keep parameters in `ParameterSpec` entries, with plain labels from the terminology table
   in `docs/terminology.md`. `validate` clamps and never throws.
3. Set the flags that apply: `still` for something wind doesn't move, `swaysEvenly`,
   `paintsOwnColours`, and `budgetAdvice` in the words of its own controls.
4. Draw every random choice from `context.random` or the seed. Don't use `Math.random` or
   the clock, or mutate the input.
5. Register it in `frontend/src/assets/prop-generators.ts`, and add at least one preset.
6. Add `frontend/src/tests/<name>.test.ts`. Cover at least:
   - the same seed gives the same geometry
   - extreme parameter values stay finite
   - the face count stays within budget
7. Export it and check the files, not only the view.

## Changing an existing generator

If the same settings now produce different geometry, raise `version`. If the look changes
so much that saved props would no longer be what people made, add a new generator and keep
the old one, as `rock-generator.ts` and `cut-rock-generator.ts` do.

## Before you finish

- If you added a preset or changed what one makes, run `make previews` and commit the pictures.
- Run `make lint` and `make test-frontend`.
- Compare it with what's already in the Meadow scene. It should look as if it belongs there.
