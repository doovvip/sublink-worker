#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/native/MiYouStandaloneAI.m"
BUILD_SRC="$ROOT/native/.MiYouStandaloneAI.build.m"
OUT="$ROOT/dist"
mkdir -p "$OUT"

python3 - "$SRC" "$BUILD_SRC" <<'PY'
from pathlib import Path
import sys
src = Path(sys.argv[1]).read_text()
src = src.replace('return [NSString stringWithFormat:@"%@\\u001f%@", contact ?: @"", [context componentsJoinedByString:@"\\u001e"]];',
                  'return [NSString stringWithFormat:@"%@|%@", contact ?: @"", [context componentsJoinedByString:@"\\n"]];')
Path(sys.argv[2]).write_text(src)
PY
trap 'rm -f "$BUILD_SRC"' EXIT

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
  "$BUILD_SRC" \
  -o "$OUT/MiYouStandaloneAI.dylib"

codesign --force --sign - --timestamp=none "$OUT/MiYouStandaloneAI.dylib"
shasum -a 256 "$OUT/MiYouStandaloneAI.dylib" | tee "$OUT/MiYouStandaloneAI.dylib.sha256"
file "$OUT/MiYouStandaloneAI.dylib"
otool -L "$OUT/MiYouStandaloneAI.dylib"
nm -gU "$OUT/MiYouStandaloneAI.dylib" | grep -E 'MYSA(Version|GetCachedReplies|SetExternalContext|InvalidateReplies|RequestRefresh|RegisterExtension|RegisteredExtensions|InvokeExtension)' || true
ls -lh "$OUT/MiYouStandaloneAI.dylib"
