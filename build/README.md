# Build files

Wails 3 builds the app with the tasks in `Taskfile.yml` at the repository root and in each
folder here. `make` runs them for you.

- `config.yml`: the app's name, version and details. After changing them, run
  `wails3 task common:update:build-assets` from the repository root. It rewrites the files
  below that carry the version, and adds `ios`, `android`, `linux` and `docker` folders
  that easy-props doesn't use, so delete those.
- `appicon.png`: the icon. The Windows `.ico` and Mac `.icns` are made from it.
- `windows/nsis/project.nsi`: the installer. It's ours, and the command above leaves it
  alone. It installs for the current user, closes a running copy before an update, and
  keeps saved props when uninstalling.
- `windows/nsis/wails_tools.nsh`, `windows/info.json`, `windows/wails.exe.manifest`,
  `darwin/Info.plist` and `darwin/Info.dev.plist`: generated from `config.yml`.
- `darwin/make_dmg.sh`: packs `bin/easy-props.app` into a disk image.

The app and the Windows installer are built into `bin` at the repository root, and
`make installer` and `make dmg` copy the release files into `build/dist`.
