#!/usr/bin/env bash
#
# build-release.sh — validated release builder for Financial Lab.
#
# Usage:
#   ./tools/build-release.sh <source-dir> <old-version> <new-version> <release-name>
#
# Example:
#   ./tools/build-release.sh . 4.1.21.0 4.1.21.1 polish
#
# What it does:
#   1. Fails if any required ship file is missing (this is what broke v4.1.20.1).
#   2. Copies the tree to a temp build dir.
#   3. Stamps <new-version> over <old-version> in index.html, service-worker.js,
#      package.json. README.md history is intentionally left alone.
#   4. Fails if any <old-version> string survives in the stamped files.
#   5. Runs npm test in the build dir.
#   6. Zips the result to releases/financial-lab-<new-version>-<release-name>.zip
#
# Nothing is uploaded or deployed. Review the zip, then deploy it yourself.

set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "Usage: $0 <source-dir> <old-version> <new-version> <release-name>" >&2
  exit 1
fi

SRC="$1"
OLD="$2"
NEW="$3"
NAME="$4"

# --- 1. Required ship files -------------------------------------------------
REQUIRED=(
  index.html app.js styles.css service-worker.js manifest.webmanifest
  icon.svg icon-192.png icon-512.png logo-full.svg dexx-character-clean.jpg
)
missing=0
for f in "${REQUIRED[@]}"; do
  if [ ! -f "$SRC/$f" ]; then
    echo "MISSING required file: $SRC/$f" >&2
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  echo "Release aborted: required files missing." >&2
  exit 1
fi
echo "OK: all ${#REQUIRED[@]} required files present."

command -v node >/dev/null 2>&1 || { echo "node is required (for npm test)." >&2; exit 1; }
command -v zip >/dev/null 2>&1 || { echo "zip is required." >&2; exit 1; }

# --- 2. Copy to temp build dir ----------------------------------------------
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT
cp -a "$SRC/." "$BUILD/"
echo "OK: staged build in $BUILD"

# --- 3. Stamp version ---------------------------------------------------------
OLD_ESC="${OLD//./\\.}"
for f in index.html service-worker.js package.json; do
  sed -i "s/${OLD_ESC}/${NEW}/g" "$BUILD/$f"
done
echo "OK: stamped version $OLD -> $NEW"

# --- 4. No stale version may survive ------------------------------------------
if grep -rn "$OLD" "$BUILD/index.html" "$BUILD/service-worker.js" "$BUILD/package.json" >/dev/null; then
  echo "STALE VERSION: '$OLD' still present after stamping:" >&2
  grep -rn "$OLD" "$BUILD/index.html" "$BUILD/service-worker.js" "$BUILD/package.json" >&2
  exit 1
fi
echo "OK: no stale '$OLD' strings remain."

# --- 5. Run the test suite ----------------------------------------------------
( cd "$BUILD" && npm test )
echo "OK: npm test passed."

# --- 6. Zip --------------------------------------------------------------------
OUT="releases/financial-lab-${NEW}-${NAME}.zip"
mkdir -p releases
rm -f "$OUT"
( cd "$BUILD" && zip -qr "$OLDPWD/$OUT" . -x 'node_modules/*' 'releases/*' 'media-generation-*' )
echo "OK: release written to $OUT"
ls -lh "$OUT"
