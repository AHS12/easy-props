# 02 — UI/UX Specification

Status: drafted, awaiting review
Source: [`01-product-spec.md`](./01-product-spec.md)
Visual direction: **Forest Workshop** — warm, light, craft-oriented chrome;
deep woodland viewport; earthy accents.

---

## 1. Design principles

Seven rules. They rank; when two conflict, the higher one wins.

### 1.1 The tree is the interface

The viewport is the product. Chrome exists to serve it and never competes with
it. No marketing panels, no illustrations, no empty states in the viewport
area. When a control and the tree want attention, the tree wins and the
control recedes until hover or selection.

### 1.2 Show the result, not the mechanism

Every control tells the user what it will do before they do it. A slider named
"Bend" with a visible trunk that bends as you drag is better than a slider
named "Curvature" with a numeric readout. The viewport is the tooltip.

### 1.3 Never make the user learn 3D

The user does not need to know what a mesh is. The vocabulary mapping in the
product spec is binding. Anything that would need a tutorial is redesigned
until it does not.

### 1.4 Ready-made first, blank never

The app opens with a tree. The library is one click away at all times. The
path from "I want a tree" to "I have a tree I like" must never pass through an
empty canvas.

### 1.5 Choices over measurements, measurements over nothing

When a property has a small set of natural options, use a segmented choice
(*Straight / Curved / Very curved*). Use a slider only for genuinely
continuous values (*Height 4.2 m*). Never expose a bare 0-1 range.

### 1.6 Everything is reversible

Delete, move, and parameter edits are undoable. Confirmation dialogs are
reserved for irreversible loss. There is one primary undo path, and it works
from the keyboard.

### 1.7 Calm product, warm craft

This is a tool, not a showcase. Motion is short and functional, the palette is
restrained, and the only saturated color in the app is the accent that marks
the primary action or the current selection. The warmth comes from the paper
tones and the woodland viewport, not from decoration.

---

## 2. Visual language

Implemented in [`design-tokens.css`](./design-tokens.css). Every value below
is binding; components reference tokens, not raw values.

### 2.1 Color

**Commitment level: whisper.** One accent (moss) carries the primary action
and selection. Clay is a secondary accent for destructive and attention
states. Everything else is warm neutrals.

| Token | Value | Role |
|---|---|---|
| `--surface-page` | `#FAF7F0` | App background, warm paper |
| `--surface-panel` | `#FFFFFF` | Rail, inspector, cards |
| `--surface-sunken` | `#F2EDE3` | Input tracks, segmented control wells, tab strips |
| `--surface-raised` | `#FFFFFF` | Popovers, dropdowns, modals |
| `--surface-hover` | `#F7F3EA` | Row hover on light panels |
| `--border-subtle` | `#E6DFD2` | Hairlines between regions, card borders |
| `--border-strong` | `#D3C8B4` | Input borders, focused container edges |
| `--text-primary` | `#2B2620` | Headings, values, labels |
| `--text-secondary` | `#6B6155` | Descriptions, helper text |
| `--text-tertiary` | `#948877` | Icons, meta, disabled labels, large decorative only |
| `--accent-moss-600` | `#4E7D3E` | Primary action fill, selection, active state |
| `--accent-moss-500` | `#5C8C4A` | Hover fill, focus ring, selection outline |
| `--accent-moss-100` | `#E4EEDF` | Selected row tint, tag backgrounds |
| `--accent-clay-600` | `#B85C33` | Destructive action fill |
| `--accent-clay-100` | `#F7E6DC` | Destructive tint, warning banner |
| `--accent-bark-600` | `#7A5C3E` | Category accents, library tint |
| `--state-error` | `#B3261E` | Error text and borders |
| `--state-warning` | `#8A5A00` | Warning text |
| `--state-success` | `#2E6B3E` | Success text |
| `--viewport-bg` | `#2B332C` | 3D viewport background |
| `--viewport-grid` | `#3A443A` | Grid lines |
| `--viewport-grid-major` | `#46503F` | Every 10th grid line |
| `--viewport-ground` | `#333C33` | Ground plane |

**Tinting rule.** Neutrals carry a trace of the bark hue so gray surfaces read
as authored rather than empty. `--surface-page` is warm, never neutral gray.

**Accent discipline.** The moss accent appears on: primary buttons, the
selected nav tab, the selected component, the active handle, and the focus
ring. Nowhere else. If more than about 10% of the visible surface is accent,
it is no longer an accent.

**Never color alone.** Selection is moss *plus* an outline. Errors are clay
*plus* an icon and a message. Style mode is a label, not a swatch.

#### Contrast verification

| Foreground | Background | Ratio | Verdict |
|---|---|---|---|
| `--text-primary` `#2B2620` | `--surface-page` `#FAF7F0` | 14.0:1 | AAA |
| `--text-primary` `#2B2620` | `--surface-panel` `#FFFFFF` | 16.1:1 | AAA |
| `--text-secondary` `#6B6155` | `--surface-page` `#FAF7F0` | 5.66:1 | AA |
| `--text-secondary` `#6B6155` | `--surface-panel` `#FFFFFF` | 5.93:1 | AA |
| `--text-tertiary` `#948877` | `#FFFFFF` | 3.47:1 | Large text / icons only |
| `#FFFFFF` | `--accent-moss-600` `#4E7D3E` | 4.85:1 | AA (normal text) |
| `--state-error` `#B3261E` | `#FFFFFF` | 6.36:1 | AA |
| `--state-warning` `#8A5A00` | `#FFFFFF` | 5.33:1 | AA |
| `--viewport-bg` `#2B332C` | white geometry | 12.6:1 | AAA |

