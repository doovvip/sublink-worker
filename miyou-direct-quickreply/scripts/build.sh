#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/native/MiYouQuickReplyAI.m"
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
  -install_name @rpath/MiYouQuickReplyAI.dylib \
  -framework Foundation \
  -framework UIKit \
  -framework CoreGraphics \
  -framework QuartzCore \
  -Wl,-dead_strip \
  -Os \
  "$SRC" \
  -o "$OUT/MiYouQuickReplyAI.dylib"

codesign --force --sign - --timestamp=none "$OUT/MiYouQuickReplyAI.dylib"
shasum -a 256 "$OUT/MiYouQuickReplyAI.dylib" | tee "$OUT/MiYouQuickReplyAI.dylib.sha256"
file "$OUT/MiYouQuickReplyAI.dylib"
otool -L "$OUT/MiYouQuickReplyAI.dylib"
ls -lh "$OUT/MiYouQuickReplyAI.dylib"
