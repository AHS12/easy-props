# Contributing to easy-props

Thanks for helping. Bug reports, ideas, new presets and code are all welcome, and you
don't need to know 3D to send most of them.

## Reporting a bug or asking for something

[Open an issue](https://github.com/AHS12/easy-props/issues/new/choose) and pick a form.
For a bug, the most useful things are the app version, what you were doing, and a
screenshot. If a prop comes out wrong, include its seed and preset.

Please talk through a large change in an issue before building it, so your time isn't
spent on something that doesn't fit.

## Setting up

Follow [Build from source](README.md#build-from-source) in the README, then:

```bash
make install
make dev
```

`make install` also turns on the git hooks: lint before each commit and every test before
each push. `make web` runs only the interface in a browser, which is quicker for
interface work, but saving and native dialogs need the desktop app.

## Sending a pull request

1. Branch from `dev`, and open the pull request against `dev`. `main` only moves for
   releases.
2. Keep it to one change. A bug fix and a tidy-up are two pull requests.
3. Add a test for what you changed, where a test can show it.
4. Run `make check`.
5. For anything you can see, try it in the app and add a picture to the pull request.

Commit messages are a short sentence that starts with a verb and says what changed for
the person using the app, like `Add grass made of blades grouped in clumps`.

Don't edit `CHANGELOG.md`. It's written at release time, and the pull request template
asks for the line to use.

## What a change has to respect

**Beginners come first.** Someone who has never opened a 3D tool should be able to use
every feature without reading anything. If it needs a tutorial, it needs a redesign.

**Plain words in the interface.** People see "Thickness", not "radius", and "Bend",
not "curvature". The [terminology table](docs/terminology.md) applies to
every word on screen.

**The same seed gives the same prop.** Generators under `frontend/src/assets` use the
random source they're given, never `Math.random` or the clock, and they can't import
React, Zustand or the desktop bindings.

**Saved props keep opening.** If a change alters what an existing generator makes from
the same settings, raise its `version`. To replace a generator, add a new one and leave
the old one in place, as the two rock generators do.

**Everything scales.** Stylesheets can use pixels, because the build converts them. A size
set in code uses `rem` or `uiScale()`. Check your change at more than 100% interface scale.

**No art or code we can't license.** Everything in the app is generated, so there are no
assets to track. Don't add downloaded textures, models or copied code, including anything
under the GPL or a paid license.

## Where things are

| Path | What it holds |
|---|---|
| `frontend/src/assets` | Generators and presets. Pure geometry |
| `frontend/src/core` | Scene model, undo, commands, settings, export |
| `frontend/src/panels`, `frontend/src/viewport` | The interface and the 3D view |
| `backend` | Go. Files, native dialogs and app updates only |

## License

By contributing, you agree that your work is released under the [MIT License](LICENSE.md).