`--text-tertiary` is barred from body copy and from text below 18px. If
something needs tertiary-toned text, it needs a larger size or a darker tone.

### 2.2 Themes

Two themes, one language. Forest Workshop in daylight, and the same
language at dusk. The accent does not change; the surfaces do.

#### Rules

1. **The accent is identical in both themes.** `--accent-moss` stays
   `#4e7d3e`. A brand that changes colour with the operating system is not a
   brand.
2. **Only surfaces, borders, and text flip.** Layout, spacing, typography,
   component shapes, and motion are shared.
3. **The viewport is dark in both themes.** The 3D scene is a woodland
   clearing in daylight and at night. The tree is the hero, and its
   surroundings never compete with it.
4. **Hover direction flips.** In daylight a button darkens on hover; at dusk
   it lightens, because there is nowhere darker to go. The token
   `--accent-moss-hover` carries the role, not a direction.
5. **Accent-coloured text gets its own token.** `--accent-moss-text` is
   `#3f6b2f` in daylight and `#8fc46e` at dusk. The fill that passes
   contrast on cream fails it on near-black, so the two roles cannot share a
   value.

#### How the theme is applied

`data-theme="light" | "dark"` on the document element. One cascade flips the
whole interface, so components never branch on the theme in code.

#### Switching

- One icon button in the top bar, between the asset tabs and the style
  control. A moon in daylight, a sun at dusk.
- The button names the outcome: "Switch to dark theme" / "Switch to light
  theme".
- The choice is remembered locally.
- Until the user chooses, the app follows the operating system preference,
  and keeps following it if the system changes.
- The theme is applied before the first paint, so the window never flashes
  the wrong theme on startup.

#### Dark palette

| Token | Value | Role |
|---|---|---|
| `--surface-page` | `#1a1815` | App background, warm near-black |
| `--surface-panel` | `#221f1a` | Rail, inspector, cards |
| `--surface-sunken` | `#2b2721` | Input tracks, segmented wells |
| `--surface-raised` | `#2a2620` | Popovers, modals |
| `--surface-hover` | `#2c2822` | Row hover |
| `--surface-selected` | `#2c3a27` | Selected row tint |
| `--border-subtle` | `#35302a` | Hairlines |
| `--border-strong` | `#4b443a` | Input borders |
| `--text-primary` | `#f1ece1` | Headings, values, labels |
| `--text-secondary` | `#b3aa9b` | Descriptions, helper text |
| `--text-tertiary` | `#9a9184` | Icons, meta |
| `--accent-moss` | `#4e7d3e` | Primary action fill, unchanged |
| `--accent-moss-hover` | `#5f9a4a` | Hover fill, lightens instead |
| `--accent-moss-strong` | `#7fb163` | Borders, focus rings, outlines |
| `--accent-moss-soft` | `#26351f` | Tinted backgrounds |
| `--accent-moss-text` | `#8fc46e` | Accent-coloured text |
| `--accent-clay-text` | `#e0895a` | Destructive text |
| `--accent-bark-text` | `#c4a882` | Category text |
| `--state-error` | `#f2b8b5` | Error text |
| `--state-warning` | `#e8b96a` | Warning text |
| `--state-success` | `#8fd19e` | Success text |

Shadows deepen against a dark surface and switch from warm-tinted to
near-black.

#### Dark contrast verification

| Foreground | Background | Ratio | Verdict |
|---|---|---|---|
| `--text-primary` `#f1ece1` | `--surface-page` `#1a1815` | 15.04:1 | AAA |
| `--text-primary` `#f1ece1` | `--surface-panel` `#221f1a` | 13.94:1 | AAA |
| `--text-secondary` `#b3aa9b` | `--surface-panel` | 7.15:1 | AAA |
| `--text-tertiary` `#9a9184` | `--surface-panel` | 5.28:1 | AA |
| `#ffffff` | `--accent-moss` `#4e7d3e` | 4.85:1 | AA |
| `--accent-moss-text` `#8fc46e` | `--surface-panel` | 7.96:1 | AAA |
| `--accent-moss-text` `#8fc46e` | `--accent-moss-soft` `#26351f` | 6.39:1 | AA |
| `--accent-moss-strong` `#7fb163` | `--surface-panel` | 6.55:1 | AA |
| `--accent-clay-text` `#e0895a` | `--surface-panel` | 6.17:1 | AA |
| `--accent-bark-text` `#c4a882` | `--surface-panel` | 7.25:1 | AAA |
| `--state-error` `#f2b8b5` | `--surface-panel` | 9.92:1 | AAA |

The accent fill is unchanged between themes, which is why white button text
keeps its 4.85:1 in both.

### 2.3 Typography

**Nunito** (already bundled with the Wails template) for all UI text, with a
system fallback stack. It is a humanist sans with generous apertures and
rounded terminals: warm and highly legible, and it avoids the cold neutrality
that makes 3D tools feel unwelcoming. Numbers use tabular figures so sliders
do not jitter while dragging.

