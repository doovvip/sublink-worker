#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/native/MiYouStandaloneAI.m"
OUT="$ROOT/dist"
mkdir -p "$OUT"
SDK="$(xcrun --sdk iphoneos --show-sdk-path)"
CLANG="$(xcrun --sdk iphoneos --find clang)"
"$CLANG" \
  -isysroot "$SDK" \
  -arch arm64 \
  -miphoneos-version-min=15.0 \
  -fobjc-arc -fblocks \
  -fvisibility=hidden \
  -dynamiclib \
  -install_name @rpath/MiYouStandaloneAI.dylib \
  -I"$ROOT/native" \
  -framework Foundation \
  -framework UIKit \
  -framework CoreGraphics \
  -framework QuartzCore \
  -Wl,-dead_strip \
  -Os \
  "$SRC" \
  -o "$OUT/MiYouStandaloneAI.dylib"

codesign --force --sign - --timestamp=none "$OUT/MiYouStandaloneAI.dylib"
shasum -a 256 "$OUT/MiYouStandaloneAI.dylib" | tee "$OUT/MiYouStandaloneAI.dylib.sha256"
file "$OUT/MiYouStandaloneAI.dylib"
otool -L "$OUT/MiYouStandaloneAI.dylib"
nm -gU "$OUT/MiYouStandaloneAI.dylib" | grep -E 'MYSA(Version|GetCachedReplies|SetExternalContext|InvalidateReplies|RequestRefresh|RegisterExtension|RegisteredExtensions|InvokeExtension)' || true
ls -lh "$OUT/MiYouStandaloneAI.dylib"
