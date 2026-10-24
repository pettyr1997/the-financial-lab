#!/usr/bin/env bash
#
# stamp-dexx-keys.sh — stamp the Supabase credentials into the v4.1.22.0 app.js.
#
# Usage:
#   ./tools/stamp-dexx-keys.sh <anon-key> [target-app.js]
#
# Replaces the __FL_SUPABASE_URL__ / __FL_SUPABASE_ANON_KEY__ placeholders in
# app.js with the real project URL and the anon public key Robert pastes in
# chat. The anon key is public-safe by design — it ships inside the client
# code. The secret service_role key must NEVER be stamped here.
#
# Idempotent: re-running with the same key is a no-op. If app.js is already
# stamped with DIFFERENT values, the script refuses (avoids clobbering a
# different project) — pass an explicit target or edit manually in that case.
#
# The script uses python3 for literal replacement so a JWT (dots, dashes,
# underscores) can never break a sed delimiter.

set -euo pipefail

SUPABASE_URL="https://udmvocamaqspwvqwamnf.supabase.co"  # Robert's Supabase dashboard, 2026-10-23

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <anon-key> [target-app.js]" >&2
  exit 1
fi
ANON_KEY="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${2:-$SCRIPT_DIR/../app.js}"

if [ ! -f "$TARGET" ]; then
  echo "STAMP FAILED: target not found: $TARGET" >&2
  exit 1
fi
if [[ ! "$ANON_KEY" =~ ^eyJ[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+$ ]]; then
  echo "STAMP FAILED: anon key does not look like a Supabase anon JWT (expected eyJ…; got ${#ANON_KEY} chars)." >&2
  exit 1
fi
command -v python3 >/dev/null 2>&1 || { echo "STAMP FAILED: python3 is required." >&2; exit 1; }

python3 - "$TARGET" "$SUPABASE_URL" "$ANON_KEY" <<'EOF'
import sys
target, url, key = sys.argv[1], sys.argv[2], sys.argv[3]
URL_PH, KEY_PH = "__FL_SUPABASE_URL__", "__FL_SUPABASE_ANON_KEY__"

with open(target) as f:
    src = f.read()

has_url_ph = URL_PH in src
has_key_ph = KEY_PH in src

if not has_url_ph and not has_key_ph:
    # Already stamped — verify it matches, refuse if it doesn't.
    if url in src and key in src:
        print("ALREADY STAMPED: app.js already carries these exact values; no changes made.")
        sys.exit(0)
    print("STAMP REFUSED: app.js has no placeholders and does not match the given values.", file=sys.stderr)
    print("It may be stamped for a different project — inspect before overwriting.", file=sys.stderr)
    sys.exit(1)

src = src.replace(URL_PH, url).replace(KEY_PH, key)
with open(target, "w") as f:
    f.write(src)
print(f"STAMPED: replaced {'URL placeholder' if has_url_ph else '(URL already set)'}"
      f" and {'key placeholder' if has_key_ph else '(key already set)'} in {target}")
EOF

# --- Verify: only the two real placeholder tokens may not survive --------------
# (The file also mentions "__FL_" in a comment and in the dexxAIReady()
# regex on purpose — those are not placeholders and must stay.)
for ph in "__FL_SUPABASE_URL__" "__FL_SUPABASE_ANON_KEY__"; do
  if grep -qF "$ph" "$TARGET"; then
    echo "VERIFY FAILED: placeholder '$ph' still present in $TARGET" >&2
    exit 1
  fi
done
echo "VERIFY OK: both key placeholders stamped."
if command -v node >/dev/null 2>&1; then
  node --check "$TARGET" && echo "VERIFY OK: node --check clean."
else
  echo "VERIFY SKIPPED: node not found."
fi
echo "Dexx endpoint will be: ${SUPABASE_URL}/functions/v1/dexx-chat"