| Token | Size / Weight / Line | Use |
|---|---|---|
| `--text-display` | 22px / 700 / 1.2 | Preset card title on hover, empty-state title |
| `--text-h1` | 18px / 700 / 1.3 | Panel section title, modal title |
| `--text-h2` | 15px / 700 / 1.35 | Inspector group title, card title |
| `--text-body` | 15px / 400 / 1.55 | Descriptions, body copy |
| `--text-label` | 13px / 600 / 1.4 | Control labels, nav items |
| `--text-caption` | 12px / 500 / 1.45 | Helper text, metadata, face count |
| `--text-micro` | 11px / 700 / 1.3 / +0.04em / uppercase | Category chips, badges |

**Rules**

- Every text block has exactly three levels: hook, bridge, detail.
- Body measure 60-76ch. Inspector copy is one line; it wraps to two at most.
- Labels are always visible. A placeholder shows an example (*"4.0"*), never
  the label.
- No display type in form controls, tables, or labels.
- Micro-copy under 30 characters gets 1.3 line-height minimum.

### 2.4 Space, radius, elevation

**1-4-9 rhythm.** Every gap is a multiple of 4px or 9px. No exceptions.

| Token | Value | Use |
|---|---|---|
| `--space-1` | 4px | Icon padding, inline gaps |
| `--space-2` | 8px | Control internal padding, chip gaps |
| `--space-3` | 12px | Compact list rows |
| `--space-4` | 16px | Card padding, panel padding, group gap |
| `--space-6` | 24px | Section separation |
| `--space-9` | 36px | Major region split |

**Radius**

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 6px | Inputs, small buttons, sliders |
| `--radius-md` | 10px | Cards, library rows |
| `--radius-lg` | 14px | Panels, popovers, modals |
| `--radius-pill` | 999px | Segmented controls, chips, badges |

**Elevation** — warm-tinted, never black.

| Token | Value | Use |
|---|---|---|
| `--shadow-1` | `0 1px 2px rgba(43,38,32,.06), 0 2px 8px rgba(43,38,32,.04)` | Cards, library rows |
| `--shadow-2` | `0 4px 12px rgba(43,38,32,.10), 0 12px 32px rgba(43,38,32,.08)` | Popovers, dropdowns, drag ghosts |
| `--shadow-3` | `0 16px 48px rgba(43,38,32,.18)` | Modals |
| `--shadow-focus` | `0 0 0 3px rgba(92,140,74,.35)` | Focus ring, drawn outside the element |

### 2.5 Motion

Product motion: short, functional, never ceremonial.

| Token | Duration | Easing | Use |
|---|---|---|---|
| `--motion-fast` | 120ms | `cubic-bezier(.2,0,.2,1)` | Hover, press, chip |
| `--motion-base` | 180ms | `cubic-bezier(.2,0,.2,1)` | Panel, tooltip, menu |
| `--motion-slow` | 240ms | `cubic-bezier(.16,1,.3,1)` | Modal, viewport camera settle |

- Enter: opacity 0→1 with scale 0.98→1 over `--motion-base`.
- Exit: `--motion-fast`, opacity only.
- Animate `transform` and `opacity` only.
- Camera moves ease over `--motion-slow`; they never snap.
- `prefers-reduced-motion: reduce` collapses all of the above to opacity-only
  transitions at 80ms, and camera moves become instant.

---

## 3. App shell

