#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/native/MiYouLiteAI.m"
BUILD_SRC="$ROOT/native/.MiYouLiteAI.build.m"
OUT="$ROOT/dist"
mkdir -p "$OUT"

# Use the stable Vercel alias for this branch. The old pink production URL
# currently returns 404 for /api/miyou-ai, so never bake that known-bad URL
# into a testable dylib.
cp "$SRC" "$BUILD_SRC"
sed -i '' 's#https://sublink-worker-pink.vercel.app/api/miyou-ai#https://sublink-worker-git-miyou-lite-ai-01-lee-36d9.vercel.app/api/miyou-ai#g' "$BUILD_SRC"
trap 'rm -f "$BUILD_SRC"' EXIT

SDK="$(xcrun --sdk iphoneos --show-sdk-path)"
CLANG="$(xcrun --sdk iphoneos --find clang)"
"$CLANG" \
  -isysroot "$SDK" \
  -arch arm64 \
  -miphoneos-version-min=15.0 \
  -fobjc-arc -fblocks \
  -dynamiclib \
  -install_name @rpath/MiYouLiteAI.dylib \
  -framework Foundation \
  -framework UIKit \
  -framework CoreGraphics \
  -Wl,-dead_strip \
  -Os \
  "$BUILD_SRC" \
  -o "$OUT/MiYouLiteAI.dylib"

codesign --force --sign - --timestamp=none "$OUT/MiYouLiteAI.dylib"
shasum -a 256 "$OUT/MiYouLiteAI.dylib" | tee "$OUT/MiYouLiteAI.dylib.sha256"
file "$OUT/MiYouLiteAI.dylib"
ls -lh "$OUT/MiYouLiteAI.dylib"
