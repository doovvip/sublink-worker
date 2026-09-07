#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/native/MiYouLiteAI.m"
OUT="$ROOT/dist"
mkdir -p "$OUT"
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
  "$SRC" \
  -o "$OUT/MiYouLiteAI.dylib"

codesign --force --sign - --timestamp=none "$OUT/MiYouLiteAI.dylib"
shasum -a 256 "$OUT/MiYouLiteAI.dylib" | tee "$OUT/MiYouLiteAI.dylib.sha256"
file "$OUT/MiYouLiteAI.dylib"
ls -lh "$OUT/MiYouLiteAI.dylib"