### 3.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TOP BAR  56px                                                             │
│ ⬤ easy-props │ Tree  Rock │      [Low-poly │ Detailed] │ ↶ ↷ │ Save  Export│
├────────────────┬─────────────────────────────────────────┬─────────────────┤
│ LEFT RAIL      │ VIEWPORT                                 │ INSPECTOR       │
│ 288px          │ flex, min 420px                         │ 320px           │
│                │                                         │                 │
│ [Presets│Parts]│  ┌───────────────────────────────────┐  │ ▸ Tree settings │
│                │  │                                   │  │   Height ──○    │
│  Preset grid   │  │        (deep moss backdrop)       │  │   Thickness ─  │
│  or            │  │                                   │  │   Bend [▾]      │
│  Category      │  │           the tree                │  │                 │
│  list +        │  │                                   │  │ ▸ Leaves        │
│  thumbnails    │  └───────────────────────────────────┘  │   Amount [▾]    │
│                │  ⊹ view gizmo        2,340 faces         │   Size ──○      │
│                │                                         │                 │
├────────────────┴─────────────────────────────────────────┴─────────────────┤
│ STATUS STRIP  28px  ·  ready · seed 12345 · style low-poly                 │
└──────────────────────────────────────────────────────────────────────────┘
```

**Top bar** — identity left, mode center, actions right.
- Left: app mark (a small stylized tree glyph) + `easy-props` 15px/700.
  Asset family tabs follow: **Tree** (active), **Rock**, **Bush**. Rock and
  Bush are disabled with a "Coming soon" tooltip; they signal the roadmap
  without breaking any promise. A hairline divider and the
  **theme toggle** come next.
- Center: the **Style** segmented control, `Low-poly │ Detailed`. It is
  centered because it changes everything on screen and must be findable
  without reading the inspector.
- Right: Undo, Redo, Save project, **Export** (primary, moss).

**Left rail** — a two-mode segmented switch at the top: **Presets │ Parts**.
Only one mode is visible at a time. This keeps each view focused instead of
stacking two browsing surfaces in 288px.
- *Presets*: a responsive grid of preset cards, 2 columns at 288px, each
  128px wide with a 96px thumbnail.
- *Parts*: a search field, then collapsible categories (Trunks, Branches,
  Roots, Leaf clumps, Palm parts, Details), each a list of thumbnail rows.

**Viewport** — fills the middle. Three overlays only:
- Bottom-left: the **navigation compass**, 84px. Three axes, X red, Y green,
  Z blue, drawn from the camera's own orientation, so it turns as the tree is
  orbited and always says which way the model faces. The axis pointing at the
  viewer is brightest and the one pointing away is dimmest.
- Only the positive end of each axis carries its letter; the far end is a
  plain dot. Clicking any of the six looks down that axis, keeping the
  current distance from what the camera is looking at. The hit area is
  larger than the ball, because the ball has to stay small enough to fit.
- Bottom-right: a face-count chip, `--text-caption` on a translucent scrim.
  This is the visible proof that real geometry exists (a decorative fake
  viewport is forbidden).
- Top-left: a transient hint strip that appears on first selection
  (*"Drag the green handles to shape it"*) and fades after the first drag.

**Inspector** — contextual, 320px.
- Nothing selected: tree-level settings (Height, Thickness, Taper, Bend,
  Twist, Branches, Branch length, Leaves, Leaf size, Leaf shape), colours,
  and variation.
- Something selected: that component's name, type chip, actions, then its
  own parameter groups. This includes the trunk, which gets a panel of its
  own with its Control points slider.
- The trunk's five shared controls (Height, Thickness, Taper, Bend, Twist)
  show the tree's values and write to the tree, because the trunk carries
  the tree's shape. Only its point count is the part's own. Without this a
  change made with the trunk selected would move the trunk and leave its
  branches behind.
- The trunk cannot be copied or removed: it is the tree. Its Restore default
  resets the tree, and its subtitle says *"The tree's body"* so the shared
  numbers are not a surprise.
- Both end with a **Restore default** text button.

**Status strip** — 28px, tertiary text. Shows app state (`Ready`,
`Building tree…`), the current seed, and the active style. It doubles as the
place where generation progress and warnings surface.

### 3.2 Window sizing

The window minimum is enforced in Go (`main.go`), not only in CSS.

| Window width | Rail | Inspector | Notes |
|---|---|---|---|
| ≥ 1440 | 288px | 320px | Default target |
| 1200-1439 | 288px | 320px | Default |
| 1024-1199 | 260px | 288px | Preset grid drops to 1 column below 1180 |
| < 1024 | — | — | Not permitted; window minimum is 1024×640 |

The viewport never drops below 420px wide. If the window cannot satisfy that,
the inspector collapses to an overlay sheet rather than the viewport shrinking.

### 3.3 Resize behavior

- The viewport re-frames the camera on resize, preserving the tree's framing
  rather than keeping a stale aspect.
- The inspector is a fixed-width column; it does not reflow internally.

---

## 4. Component specification

Every interactive component specifies the states it can actually enter. A
component that can enter a state owns a design for it.

### 4.1 Buttons

Four variants. Each with: idle, hover, focus-visible, active, disabled,
loading, and (for primary) the accent hover.

| Variant | Fill | Label | Use |
|---|---|---|---|
| **Primary** | `--accent-moss-600` | White, 13px/700 | Export, Save project, Copy |
| **Secondary** | `--surface-panel` + 1px `--border-strong` | `--text-primary`, 13px/600 | Secondary panel actions |
| **Ghost** | Transparent | `--text-secondary`, 13px/600 | Toolbar icons, Restore default |
| **Danger** | `--accent-clay-600` | White, 13px/700 | Delete in a confirm dialog |

- Height 36px (primary and secondary), 32px (ghost icon buttons).
- Radius `--radius-sm`, horizontal padding 16px.
- Hover: primary darkens to `#456F37`; secondary border becomes
  `--accent-moss-500`; ghost background becomes `--surface-hover`.
- Focus-visible: `--shadow-focus` ring, 2px offset, never removed.
- Active: scale 0.98, 80ms.
- Disabled: 45% opacity, `--text-tertiary` label, no hover, `cursor: not-allowed`.
  Disabled buttons carry a tooltip explaining *why* they are unavailable.
- Loading: the label stays. A 14px spinner sits left of the label, and the
  width does not change.
- Icon-only buttons always carry an `aria-label` and a tooltip.

**Theme toggle** — a ghost icon button in the top bar.

- 32×32, ghost variant, `--text-secondary` at rest.
- Icon: a moon in the light theme (meaning "go dark"), a sun in the dark
  theme (meaning "go light"). The icon shows the destination, not the
  current state, so the user never has to remember which way round it goes.
- `aria-label` and tooltip name the outcome: "Switch to dark theme" /
  "Switch to light theme".
- Hover: background `--surface-hover`, label colour to `--text-primary`.
- Focus-visible: `--shadow-focus`.
- Switching is instant. No transition on the whole interface, because a
  cross-fade of the entire app is slow and distracting.
- The choice is remembered locally and applied before the first paint.

