---
name: release
description: Publish a new version of easy-props. Use when asked to bump the version, write the changelog for a release, or make a release. Run only when the user asks for it.
disable-model-invocation: true
---

# Releasing a version

Pushing, merging and publishing are outward-facing, so confirm each of them with the user.

## 1. Set the version

It's written in three places, and they all have to match:

- `wails.json`: `info.productVersion`
- `frontend/src/core/export/export-preferences.ts`: `APP_VERSION`
- `build/windows/installer/wails_tools.nsh`: `INFO_PRODUCTVERSION`

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

Run `make check`. Then build and open the installer on whatever you can, with `make release`.

## 4. Publish

1. Commit to `dev`, push, and merge `dev` into `main`.
2. Publish a GitHub Release tagged `vX.Y.Z`, or run the **Release Installers** workflow under
   Actions with the tag and platform.
3. The tag has to match the version, or the run stops before building.
4. When the run ends, check that both the Windows installer and the Mac DMG are attached.
