#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Migration Verification Script
# ═══════════════════════════════════════════════════════════════════════════════
#
# Validates the local migration files for:
#   1. Sequential numbering (no gaps or duplicates)
#   2. Consistent naming format
#   3. Non-empty file content
#   4. Generates SHA256 checksums for integrity tracking
#
# Usage:
#   ./scripts/verify-migrations.sh              # Run all checks
#   ./scripts/verify-migrations.sh --checksums   # Also print SHA256 checksums
#
# Exit codes:
#   0 = All checks passed
#   1 = Issues found
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

MIGRATIONS_DIR="$(cd "$(dirname "$0")/migrations" && pwd)"
SHOW_CHECKSUMS=false
ERRORS=0

if [[ "${1:-}" == "--checksums" ]]; then
  SHOW_CHECKSUMS=true
fi

echo "═══════════════════════════════════════════════════════"
echo "  Migration Verification Report"
echo "  Directory: $MIGRATIONS_DIR"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── 1. Count files ───────────────────────────────────────
FILES=($(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort))
FILE_COUNT=${#FILES[@]}

echo "📊 Total migration files: $FILE_COUNT"
echo ""

if [[ $FILE_COUNT -eq 0 ]]; then
  echo "❌ No migration files found!"
  exit 1
fi

# ── 2. Check sequential numbering ────────────────────────
echo "🔢 Checking sequential numbering..."
PREV_NUM=-1
GAPS=()
DUPLICATES=()

for f in "${FILES[@]}"; do
  BASENAME=$(basename "$f")
  # Extract the numeric prefix (handles both 000_ and 000- patterns)
  NUM_STR=$(echo "$BASENAME" | grep -oE '^[0-9]+')
  NUM=$((10#$NUM_STR))  # Convert to decimal (handle leading zeros)

  if [[ $NUM -eq $PREV_NUM ]]; then
    DUPLICATES+=("$NUM ($BASENAME)")
  elif [[ $PREV_NUM -ge 0 && $NUM -ne $((PREV_NUM + 1)) ]]; then
    for ((gap=PREV_NUM+1; gap<NUM; gap++)); do
      GAPS+=("$(printf '%03d' $gap)")
    done
  fi

  PREV_NUM=$NUM
done

if [[ ${#DUPLICATES[@]} -gt 0 ]]; then
  echo "  ❌ DUPLICATE numbers found:"
  for dup in "${DUPLICATES[@]}"; do
    echo "     - $dup"
  done
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ No duplicate numbers"
fi

if [[ ${#GAPS[@]} -gt 0 ]]; then
  echo "  ⚠️  Gaps in numbering (may be intentional):"
  for gap in "${GAPS[@]}"; do
    echo "     - Missing: $gap"
  done
else
  echo "  ✅ Sequential numbering intact"
fi

# ── 3. Check naming consistency ──────────────────────────
echo ""
echo "📝 Checking naming format..."
BAD_NAMES=()

for f in "${FILES[@]}"; do
  BASENAME=$(basename "$f")
  # Valid formats: NNN_name.sql or NNN-name.sql
  if ! echo "$BASENAME" | grep -qE '^[0-9]{3}[-_][a-z0-9][-a-z0-9_]*\.sql$'; then
    BAD_NAMES+=("$BASENAME")
  fi
done

if [[ ${#BAD_NAMES[@]} -gt 0 ]]; then
  echo "  ⚠️  Non-standard naming:"
  for name in "${BAD_NAMES[@]}"; do
    echo "     - $name"
  done
else
  echo "  ✅ All files follow NNN-name.sql or NNN_name.sql format"
fi

# ── 4. Check for empty files ─────────────────────────────
echo ""
echo "📄 Checking file content..."
EMPTY_FILES=()

for f in "${FILES[@]}"; do
  # Check if file has any non-comment, non-empty lines
  CONTENT_LINES=$(grep -cve '^\s*$\|^\s*--' "$f" 2>/dev/null || true)
  if [[ $CONTENT_LINES -eq 0 ]]; then
    EMPTY_FILES+=("$(basename "$f")")
  fi
done

if [[ ${#EMPTY_FILES[@]} -gt 0 ]]; then
  echo "  ❌ Empty or comment-only files:"
  for ef in "${EMPTY_FILES[@]}"; do
    echo "     - $ef"
  done
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ All files contain SQL statements"
fi

# ── 5. Checksums (optional) ──────────────────────────────
if $SHOW_CHECKSUMS; then
  echo ""
  echo "🔐 SHA256 Checksums:"
  for f in "${FILES[@]}"; do
    BASENAME=$(basename "$f")
    CHECKSUM=$(shasum -a 256 "$f" | awk '{print $1}')
    printf "  %-50s %s\n" "$BASENAME" "$CHECKSUM"
  done
fi

# ── 6. Summary ───────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
FIRST=$(basename "${FILES[0]}" | grep -oE '^[0-9]+')
LAST_IDX=$((FILE_COUNT - 1))
LAST=$(basename "${FILES[$LAST_IDX]}" | grep -oE '^[0-9]+')
echo "  Range: $FIRST → $LAST  |  Files: $FILE_COUNT"

if [[ $ERRORS -gt 0 ]]; then
  echo "  Status: ❌ $ERRORS issue(s) found"
  echo "═══════════════════════════════════════════════════════"
  exit 1
else
  echo "  Status: ✅ All checks passed"
  echo "═══════════════════════════════════════════════════════"
  exit 0
fi