### 4.2 Preset card

The hero interaction. A beginner's first click lands here.

- 128×auto, 10px radius, `--surface-panel`, 1px `--border-subtle`,
  `--shadow-1`.
- Thumbnail 96px tall: a **symbolic icon** of the tree's silhouette, one per
  preset, drawn in `--thumb-bark` and `--thumb-leaf`. A real render of every
  preset would need a WebGL context each and the silhouette is the thing
  being compared, so the icon says it more clearly and costs nothing.
- The icons are: a round crown, a wide flat crown, a narrow tall crown, a
  twisted trunk with a sparse crown, and a thick trunk with a broad crown and
  roots in the open.
- Title 13px/700, one line, truncated with an ellipsis.
- Subtitle 12px/500 `--text-secondary`: the style hint, e.g. *"Round canopy"*.
- Idle: flat, no shadow lift.
- Hover: border becomes `--accent-moss-500`, lifts `translateY(-2px)`,
  `--shadow-2`. The title turns `--accent-moss-600`.
- Focus-visible: `--shadow-focus` ring.
- Active: returns to `translateY(0)`, `--shadow-1`.
- Selected (current preset): 2px `--accent-moss-600` border, a small moss
  check badge in the top-right corner, and `--accent-moss-100` background
  behind the title.
- Loading: the thumbnail dims to 40% and a skeleton bar replaces the title.
- Disabled: for presets not yet built, the thumbnail area shows a muted
  silhouette and the card is not interactive.

### 4.3 Library part row

- Full rail width, 56px tall, 10px radius, transparent background.
- Thumbnail 40×40: a small render of the part alone, on a `--surface-sunken`
  rounded square.
- Name 13px/600, one line.
- Category chip 11px/700 uppercase on the right, tinted by category
  (trunks bark, branches bark, roots bark, leaf clumps moss, palm parts clay,
  details tertiary).
- Hover: background `--surface-hover`, and an **Add** button (secondary, 28px
  tall) slides in from the right, replacing the chip.
- Focus-visible: `--shadow-focus`.
- Active (pressed): the Add button turns moss and the row shows a 1px inset
  ring.
- Adding state: the Add button becomes a spinner with the label *"Adding"*
  for the duration; the row does not re-order.
- The row is a button for "add", and the thumbnail is separately draggable.
  Dragging a thumbnail shows a drag ghost and a drop indicator.

### 4.4 Segmented control

The primary control type for categorical properties (the plain-language
rule).

- Height 32px, `--radius-pill`, background `--surface-sunken`, 3px inner
  padding, so segments are 3px apart.
- Segment label 13px/600.
- Unselected: `--text-secondary`, transparent.
- Selected: `--surface-panel` fill, `--text-primary`, `--shadow-1`.
- Hover (unselected): `--text-primary`.
- Focus-visible: `--shadow-focus` on the segment.
- Disabled segment: `--text-tertiary`, 45% opacity, tooltip explains why.
- Every segment must have a visible, persistent label. Icons alone are not
  allowed for categorical choices — a beginner has to read them.
- A choice with more than three options renders as a dropdown instead. Six
  leaf shapes do not fit in a segmented control at 288px, and a control that
  overflows its panel is worse than a dropdown.

### 4.5 Slider

Reserved for continuous values only: Height, Thickness, Leaf size, Position.
- Label 13px/600 on the left, value 13px/700 tabular on the right, with a
  unit (*"4.2 m"*, *"0.32 m"*).
- Track 4px tall, `--radius-pill`, `--surface-sunken`.
- Filled portion in `--accent-moss-600`.
- Thumb 16px, `--surface-panel` fill, 2px `--accent-moss-600` border,
  `--shadow-1`. Hit area 40×40 via a pseudo-element.
- Hover: thumb grows to 18px.
- Focus-visible: `--shadow-focus` on the thumb.
- Active/dragging: thumb grows to 18px, track darkens to `--border-strong`.
- Range ends are labeled at 11px `--text-tertiary` (e.g. *"1 m"* / *"12 m"*).
- The value updates live while dragging. No commit step, no apply button.
- Double-click resets to the default value (undone by undo).
- The value field is directly editable: click the number, type, press Enter.
  This is the Dev power path and costs the beginner nothing.

### 4.6 Inspector group

A titled, collapsible section in the inspector.

- Header: 15px/700 title, a chevron, 32px tall.
- Open: `--surface-panel` with 16px padding, separated by a 1px
  `--border-subtle` line.
- Collapsed: header only, 32px tall.
- Animation: `--motion-fast` on the chevron rotation and a grid-row height
  transition. No bounce.
- A group can carry a one-line helper under the title in 12px
  `--text-secondary` ("How thick the trunk is at the base.").

### 4.7 Viewport handles

Direct manipulation is a core requirement. Handles must read as
inviting.

- Sphere, 6.5px radius in screen space (constant regardless of zoom), so
  they stay grabbable at any camera distance.
- Fill `--surface-panel`, 2px `--accent-moss-600` ring.
- Hover: radius grows 1.4×, ring becomes `--accent-moss-500`, a tooltip
  names the handle (*"Branch tip"*, *"Trunk bend point 2"*).
- Active/dragging: radius 1.6×, fill becomes `--accent-moss-500`.
- The handle the mouse is nearest is highlighted; all handles of the selected
  component are visible, handles of unselected components are hidden.
