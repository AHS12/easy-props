---
name: try-in-browser
description: Run the easy-props interface and check a change by looking at it. Use after any visual, layout, 3D or interaction change, or when asked to run or screenshot the app.
---

# Trying a change in the browser

## Start it

Run `make web`, or use your tool's preview feature with `pnpm --dir frontend dev`. Vite
prints the address. For Claude Code's preview, `.claude/launch.json` is ignored by git, and
any path in it needs forward slashes.

The browser has no Go backend, so nothing that needs a native dialog or the disk is real
there. For saving, opening and exporting to a folder, use `make dev`.

## Don't trust a hidden pane

A hidden or background browser tab throttles animation frames, which leads to false results:

- The loading screen and 3D view can seem stuck.
- Frame rates and load times mean nothing.
- Menus and dialogs opened by script can stay half faded.

Keep the page visible when you're timing or looking at motion. Use real clicks instead of
scripted ones, and say so plainly if you couldn't check something.

## What to check

- The thing you changed, by using it, not only by reading the page text.
- The browser console, for errors.
- Interface scale at 75%, 100%, 110% and 150% for layout changes, especially dropdowns,
  dialogs and tooltips near the window's edge.
- Light and dark themes, for color changes.
- A narrow window, for panels and the toolbar.
- For a prop change: orbit it, try the Meadow scene, and export it.

Tell the user what you saw, and which of these you didn't get to.
