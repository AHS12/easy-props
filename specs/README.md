# easy-props — Specification Package

These specs set out what the product is and what it must not do, how it is
built, what it looks like, and how each piece is verified.

## Contents

| File | Purpose | Audience |
|---|---|---|
| [`01-product-spec.md`](./01-product-spec.md) | Persona, core journey, feature scope and priority, terminology mapping, success metrics | Everyone |
| [`02-ui-ux-spec.md`](./02-ui-ux-spec.md) | Visual language, app shell layout, component specs, interaction rules, all UI states, accessibility | Frontend, design |
| [`03-architecture-spec.md`](./03-architecture-spec.md) | Module boundaries, generator contract, scene graph, persistence schema, export pipeline, Go boundary | Frontend, backend |
| [`04-roadmap.md`](./04-roadmap.md) | Milestones, deliverables, definition of done, dependencies | Everyone |
| [`05-painted-trees.md`](./05-painted-trees.md) | How painted trees are built, their controls and presets | Frontend |
| [`06-game-ready-export.md`](./06-game-ready-export.md) | Merged meshes, detail levels, collision, wind, batch export, and the generic prop pipeline | Everyone |
| [`07-ui-overhaul.md`](./07-ui-overhaul.md) | Editor-style layout on HeroUI, settings, and command palette improvements. Built | Frontend, design |
| [`design-tokens.css`](./design-tokens.css) | Implementable design tokens: color, type, space, radius, elevation, motion | Frontend |
| [`prototype/index.html`](./prototype/index.html) | Interactive visual reference of the app shell and components | Design, product |

## How the pieces relate

```
01-product-spec  ──scopes──▶  04-roadmap
  │
  ├──sets behaviour──▶  02-ui-ux-spec
  │
  └──sets contracts──▶  03-architecture-spec
                              │
         design-tokens.css ───┤
         prototype/index.html ┘
```

## Ground rules that outrank any spec

1. **Beginner-first, always.** Any new feature must be reachable by the
   persona in [`01-product-spec.md`](./01-product-spec.md) without reading
   documentation. If it needs a tutorial, it needs redesigning.
2. **No jargon in the default surface.** The terminology mapping in the
   product spec is binding on all user-visible strings.
3. **No claim without verification.** A spec item is "done" when the
   definition of done in [`04-roadmap.md`](./04-roadmap.md) is met and
   verified, not when the code exists.
5. **Correctness beats cleverness.** Geometry that is stable, finite, and
   exportable matters more than a beautiful preview.

## Status

| Spec | State |
|---|---|
| Product spec | Drafted, awaiting review |
| UI/UX spec | Drafted, awaiting review |
| Architecture spec | Drafted, awaiting review |
| Roadmap | Drafted, awaiting review |
| Game-ready export | Done, a few engine checks never run |
| UI overhaul | Planned, awaiting review |
| Design tokens | Drafted, awaiting review |
| Prototype | Drafted, awaiting review |