- Picked by screen distance (14px), not by raycasting the sphere. A handle
  is a screen-sized helper, so it is picked the way it is drawn: a raycast
  against a six-pixel sphere misses often enough to feel broken.
- Every part with a spine has handles: the trunk, a branch, and a root. A
  leaf clump has none, so selecting one shows no handles.
- A handle moves across its part's axis only. On a trunk that is horizontal;
  on a branch or root the drag plane turns with the part, so the handle
  follows the pointer exactly.
- Handles **draw on top of the geometry**. They sit on the control spine,
  which runs through the inside of the form, so depth-testing them would
  bury them where they are needed. Being reachable matters more than being
  occluded correctly.
- Keyboard: when a component is selected, its handles are reachable with
  arrow keys (see §6.6).

### 4.8 Shape tool

A tool for pushing a selected part's surface out or pulling it in.

- A **Push / Pull** segmented control in the viewport's top-right, next to
  the sun button. It is off by default; the tool is off until the user picks
  a direction.
- With the tool on, dragging across a part's surface pushes it along the
  surface normal. The amount is the drag distance measured along the normal,
  so dragging sideways does nothing.
- A ring is drawn at the point being pushed, sized to the push's reach, so
  the user can see how wide the change will be.
- The inspector shows how many pushes the part has, with **Undo last push**
  and **Clear pushes**. Both are undoable.
- The cursor becomes a crosshair over a part while the tool is on.

There is no vertex, edge, or face selection, and the push cannot move a
surface sideways.

### 4.9 Toast

Used for undoable and confirmable events.

- Bottom-center of the viewport, 380px wide, `--radius-lg`,
  `--shadow-2`, `--surface-raised`, 1px `--border-subtle`.
- Two lines: the message (13px/600) and an optional action (13px/700 moss).
- Enter: fade + `translateY(8px)` over `--motion-base`.
- Exit: fade over `--motion-fast`.
- Auto-dismiss at 6s, pausing while hovered or focused.
- z-index 45, so the first-run coach marks sit above it.
- Examples:
  - *"Branch removed"* + **Undo**
  - *"Tree copied"*
  - *"Project saved"*
  - *"Export complete — easy-props.glb"*
- Errors use clay border + an icon + a message, and do not auto-dismiss.

### 4.10 Empty states

The library and the preset grid are never truly empty in the MVP, but the
scene can be. One empty state exists:

> **Nothing here yet**
> Trees you create show up in this space.
> [Build a tree from a preset]

With a small illustration of a wireframe tree in `--border-strong`.

### 4.11 Face-count chip

- Bottom-right of the viewport. `--text-caption` on
  `rgba(43,38,32,.55)`, `--radius-pill`, 8px vertical and 12px horizontal
  padding.
- Text: *"2,340 faces"*. Updates live when geometry regenerates.
- Its job is reassurance that the viewport shows real geometry.

---

## 5. Screen specifications

### 5.1 First launch

1. The window opens directly into the editor with the default round-canopy
   tree generated. No splash, no welcome modal, no project picker.
2. A one-time coach mark overlay appears after the first render:
   - Pointer 1 → left rail, *"Start from a tree you like, or add parts"*
   - Pointer 2 → inspector, *"Change how the tree looks"*
   - Pointer 3 → Export button, *"Save it for your game"*
3. The coach mark is dismissible with **Got it**, `Escape`, or a click
   anywhere. It never shows again after dismissal (stored in the local app
   settings).
4. No modal dialogs on first run. The file system is not involved until the
   user chooses to save.

### 5.2 Adding a part

**Click-to-add (default):**
1. User hovers a library row; the **Add** button appears.
2. Click. The part is added to the selected tree at a sensible default
   attachment point, with a short 200ms "settle" animation in the viewport.
3. The new part is immediately selected, and the inspector switches to its
   parameters.
4. A toast confirms: *"Branch added"*, with **Undo**.

**Drag-and-drop (M3):**
1. Dragging a thumbnail shows a ghost card following the cursor with
   `--shadow-2`.
2. Entering the viewport shows a drop indicator: a ring on the ground at the
   projected position, plus a highlighted candidate parent.
3. Releasing over the viewport attaches the part. Releasing outside cancels
   with no change and no toast.
4. Invalid drops (over the rail, over the inspector) show the ghost in a
   muted "not allowed" state.

### 5.3 Selecting and editing

- Hover over a component: a soft rim highlight in `--accent-moss-500` at 35%
  opacity.
- Click: selection becomes `--accent-moss-600` outline plus handles appear.
- The inspector swaps to that component's parameters, with the panel header
  showing the name and a type chip.
- Selecting a component does **not** move the camera. The camera moves only
  when the user asks (double-click, or the *Frame selection* action).
- Clicking empty space deselects and restores tree-level settings.

### 5.4 Style switching

`Low-poly │ Detailed` in the top bar. Switching:
- Regenerates all geometry with the new style profile.
- Keeps the same seed, parameters, and component structure. The silhouette
  stays recognizably the same tree; only the level of detail changes.
- Is undoable as a single operation.
- Takes under 200ms for a standard tree; the status strip shows
  *"Building tree…"* if it takes longer.

### 5.5 Randomize

