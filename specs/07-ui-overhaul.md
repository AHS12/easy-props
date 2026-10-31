# 07 — UI overhaul, settings and command palette

Status: built on 2026-10-31, apart from the items in [What shipped](#what-shipped).
Extends [`02-ui-ux-spec.md`](./02-ui-ux-spec.md). Where the two disagree, this one is newer.

## What shipped

**Spike result: HeroUI v3 stays.** Measured in a dev build with 30 sliders on screen, against
React Aria directly and the old native slider.

| Check | HeroUI | React Aria | Native |
|---|---|---|---|
| Time to render one change, median | 4.2 ms | 3.7 ms | 0.9 ms |
| Time to mount 30, median | 8.5 ms | 13 ms | 2.6 ms |

All are well inside a 16 ms frame, and the tree rebuild dominates a drag either way. Tailwind's
reset is safe because the old CSS was replaced rather than kept beside it. Bundle growth from
the old build: 346 KB of JavaScript for HeroUI, React Aria and Lucide, and about 460 KB of CSS
(50 KB gzipped).

HeroUI is used for the slider, switch, select, tooltip, modal, popover and menus, and only
imported from `components/` and the two files that draw menus. The Outliner uses React Aria's
`Tree`. The theme lives in `styles/tokens.css` and `styles/app.css`.

**Beyond this spec:** the window is frameless on the desktop, with the menu bar as its title bar
and our own window controls, and the interface uses the system font. Nunito is gone.

**Cut, or left for later:**

| Item | Why |
|---|---|
| Live preview in the palette | The spec allowed cutting it. Applying a preset per arrow key would disturb undo and the bark workers |
| Preset right-click menu | Optional in the spec, and nobody needs it yet |
| Name pattern setting | Nothing reads a pattern yet, so the "only real settings" rule keeps it out |
| Preview quality while dragging | No such feature exists yet, same rule |
| Open logs | The app writes no logs yet, same rule |
| Interaction checks on the real desktop | The window, its first paint and reading `settings.json` were checked in the built app. Everything else was checked in a browser. Dragging the window and its controls still needs a person |

## The goal

Someone who has used Blender or Unreal should feel at home within a minute. Someone
who has used neither should still make a good tree without reading anything.

Those two pull apart in only a few places. Familiar means where things are: viewport
in the middle, outliner on one side, details on the other, status along the bottom.
Beginner friendly means how they behave: plain names, good defaults, everything
reversible, and a hint wherever you are stuck. So we copy the layout and keep our
behaviour.

## What is wrong today

Found by reading the current code.

| Problem | Where | Why it matters |
|---|---|---|
| A slider takes about three rows, with its range printed underneath | `Slider.tsx` | The Trunk group alone fills the screen, with 30 sliders in all |
| Every slider has help text that is never shown | `spec.help` in `parameters.ts`, unused in `Slider.tsx` | The explanations already exist |
| A value cannot be typed or reset one at a time | `Slider.tsx` | Basic in every 3D tool |
| No way to find a control | `Inspector.tsx` | 30 sliders across 6 groups |
| No view of the parts of a tree | Selection only by clicking in the viewport | Roots and small clumps are hard to hit, and game developers expect an outliner |
| No settings at all, only a theme toggle in the top bar | `TopBar.tsx`, `theme-store.ts` | Camera, quality and export choices have nowhere to live |
| Preset shortcuts run `Ctrl+1` to `Ctrl+56` | `commands.ts` | Keys past 9 do not exist, and the palette and shortcut sheet list them |
| The palette opens on an unsorted list of about 80 entries, 56 of them presets | `CommandPalette.tsx` | Nothing recent or relevant comes first |
| Part commands show with nothing selected, and silently do nothing | `commands.ts` | Looks broken |
| Low-poly and Detailed are misleading on painted trees | `TopBar.tsx` | They only change density |
| 2,300 lines of hand-written CSS and hand-written controls | `styles/` | Slow to change, with focus and keyboard behaviour on us |

## Decisions

### Use HeroUI v3, adopted one piece at a time

Checked from the published npm package, version 3.2.7, on 2026-10-31.

| Fact | Effect |
|---|---|
| Apache-2.0 | Fine for this project |
| Needs React 19 | We have it |
| Needs Tailwind CSS v4 | New for us, and its reset could disturb existing CSS |
| Built on React Aria | Keyboard, focus and screen reader behaviour come for free, which is its main value here |
| No provider, themed through CSS variables | Our tokens can drive it |
| Has `slider`, `number-field`, `tabs`, `toolbar`, `menu`, `dropdown`, `modal`, `drawer`, `popover`, `tooltip`, `toast`, `select`, `combo-box`, `autocomplete`, `list-box`, `search-field`, `switch`, `kbd`, `disclosure-group`, `color-picker`, `color-swatch-picker`, `toggle-button-group`, `scroll-shadow`, `empty-state` | Covers nearly everything we draw |
| No `command` component in the free package | It is listed under HeroUI Pro. We build the palette ourselves from `modal`, `autocomplete` and `list-box` |
| No tree view in the component list | The outliner uses React Aria's `Tree` directly, which HeroUI already depends on |

**Its default look is a web app's: rounded, roomy and soft. An editor is dense.** So
the theme is ours. Radii, spacing and control heights are overridden in one place, and
nothing should look like a stock HeroUI page.

**Spike before committing.** Phase 0 replaces only the slider and one group, then
measures. If any of these fail, we use `react-aria-components` directly, with our own
styling. That loses the ready-made look and keeps the behaviour, and the rest of this
spec still stands.

| Check | Must hold |
|---|---|
| Dragging a slider on a tree | Same update rate as today, measured against the current slider |
| Thirty sliders on screen | No visible delay when opening a group or switching a selection |
| Tailwind's reset | The existing screens are visually unchanged, or the reset is scoped |
| Bundle | Growth is measured and reported. It matters less in a desktop app, so this informs and does not block |
| Compact theme | One row per slider looks right at 300 px wide |

### Look: neutral graphite, one accent

| Part | Choice |
|---|---|
| Surfaces | Neutral dark greys, so the colours of a tree are judged fairly. Today's warm tint shifts how they read |
| Accent | The existing moss green, for primary actions only |
| Selection | One bright colour, used only for selection, in the viewport and the outliner alike |
| Selection colour | Amber, chosen against the greens and pinks of trees |
| Text size | 13 px body and 12 px labels, a little smaller than today |
| Row height | 28 px |
| Icons | One icon set, Lucide, replacing the hand-drawn inline SVGs |
| Light theme | Kept, with the same structure |
| Default | Dark, unless the system says otherwise |

### Plain names, with the real term beside them

`01-product-spec` hides LOD, mesh and similar terms. That was right for a beginner's
first tree, but this tool's output is now for game engines, and the people using it
search for these words.

- **Main screens stay plain:** "Faces", "Detail levels", "Sway".
- **Export and settings give the real term once:** "Detail levels (LOD)".
- **The palette matches both**, so typing `lod` or `collision` finds the feature.
- `01-product-spec` is updated to say so.

### Not doing

- **Dockable, tearable panels.** Costly, and a beginner can lose a panel forever.
  Panels resize, collapse and reset instead.
- **Workspaces or multiple viewports.** Maybe later.
- **Our own node editor.**
- **Copying Blender's or Unreal's interaction wholesale.** Camera schemes are a setting,
  and the rest stays ours.

## The layout

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ◆ File Edit View Prop Help    oak_01 ●    [ Search or run… Ctrl+K ]  Save Export │ Menu bar
├───────────┬───────────────────────────────────────────────┬───────────────┤
│ Presets   │ ▸ Select  ✥ Move │       │ Lit ▾  LOD0 ▾  ⛶    │ Details       │
│ Outliner  │                                               │ [Filter…]     │
│───────────│                                               │               │
│ [Search]  │                                               │ ▾ Trunk       │
│           │                                               │  Height ─○─ 8 │
│ ▾ Broadleaf                   viewport                    │  Lean  ○── .1 │
│  ▢ ▢      │                                               │ ▾ Leaves      │
│  ▢ ▢      │                                               │  Clumps ─○ 11 │
│ ▾ Palms   │                                               │ ▸ Fruit       │
│  ▢ ▢      │                                     ⟲ gizmo   │ ▸ Bark detail │
├───────────┴───────────────────────────────────────────────┴───────────────┤
│ Click a part to select • Drag to orbit       Seed 12   11,362 / 14,000 faces │ Status bar
└───────────────────────────────────────────────────────────────────────────┘
```

### Menu bar

Replaces the top bar. Menus make every feature discoverable, and every item comes
from the command registry, so a menu can never disagree with the palette.

| Menu | Holds |
|---|---|
| File | New, My props, Open, Save, Save a copy, Export, Batch export, Settings |
| Edit | Undo, Redo, Copy, Remove, Restore |
| View | Shading, detail level, Frame, Camera angles, Show panels, Theme |
| Prop | Surprise me, New seed, Restore to preset |
| Help | Command palette, Shortcuts, Show the tour, About |

The Tree, Rock and Bush tabs move to **New**, and come back as a clear choice when
Rock exists. The Low-poly and Detailed toggle goes, replaced by the viewport's detail
level control from spec 06.

The prop's name is shown and can be renamed in place. A dot marks unsaved changes.

### Left panel: Presets and Outliner

**Presets** stays as it is, with collapsing groups. Each card can get a right-click:
"Start from this" and "Use only its colours".

**Outliner** is new, a tree of the prop's real parts:

```
▾ Oak
  ▾ Trunk
    ▸ Roots (6)
    ▾ Branch 1
       Side branch 1
    ▸ Branch 2
  ▾ Leaves (11)
     Clump 1
```

- Selecting in either the outliner or viewport selects in both, and scrolls to it.
- Hover highlights the part in the viewport.
- Each row shows only what can be done to it: remove, and restore if edited.
- A dot marks a hand-edited part, so you can see what you changed.
- Double-click frames the part.
- Keyboard works throughout, from React Aria.
- A removed part stays in the list, dimmed, and can be restored. Today that is only
  possible with undo.

### Right panel: Details

Named "Details" to match Unreal. It still shows the whole tree, or the one part
selected, as today.

**A new property row, on one line:**

```
Height      ───────○──── [ 8.00 m ] ⟲
```

| Behaviour | How |
|---|---|
| Change | Drag the slider, live, with updates as they work today |
| Exact value | Click the number and type |
| Reset | The arrow appears only when changed, and resets that one control to its preset's value |
| Learn | Hover the label to see the existing help text |
| Precise drag | Shift slows it down |
| Fine range | Typing beyond a slider's range is clamped and says so |

**A filter box** at the top narrows to matching controls across all groups, including
their help text, so "leaf" or "droop" finds them.

**Group memory:** which groups are open is remembered per kind of tree. By default
only the groups that matter most are open, so a first look isn't 30 sliders.

### Viewport

- **Top left:** Select and Move tools.
- **Top right:** shading, detail level (from spec 06), view angles (Front, Side, Top,
  Perspective), Frame, Maximize.
- **Stats overlay**, off by default: faces per mesh, draw calls, size in metres.
- **Scale reference**, off by default: a 1.8 m figure beside the prop, since a prop's
  size is hard to judge alone.
- **Backdrop choices:** the sky as today, neutral grey, or a colour.
- The axis gizmo stays, and clicking an axis moves to that view.
- The lighting control moves in here, from its own button.

| Key | Action |
|---|---|
| `F` | Frame the selection, or the whole prop |
| `G` | Move, as today |
| `Z` | Cycle shading, as today |
| `Ctrl+\` | Hide or show all panels. Not `Tab`, which has to keep moving keyboard focus |
| `Ctrl+Space` | Maximize the viewport |

### Status bar

Left: a hint for what you can do right now. It changes with the tool and selection,
which helps beginners more than a tutorial does. Right: seed, face count against the
budget from spec 06, and saved state. A warning shows here without interrupting.

### Panels

Both panels resize by dragging and collapse with a click. Sizes are remembered, and
View > Reset layout puts everything back.

### Home

The gallery page becomes a start screen in the manner of Unreal's project browser: Recent
props first, then "Start a new prop" with kind, then the preset groups. Thumbnails stay.

### Beginner aids that stay

The tour (`CoachMarks`) is rewritten for the new layout and can be replayed from Help.
Every empty state says what to do next. Undo stays one key away from every mistake.

## Settings

Opens with `Ctrl+,` or File > Settings, as a large modal with a side list and a search
box. Changes apply at once with no Save button. Each page has a reset, and each setting
is one row with a plain description.

| Page | Settings |
|---|---|
| **General** | Start on: home, or last prop. Autosave interval. Show the tour. Confirm before removing a part |
| **Appearance** | Theme: system, dark or light. Interface scale, 90–130%. Reduce motion. Show help on hover |
| **Viewport** | Camera scheme: Easy-props, Blender or Unreal. Orbit and zoom speed, invert zoom. Field of view. Backdrop. Grid. Shadows. Anti-aliasing. Render scale |
| **Performance** | Background threads: automatic or a number. Preview quality while dragging. Frame limit. Thumbnails on or off, and clear them |
| **Export** | Default engine. Default folder. Name pattern. Detail levels. Collision. Wind. Budget targets, from spec 06 |
| **Keyboard** | Every shortcut, searchable, with rebinding and conflict warnings. Reset all |
| **Storage** | Where props are saved, Open folder, Change folder. Space used |
| **About** | Version, licences, Open logs |

Rules:

- **One store:** `store/settings-store.ts`, validated with zod and versioned, in the same
  style as tree parameters. A damaged or old file gives defaults, and never an error.
  `theme-store.ts` folds into it.
- **Saved by Go**, as `settings.json` in the app's config folder, beside the existing
  drafts, so they survive a WebView reset. Plain `localStorage` is the browser fallback.
- **Never in undo.** Settings aren't part of a prop, and saved files don't carry them.
- **Every setting is a palette result**, so typing "shadows" offers to change it.
- **Defined as data**, like `ParameterSpec`: the page renders from the list, so adding a
  setting takes one entry.
- **Only real settings.** No setting ships before the feature it controls works.

## Command palette

Keeps its central rule: **every command lives in one registry**, which the palette,
menus, shortcut sheet, key handler, and now the settings page all read.

### When it opens

Empty, it shows a short useful list, not everything:

1. **For this selection**, when a part is selected: Move, Remove, Restore, Frame.
2. **Recent:** the last 5 you ran.
3. **Suggested:** Export, Surprise me, Save.

### When you type

Results come in sections, in this order: Actions, Controls, Presets, Saved props, Settings.

| Type | Example | Enter does |
|---|---|---|
| Action | `export` | Runs it |
| Control | `droop` | Opens its group, and focuses and flashes the control |
| Choice | `palette` | Opens a sub-list of its values |
| Preset | `willow` | Applies it, with undo |
| Saved prop | `oak_01` | Opens it |
| Setting | `shadows` | Toggles it, or opens the sub-list |

Prefix shortcuts for people who want them: `>` actions, `#` controls, `@` presets. They
are optional and shown in the footer.

### Matching

- Keep today's rule that the start of a word beats a match inside one, so "move" never
  puts "Remove part" first.
- Add tolerant matching for typos, ranked **below** any exact match, because Enter runs
  the top row.
- Add synonyms: `lod`, `poly`, `triangles`, `delete`, `reset`.
- Weight what you actually use, gently and only between similar scores.
- `Ctrl+K` and `Ctrl+Shift+P` both open it. It must feel instant, within about 100 ms, and
  searching never builds anything.

### Live preview

Arrowing over a preset or palette shows it in the viewport after a short pause. `Esc`
puts everything back, and `Enter` keeps it as one undo step. Reuses the preview of bark
built off-thread, so it doesn't block typing. This can be cut if it feels unsteady.

### Honest about what is unavailable

- A command that cannot run now stays listed, dimmed, with its reason: "Select a part
  first". It never silently does nothing.
- Commands that lose work ask first.

### Registry changes

```ts
interface Command {
    readonly id: CommandId
    readonly label: string
    readonly group: string
    readonly shortcut?: string
    readonly keywords?: string
    readonly icon?: IconName
    /** Null when it can run, otherwise why it cannot. */
    readonly unavailable?: (state: EditorStore) => string | null
    /** Offered first while this is true. */
    readonly relevant?: (state: EditorStore) => boolean
    /** Opens a sub-list instead of running. */
    readonly children?: (state: EditorStore) => readonly Command[]
    readonly dangerous?: boolean
    readonly run: (state: EditorStore) => void
}
```

**Fix regardless:** presets lose `Ctrl+N` shortcuts. Rebindable favourites replace them.

## Phases

| Phase | Work | Done when |
|---|---|---|
| **0. Spike** | Tailwind and HeroUI side by side, one group of the new sliders | The checks above pass, or we choose React Aria directly |
| **1. Foundations** | Theme tokens, icons, settings store and modal with Appearance and General, Go saving | Settings persist across restart, and a damaged file gives defaults |
| **2. Details panel** | Property row, filter, reset, typed values, help on hover | Every control can be typed, reset and found by filter, and slider rate has not dropped |
| **3. Shell** | Menu bar, status bar and hints, resizable panels, viewport toolbar | Every menu item comes from the registry, and the old top bar is gone |
| **4. Palette** | Sections, recent, relevant, controls, sub-lists, unavailable reasons | Every row of the "When you type" table works by keyboard alone |
| **5. Outliner** | Tree, two-way selection, restoring removed parts | Every part can be selected without clicking the viewport |
| **6. Rest of settings** | Viewport, Performance, Keyboard, Storage. Export after spec 06 | Every setting changes what it claims, with a test or a recorded check |
| **7. Home and clean-up** | Start screen, tour rewrite, delete replaced CSS and components | No screen uses an old control, `app.css` is mostly gone, and the old specs are updated |

Each phase ships working. Old and new controls can sit together between phases, and no
phase leaves a screen half converted.

## Order against spec 06

They can run side by side but touch some of the same screens. **Finish Phase 1 of spec 06
first**: the export is the product's biggest gap, and its dialog, detail level control and
budget display are then built once, in the new style, during Phases 3 and 6 here. A small
dialog built with the current controls is fine until then.

## Accessibility and quality

- Every action works by keyboard, with visible focus.
- Text contrast meets WCAG AA in both themes, including dimmed rows.
- Layout holds from the existing minimum of 1024×640, where the panels collapse first.
- Reduce motion is respected.
- Interface scale doesn't break any row.
- Existing tests keep passing, and each new control gets a behaviour test by role, not by
  class name, so the styling can keep changing.

## Effort

Rough, in working sessions the size of the 55-preset batch.

| Phase | Sessions |
|---|---|
| 0–1 | 1–2 |
| 2 | 1 |
| 3 | 1–2 |
| 4 | 1 |
| 5 | 1 |
| 6 | 1–2 |
| 7 | 1 |

About 7–10 in total.

## Risks

| Risk | If it happens |
|---|---|
| A controlled slider slows dragging | Keep drag values local to the row and commit through the existing path. Fall back to our own track on React Aria |
| Tailwind's reset breaks old screens | Scope it, or import Tailwind without its reset until the old CSS is gone |
| The result looks like a stock web app | Theme tokens first, and review against Blender and Unreal screenshots at the end of Phase 3 |
| Too many settings | The "only real settings" rule, and cut anything nobody would change |
| HeroUI's major version changes, as v2 to v3 did | Wrap each control once in `components/`, so screens never import it directly |
| Live preview feels unsteady | Cut it. The palette is complete without it |

## Sources

- [HeroUI quick start](https://heroui.com/llms-raw.mdx/react/getting-started/quick-start) and the [`@heroui/react`](https://www.npmjs.com/package/@heroui/react) npm package, read directly for version, licence and components
- [HeroUI Pro installation](https://heroui.pro/docs/react/getting-started/installation), which lists `Command`
- [Unreal editor interface overview](https://docs.unrealengine.com/4.27/Basics/UI/InterfaceOverview), for 4.27, not UE5
- [Blender interface design notes](https://wiki.blender.jp/Dev:2.5/Source/Development/WinterCamp/UIRules), from the 2.5 era, for reasoning and not current behaviour
- [Designing a command palette, Superhuman](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)
- [Search and command palette patterns](https://www.saasui.design/blog/saas-search-command-palette-ux-patterns)

The layout choices also draw on general knowledge of these tools rather than a formal
study, and should be reviewed against the real applications at the end of Phase 3.
