#!/bin/bash
# Packages build/bin/easy-props.app into a drag-to-Applications disk image.
# Uses hdiutil, which every Mac has, so there is nothing extra to install.
set -euo pipefail

VERSION="${1:?usage: make_dmg.sh VERSION}"
APP_PATH="build/bin/easy-props.app"
DMG_PATH="build/dist/easy-props-$VERSION-mac-universal.dmg"

if [ ! -d "$APP_PATH" ]; then
    echo "error: $APP_PATH not found. Build it first with: make mac" >&2
    exit 1
fi

STAGING_DIR=$(mktemp -d)
trap 'rm -rf "$STAGING_DIR"' EXIT

cp -R "$APP_PATH" "$STAGING_DIR/"
ln -s /Applications "$STAGING_DIR/Applications"

mkdir -p build/dist
rm -f "$DMG_PATH"
hdiutil create -volname "easy-props" -srcfolder "$STAGING_DIR" -ov -format UDZO "$DMG_PATH"

echo "Created $DMG_PATH"