The **Surprise me** action in the inspector:
- Rerolls the tree's variation seed.
- Preserves the overall structure: same component types, same parameter
  ranges, similar silhouette.
- Is a single undoable operation.

### 5.6 Export

1. Click **Export**. A native save dialog appears (Go side).
2. Default filename: `<preset-name>.glb`.
3. On success, a toast: *"Export complete — round-canopy.glb"*.
4. On failure, a clay toast naming the cause and the next step.

---

## 6. Interaction rules

### 6.1 Camera

- **Orbit**: left-drag. **Pan**: middle-drag or `Shift` + left-drag.
  **Zoom**: scroll wheel or pinch. **Dolly**: right-drag.
- Orbit is damped (factor 0.08) and has a polar clamp of 0.05–1.52 radians,
  so the camera never flips under the ground plane.
- Zoom is clamped to 1.2m–40m from the target.
- `F` frames the selection; `Shift+F` frames the whole tree.
- Double-clicking a component frames it.
- Camera state is **not** part of undo.

### 6.2 Selection

- Click selects the topmost component under the cursor.
- Clicking a selected component again does not deselect (no accidental
  deselection while adjusting).
- `Escape` deselects.
- Selection is announced in an ARIA live region:
  *"Selected: Branch, sweeping branch"*.

### 6.3 Direct manipulation

- Dragging a handle edits the underlying parameter and regenerates that
  component only.
- Dragging a component body moves it, constrained to the ground plane by
  default; holding `Ctrl` switches to vertical movement.
- The drag ghost is the real geometry, not a proxy.
- Every drag is one undo step, created on release, not on every frame.

### 6.4 Undo and redo

- `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` redo.
- The toolbar buttons are disabled when there is nothing to undo, with a
  tooltip naming the operation (*"Undo: move branch"*).
- Undo restores the *scene graph*, not the mesh. The mesh is regenerated from
  the restored state, so undo of a parameter change re-runs the generator.
- Depth is unlimited for the session, capped at 200 entries to bound memory.

### 6.5 Copy, delete, duplicate

- **Copy** (`Ctrl/Cmd+D`) duplicates the selected component with the same
  parameters, a new unique id, and a small offset so the copy is visible.
- **Delete** (`Delete`/`Backspace`) removes the component. No confirmation.
  A toast offers **Undo**.

### 6.6 Keyboard path

The core task must be completable without a mouse.

| Key | Action |
|---|---|
| `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` | Undo / redo |
| `Ctrl/Cmd+D` | Copy selected component |
| `Ctrl/Cmd+S` | Save project |
| `Ctrl/Cmd+E` | Export GLB |
| `Delete` / `Backspace` | Delete selected component |
| `Escape` | Deselect, or close the top overlay |
| `F` | Frame selection |
| `Shift+F` | Frame whole tree |
| `1` | Low-poly style |
| `2` | Detailed style |
| `Tab` | Move through panel controls in visual order |
| Arrow keys | Adjust the focused slider by one step; with a component selected, move its handles |

Focus order follows the visual flow: top bar → left rail → viewport → inspector
→ status strip. Focus is always visible with `--shadow-focus`. Overlays trap
focus and return it to the trigger on close.

### 6.7 Mouse targets

- Every interactive element has at least a 40×40px hit area on desktop.
  Visually small controls expand their hit area with a pseudo-element on the
  wrapper, never on the `<input>` itself.
- Two controls never have overlapping hit areas.

---

## 7. Viewport specification

### 7.1 Backdrop

The viewport is a lit place, not a void. A flat colour makes a tree look like
it is floating; a gradient reads as a clearing.

- **Sky.** A vertical gradient, `#43525E` at the top down to `#93A189` at
  the horizon, drawn as a full-screen background. The horizon colour is also
  the fog colour, so the ground fades into the distance rather than ending.
- **Ground.** A large disc in `--viewport-ground` `#4C5647` at y=0.
- **Grid.** 1m minor lines in `--viewport-grid` at 30% opacity, 10m major
  lines in `--viewport-grid-major` at 45% opacity, fading out with distance.

### 7.2 Lighting

The light in the viewport is a **sun**. It is not a fixed rig: the user can
move it, and the shadow follows.

- **Tone mapping.** Khronos PBR Neutral, exposure 1.15. ACES crushes the
  midtones, which makes a sunlit tree read as if it were in the shade.
- **Sun.** A directional light. Its direction comes from two numbers the user
  can think about in plain words:
  - *Around* — the azimuth, in degrees. 0 is behind the tree.
  - *Up* — the elevation, in degrees above the horizon.
- Sun colour runs from `#FFF4E2` (cool white) to `#FFB35C` (deep golden) as
  the *warmth* rises. Intensity is 2.4 to 3.3.
- **Shadow.** 2048 map, radius 3, `normalBias` 0.035, `bias` -0.0002. The
  shadow camera is fitted to the tree's bounds every time the tree changes,
  so the shadow is always sharp at the tree's size.
- **Sky fill.** A hemisphere light, sky `#C6DCEA` to `#D9C9A8` with the
  warmth, ground `#5A4A38`. Its intensity rises as the sun falls, because a
  low sun means the sky is doing more of the work. Nothing reads as black.
