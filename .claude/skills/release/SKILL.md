---
name: release
description: Publish a new version of easy-props. Use when asked to bump the version, write the changelog for a release, or make a release. Run only when the user asks for it.
disable-model-invocation: true
---

# Releasing a version

Pushing, merging and publishing are outward-facing, so confirm each of them with the user.

## 1. Set the version

Set it in two places:

- `build/config.yml`: `version` under `info`
- `frontend/src/core/export/export-preferences.ts`: `APP_VERSION`

Then run `wails3 task common:update:build-assets`, which copies it into the Windows and Mac
build files. Delete the `build/ios`, `build/android`, `build/linux` and `build/docker` folders
it adds, and check with `git diff build` that only versions changed. The release workflow
fails if any of them don't match the tag.

## 2. Write the changelog

Add the new version to the top of `CHANGELOG.md`. The What's new dialog reads this file, so
keep to the shapes `frontend/src/core/changelog.ts` understands:

```markdown
## 0.2.0 (December 1, 2026)

**A group title**

- One thing that changed, in words a beginner would use.
```

Write about what people will notice, not about how it was done. Read the commits since the
last release with `git log`, and check each claim against the code: don't call something new
if it's only been improved. A test fails if the top version doesn't match `APP_VERSION`.

## 3. Check

Run `make check`, which fails if a preset's picture is out of date. A change to how a generator
behaves without a raised `version` won't trip it, so if trees changed, run `make previews` anyway.
Then build and open the installer on whatever you can, with `make release`.

## 4. Publish

1. Commit to `dev`, push, and merge `dev` into `main`.
2. Publish a GitHub Release tagged `vX.Y.Z`, or run the **Release Installers** workflow under
   Actions with the tag and platform.
3. The tag has to match the version, or the run stops before building.
4. When the run ends, check that the Windows installer, the Mac DMG and the Mac zip are
   all attached. The app finds updates by those file names, so keep them in step with
   `updateAssetName` in `backend/update.go` and `macUpdateName` in
   `backend/update_mac.go`. A test fails if they drift. A Mac updates itself from the
   zip, and the DMG is for first installs.
