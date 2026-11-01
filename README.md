# easy-props

[![Latest version](https://img.shields.io/github/v/release/AHS12/easy-props?label=version)](https://github.com/AHS12/easy-props/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/AHS12/easy-props/total)](https://github.com/AHS12/easy-props/releases)

Make game-ready 3D props in minutes, with no 3D experience needed.

Pick a tree, rock, bush, fern or patch of grass, shape it with plain sliders, and
export it for your game engine. It's a focused desktop tool for props, not a
replacement for Blender.

![A red maple made in easy-props, standing in the Meadow demo scene with rocks, bushes and grass](docs/images/meadow.png)

**[Download for Windows or Mac](https://github.com/AHS12/easy-props/releases)** · [What's new](CHANGELOG.md)

## What it does

- **Start from a preset:** broadleaf trees, palms, conifers, fantasy trees, bushes,
  ferns, grass and flowers, boulders, stones and cliffs.
- **Make it yours:** drag a slider or type a value, and the prop updates live. Click a
  branch or a leaf clump to change just that part, and undo anything.
- **See it in a real place:** stand your prop in the Meadow or Grove demo scene, with a
  person beside it for scale, to judge it before it goes in your game.
- **Export for games:** each prop comes as GLB files with detail levels (LOD) and simple
  collision shapes, checked against a face budget.
- **Wind built in:** trees and plants carry wind data in their second UV set, slow sway
  and fast flutter, so they can move in your engine at almost no cost.
- **Engine kits:** **Save kit…** in Export writes what your engine needs for that wind:
  ready-made shaders for Godot, and step-by-step material instructions for Unreal.
- **Export many at once:** batch-export presets, saved props and random variations.

![The editor, with presets on the left, a red maple in the middle and its controls on the right](docs/images/editor.png)

![The home page, with recent props and presets to start from](docs/images/home.png)

## Using props in your engine

![The Export dialog, listing the files for a red maple with their face counts](docs/images/export.png)

| Target | How |
|---|---|
| Unreal | Choose **Engine: Unreal** in Export and save the kit, then follow the [Unreal guide](docs/unreal-trees.md) |
| Godot | Choose **Engine: Godot** in Export and save the kit, then follow the [Godot guide](docs/godot-trees.md) |
| Blender and other tools | Choose **Plain GLB** in Export |

## Install

Download the Windows installer or Mac DMG from
[Releases](https://github.com/AHS12/easy-props/releases).

The builds aren't signed yet, so the first launch shows a warning:

- **Windows:** choose **More info > Run anyway**.
- **Mac:** drag the app to Applications and try to open it, then choose
  **System Settings > Privacy & Security > Open Anyway**.

## Build from source

You need Go, Node.js, pnpm, [golangci-lint](https://golangci-lint.run/) and the
[Wails CLI](https://wails.io). `wails doctor` should report success. On Windows, `choco install make` provides `make`, and it also needs Git
for Windows in its default folder.

```bash
make install    # Install frontend packages and git hooks, first time only
make dev        # Run the app with hot reload
make build      # Build the app into build/bin
make test       # Run the Go and frontend tests
make lint       # Run every lint, needs golangci-lint
make check      # Run every lint, test and build check
make release    # Build whichever installer this computer can make
```

`make installer` builds the Windows installer (needs NSIS), and `make dmg` builds the
Mac disk image (needs a Mac). Both go to `build/dist`. Run `make` to list every task.

## Releasing

Add the new version to [CHANGELOG.md](CHANGELOG.md), and set it in `wails.json` and in `APP_VERSION` in
`frontend/src/core/export/export-preferences.ts`, then push. There are two ways to
release, and both build the installers on GitHub and attach them to the release:

- **Automatic:** publish a GitHub Release tagged `vX.Y.Z`.
- **Manual:** run the **Release Installers** workflow under Actions, and enter the tag
  and platform. It creates the release from the chosen branch if it doesn't exist yet,
  and otherwise rebuilds it and replaces its installers. This also gets you a DMG
  without a Mac.

The tag has to match the version, or the run stops before building anything.

## How it's built

Wails (Go) for the desktop shell, React and TypeScript for the interface, and Three.js
for the 3D view. Go only handles files and native dialogs: geometry, editing and export
all live in TypeScript under `frontend/src`.

## Contributing

Bug reports, ideas and pull requests are welcome. [Open an issue](https://github.com/AHS12/easy-props/issues/new/choose),
or read [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## License

[MIT](LICENSE.md)