- **Fill.** A dim directional light from the opposite side of the sun,
  `#CFE0F0`, intensity 0.55, to keep the dark side readable.

#### Sun controls

A panel in the viewport's top-right, opened by a sun button.

- **Sun dial.** A top-down circle. The tree sits in the middle and the sun
  travels around it. The sun nearer the centre is higher in the sky, which is
  how the sky looks from the ground. Drag to move it. Arrow keys move it in
  5° steps, 15° with Shift.
- **Time of day.** Four buttons: Morning, Midday, Golden, Dusk. Each sets
  the sun's position, warmth, and shadow strength together. A button is
  highlighted only when the lighting matches it exactly, so dragging the dial
  away from a preset clears the highlight rather than lying.
- **Shadow.** A slider from None to Full.

The sun and the shadow are a view preference. They are not part of the tree,
so they are not undoable and they do not travel into the export.

### 7.3 Shading modes

Three ways to draw the tree, chosen from a row of buttons in the viewport's
top-right.

| Mode | What it shows |
|---|---|
| **Lit** | The finished look, with the sun and its shadow. |
| **Flat** | One flat colour per part, no lighting. For reading the silhouette. |
| **Wireframe** | The triangles the tree is made of. |

Shadows are only drawn in Lit mode. The mode is a view preference and is not
undoable.

### 7.4 Camera default

- Perspective, 45° fov, near 0.05, far 500.
- The camera frames the tree from its height: the distance is 2.7× the tree's
  height, and the target sits at 58% of it, because the canopy reaches wider
  and taller than the trunk.
- The frame is recomputed when the height changes by more than 20%, so a
  tree that is twice as tall stays in view.

### 7.5 Colours

The tree is painted with two colours the user chooses. They are part of the
tree, so they are undoable and they travel into the export.

- **Trunk** — the bark, used by the trunk, branches, and roots.
- **Leaves** — the foliage clumps.

The other tones are derived, not chosen, so they always belong:

| Tone | How it is made |
|---|---|
| Bark light | The bark colour, 20% towards white |
| Leaves dark | The leaf colour, 24% towards black |
| Coconut | Fixed `#7A5C3E` |

Each colour is a row of six named swatches plus a custom swatch that opens
the operating system's own colour picker. Named swatches come first: a
beginner looking at a tree knows it is brown and not what hex brown is.

- Bark: Warm brown, Pale grey, Dark brown, Red-brown, Grey-brown, Birch
  white.
- Leaves: Fresh green, Deep green, Olive, Autumn orange, Gold, Grey-green.

Flat shading is available in the Low-poly style.

---

## 8. Accessibility

- **Keyboard path.** §6.6. The core task completes without a mouse.
- **Focus.** `:focus-visible` only, never a bare `:focus`. Never
  `outline: none` without a verified replacement. Rings use
  `--shadow-focus`.
- **Semantics.** Native `<button>` for actions, `<a>` for navigation, real
  `<label>` for every input, `<input type="range">` for sliders,
  `<fieldset>`/`<legend>` for segmented groups.
- **Live regions.** One `aria-live="polite"` region announces selection
  changes, add/delete results, and export completion.
- **The 3D viewport** is `role="application"` with an accessible name
  (*"Tree viewport"*) and a keyboard-operable control surface.
- **Contrast.** AA at minimum for text, 3:1 for control boundaries and
  focus rings. §2.1 and §2.2 have the measured ratios for both themes.
- **Never color alone.** Selection carries an outline, errors carry an icon
  and text, style mode carries labels.
- **Zoom.** The layout survives 200% browser zoom and a 320px-wide
  reflow of the panels (the viewport is the only fixed-height region).
- **Motion.** `prefers-reduced-motion` collapses transitions to 80ms
  opacity-only and makes camera moves instant.
- **Colorblind.** Moss and clay are distinguishable under deuteranopia,
  protanopia, and tritanopia, because they differ in lightness as well as
  hue. Never encode a category by hue alone; every category also has a
  label.

---

## 9. Forbidden patterns

Explicitly out. These are what turn a beginner tool into a pro tool that
beginners abandon.

1. Any 3D modeling term in the default UI. See the mapping in
   [`01-product-spec.md` §5](./01-product-spec.md).
2. Raw 0-1 numeric ranges presented without a name or unit.
3. A modal dialog asking "Are you sure?" for anything undoable.
4. Hover-only actions with no click or keyboard equivalent.
5. An empty viewport on launch.
6. ~~A "New Project" or template gallery blocking the viewport.~~ **Revised in
   the gallery milestone.** The original rule assumed one tree per session, so
   a chooser was friction. The app now holds a collection, and the gallery is
   the start page: it shows what the user has made, and starting or opening
   from it is one click. It is a page, not a modal — it never blocks the
   viewport, because there is no viewport behind it. See the "Tree gallery"
   section of [`04-roadmap.md`](./04-roadmap.md).
7. Nested cards inside cards.
8. Icon-only buttons with no label or tooltip.
9. The accent color used on anything other than a primary action, a
   selection, or a focus ring.
10. A spinner replacing a whole layout instead of the content that is
    loading.
11. Disabling a submit action until a form is valid.
12. Colors that are the only signal for state.
13. Exposing vertex counts, normals, UVs, or material graphs.
14. Modals for long forms.
15. Animation that delays the task or blocks the next action.
