#!/usr/bin/env bash
set -euo pipefail
# Repository selection belongs to this script, never to inherited Git overrides.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_COMMON_DIR

# Static analysis for Egregore command and script files.
# Detects known antipatterns: unguarded Cypher date calls, macOS-incompatible bash,
# direct API curl calls, missing null guards.
#
# Usage:
#   bash bin/test-changes.sh                 # scan branch changes and local files
#   bash bin/test-changes.sh --all           # scan all command and script files
#   bash bin/test-changes.sh file1 file2     # scan specific files
#
# Exit 0 = no FAILs, Exit 1 = any FAILs
# Exit 2 = scope could not be resolved or a selected file is unreadable

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# shellcheck source=/dev/null
source "$SCRIPT_DIR/bin/lib/generated-trees.sh"
# The scanner and its test file necessarily contain the antipatterns they detect.
SELF_FILES=(test-changes.sh test-test-changes.sh)

PASS=0
FAIL=0
WARN=0

# Colors
RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
DIM='\033[0;90m'
NC='\033[0m'

pass() {
  PASS=$((PASS + 1))
  echo -e "  ${GREEN}✓${NC} $1"
}

fail() {
  FAIL=$((FAIL + 1))
  echo -e "  ${RED}✗ FAIL${NC}: $1"
  [ -n "${2:-}" ] && echo -e "    ${DIM}$2${NC}"
}

warn() {
  WARN=$((WARN + 1))
  echo -e "  ${YELLOW}⚠ WARN${NC}: $1"
  [ -n "${2:-}" ] && echo -e "    ${DIM}$2${NC}"
}

# --- Scope detection ---
FILES=()
DEFAULT_SCOPE=false

if [ "${1:-}" = "--all" ]; then
  # Scan all command and script files
  while IFS= read -r -d '' f; do
    [ -f "$f" ] && FILES+=("$f")
  done < <(find "$SCRIPT_DIR/.claude/skills" "$SCRIPT_DIR/.codex/skills" \
    "$SCRIPT_DIR/bin" -type f \( -name "*.md" -o -name "*.sh" \) -print0 2>/dev/null)
elif [ $# -gt 0 ]; then
  # Scan specific files
  for f in "$@"; do
    if [ -f "$f" ]; then
      FILES+=("$f")
    elif [ -f "$SCRIPT_DIR/$f" ]; then
      FILES+=("$SCRIPT_DIR/$f")
    fi
  done
else
  DEFAULT_SCOPE=true
  # The config helper is resolved relative to this script, including in fixture repos.
  # shellcheck source=/dev/null
  if ! source "$SCRIPT_DIR/bin/lib/config.sh" 2>/dev/null \
     || ! BASE=$(_get_base_branch 2>/dev/null); then
    BASE=develop
    echo "Could not resolve configured base branch; falling back to develop." >&2
  fi
  if git -C "$SCRIPT_DIR" rev-parse --verify --quiet "origin/$BASE^{commit}" >/dev/null; then
    SCOPE_REF="origin/$BASE"
  elif git -C "$SCRIPT_DIR" rev-parse --verify --quiet "$BASE^{commit}" >/dev/null; then
    SCOPE_REF="$BASE"
  else
    echo "test-changes: cannot resolve base branch origin/$BASE or $BASE for scope; fetch it or pass files explicitly" >&2
    exit 2
  fi
  if ! mb=$(git -C "$SCRIPT_DIR" merge-base "$SCOPE_REF" HEAD 2>/dev/null); then
    mb="$SCOPE_REF"
  fi
  scope_sha=$(git -C "$SCRIPT_DIR" rev-parse --short=7 "$mb" 2>/dev/null) || scope_sha="$mb"
  # NUL delimiters preserve filenames; append untracked files after Git's diff order.
  while IFS= read -r -d '' f; do
    case "$f" in
      *.md|*.sh) ;;
      *) continue ;;
    esac
    [ -f "$SCRIPT_DIR/$f" ] || continue
    duplicate=false
    for existing in ${FILES[@]+"${FILES[@]}"}; do
      if [ "$existing" = "$SCRIPT_DIR/$f" ]; then
        duplicate=true
        break
      fi
    done
    $duplicate || FILES+=("$SCRIPT_DIR/$f")
  done < <(
    git -C "$SCRIPT_DIR" diff --name-only -z "$mb" 2>/dev/null || true
    git -C "$SCRIPT_DIR" ls-files --others --exclude-standard -z 2>/dev/null || true
  )
fi

# Apply the same exclusions to every mode, before splitting files by type.
SCAN_FILES=()
SKIPPED_GENERATED=0
UNREADABLE_FILES=0
for f in ${FILES[@]+"${FILES[@]}"}; do
  # Normalize directory spelling so explicit ./ paths use the same deny-list.
  parent="${f%/*}"
  [ "$parent" != "$f" ] || parent=.
  parent="${parent:-/}"
  f="$(cd "$parent" && pwd)/${f##*/}"
  rel="${f#"$SCRIPT_DIR"/}"
  if is_generated_path "$rel"; then
    SKIPPED_GENERATED=$((SKIPPED_GENERATED + 1))
    continue
  fi
  self=false
  for name in "${SELF_FILES[@]}"; do
    if [ "${f##*/}" = "$name" ]; then
      self=true
      break
    fi
  done
  $self && continue
  if [ ! -r "$f" ]; then
    echo "test-changes: cannot read $rel" >&2
    UNREADABLE_FILES=$((UNREADABLE_FILES + 1))
    continue
  fi
  SCAN_FILES+=("$f")
done
if [ "$UNREADABLE_FILES" -gt 0 ]; then
  exit 2
fi
FILES=(${SCAN_FILES[@]+"${SCAN_FILES[@]}"})

if $DEFAULT_SCOPE; then
  echo -e "${DIM}Scope: ${#FILES[@]} changed file(s) vs $SCOPE_REF (merge-base ${scope_sha:0:7})${NC}"
fi
if [ "$SKIPPED_GENERATED" -gt 0 ]; then
  echo -e "${DIM}Skipped $SKIPPED_GENERATED generated file(s)${NC}"
fi

if [ ${#FILES[@]} -eq 0 ]; then
  echo "No testable files found."
  echo '{"pass":0,"fail":0,"warn":0}'
  exit 0
fi

echo "Scanning ${#FILES[@]} file(s)..."
echo ""

# Split files by type for targeted checks
MD_FILES=()
SH_FILES=()
MD_COUNT=0
SH_COUNT=0
for f in "${FILES[@]}"; do
  case "$f" in
    *.md) MD_FILES+=("$f"); MD_COUNT=$((MD_COUNT + 1)) ;;
    *.sh) SH_FILES+=("$f"); SH_COUNT=$((SH_COUNT + 1)) ;;
  esac
done

# Emit numbered candidates using a fixed number of grep processes per file.
# Callers consume findings in this shell so pass/fail/warn counters persist.
scan_rule() {
  local file="$1" pattern="$2" exclude="${3:-}"
  if [ "$#" -ge 3 ]; then shift 3; else shift 2; fi
  if [ -n "$exclude" ]; then
    { grep -anE "$@" "$pattern" "$file" || true; } \
      | { grep -avE "$exclude" || true; }
  else
    grep -anE "$@" "$pattern" "$file" || true
  fi
}

# ============================================================
# CHECK 1: date(x.field) without toString guard
# Severity: FAIL
# ============================================================
echo -e "  ${DIM}[1/8] Unguarded date() calls...${NC}"
CHECK1_CLEAN=true
for f in ${MD_FILES[@]+"${MD_FILES[@]}"}; do
  fname="${f##*/}"
  while IFS=: read -r lineno _; do
    fail "Unguarded date() call" "$fname:$lineno — use date(left(toString(x.field), 10))"
    CHECK1_CLEAN=false
  done < <(scan_rule "$f" 'date\([a-z]+\.(date|created|started|completed)\)' 'toString\(')
done
$CHECK1_CLEAN && pass "No unguarded date() calls"

# ============================================================
# CHECK 2: .year/.month/.day on mixed-type date fields
# Severity: FAIL
# ============================================================
echo -e "  ${DIM}[2/8] Mixed-type .year/.month/.day access...${NC}"
CHECK2_CLEAN=true
for f in ${MD_FILES[@]+"${MD_FILES[@]}"}; do
  fname="${f##*/}"
  while IFS=: read -r lineno _; do
    fail ".year/.month/.day on mixed-type field" "$fname:$lineno — convert with date(left(toString(...), 10)) first"
    CHECK2_CLEAN=false
  done < <(scan_rule "$f" '[a-z]+\.(date|created)\.(year|month|day)' '(sDate|safeDate|dateVal)\.(year|month|day)')
done
$CHECK2_CLEAN && pass "No .year/.month/.day on mixed-type fields"

# ============================================================
# CHECK 3: MATCH without LIMIT (stateful block parse)
# Severity: WARN
# ============================================================
echo -e "  ${DIM}[3/8] MATCH without LIMIT...${NC}"
CHECK3_CLEAN=true
for f in ${MD_FILES[@]+"${MD_FILES[@]}"}; do
  fname="${f##*/}"
  while IFS= read -r block_start; do
    warn "MATCH without LIMIT in Cypher block" "$fname:$block_start"
    CHECK3_CLEAN=false
  done < <(awk '
    /^[[:space:]]*```cypher/ {
      in_cypher = 1
      has_return = has_limit = has_aggregate = has_nolimit_comment = 0
      block_start = NR
      next
    }
    in_cypher && /^[[:space:]]*```[[:space:]]*$/ {
      if (has_return && !has_limit && !has_aggregate && !has_nolimit_comment)
        print block_start
      in_cypher = 0
      next
    }
    in_cypher {
      line = tolower($0)
      if (line ~ /return/) has_return = 1
      if (line ~ /limit/) has_limit = 1
      if (line ~ /(count|sum|avg|collect|min|max)\(/) has_aggregate = 1
      if (line ~ /no limit/) has_nolimit_comment = 1
    }
  ' "$f")
done
$CHECK3_CLEAN && pass "All MATCH blocks have LIMIT or aggregates"

# ============================================================
# CHECK 4: IN x.topics without coalesce null guard
# Severity: WARN
# ============================================================
echo -e "  ${DIM}[4/8] Missing coalesce on collection access...${NC}"
CHECK4_CLEAN=true
for f in ${MD_FILES[@]+"${MD_FILES[@]}"}; do
  fname="${f##*/}"
  while IFS=: read -r lineno _; do
    warn "IN x.topics without coalesce guard" "$fname:$lineno — use coalesce(x.topics, [])"
    CHECK4_CLEAN=false
  done < <(scan_rule "$f" 'IN [a-z]+\.(topics|tags)' 'coalesce')
done
$CHECK4_CLEAN && pass "All collection access has coalesce guard"

# ============================================================
# CHECK 5: Hardcoded year-specific fallback dates
# Severity: WARN
# ============================================================
echo -e "  ${DIM}[5/8] Hardcoded year-specific dates...${NC}"
CHECK5_CLEAN=true
for f in "${FILES[@]}"; do
  fname="${f##*/}"
  while IFS= read -r lineno; do
    warn "Hardcoded date literal" "$fname:$lineno"
    CHECK5_CLEAN=false
  done < <(awk '
    NR == 1 && $0 == "---" { in_frontmatter = 1; next }
    in_frontmatter {
      if ($0 == "---") in_frontmatter = 0
      next
    }
    /^[[:space:]]*(#|\/\/|<!--)/ { next }
    /202[5-9]-[0-9]{2}-[0-9]{2}/ {
      if (tolower($0) !~ /(example|e\.g\.|yyyy-mm-dd|fallback|joined:|date.*:)/)
        print NR
    }
  ' "$f")
done
$CHECK5_CLEAN && pass "No hardcoded year-specific dates"

# ============================================================
# CHECK 6: macOS-incompatible bash
# Severity: FAIL
# ============================================================
echo -e "  ${DIM}[6/8] macOS-compatible bash...${NC}"
CHECK6_CLEAN=true
DATE_PATTERN='date \+.*%[0-9]*N'
SED_PATTERN="sed -i [^']"
for f in ${SH_FILES[@]+"${SH_FILES[@]}"}; do
  fname="${f##*/}"
  while IFS=: read -r lineno line; do
    # Classify only candidates with shell builtins, preserving order on shared lines.
    # date +%N (nanoseconds) — not available on macOS date
    if [[ "$line" =~ $DATE_PATTERN ]] && [[ "$line" != *gdate* ]]; then
      fail "macOS-incompatible date +%N" "$fname:$lineno — use gdate or alternative"
      CHECK6_CLEAN=false
    fi
    # sed -i without '' (GNU vs BSD)
    if [[ "$line" =~ $SED_PATTERN ]]; then
      fail "macOS-incompatible sed -i" "$fname:$lineno — use sed -i '' for BSD compatibility"
      CHECK6_CLEAN=false
    fi
  done < <(scan_rule "$f" "$DATE_PATTERN|$SED_PATTERN")
done
if [ "$SH_COUNT" -eq 0 ]; then
  pass "macOS-compatible bash (no .sh files to check)"
else
  $CHECK6_CLEAN && pass "macOS-compatible bash"
fi

# ============================================================
# CHECK 7: Direct curl to Neo4j/Telegram
# Severity: FAIL
# ============================================================
echo -e "  ${DIM}[7/8] Direct API calls...${NC}"
CHECK7_CLEAN=true
NEO4J_PATTERN='curl.*(neo4j|graph/query)'
TELEGRAM_PATTERN='curl.*(api\.telegram|sendMessage)'
for f in "${FILES[@]}"; do
  fname="${f##*/}"
  # Skip the wrapper scripts themselves
  case "$fname" in
    graph.sh|notify.sh) continue ;;
  esac
  while IFS=: read -r lineno line; do
    # Candidates are case-insensitive, but wrapper exclusions remain case-sensitive.
    neo4j=false
    telegram=false
    shopt -s nocasematch
    [[ "$line" =~ $NEO4J_PATTERN ]] && neo4j=true
    [[ "$line" =~ $TELEGRAM_PATTERN ]] && telegram=true
    shopt -u nocasematch
    if $neo4j && [[ ! "$line" =~ bin/graph.sh ]]; then
      fail "Direct curl to Neo4j" "$fname:$lineno — use bin/graph.sh"
      CHECK7_CLEAN=false
    fi
    if $telegram && [[ ! "$line" =~ bin/notify.sh ]]; then
      fail "Direct curl to Telegram" "$fname:$lineno — use bin/notify.sh"
      CHECK7_CLEAN=false
    fi
  done < <(scan_rule "$f" "$NEO4J_PATTERN|$TELEGRAM_PATTERN" '' -i)
done
$CHECK7_CLEAN && pass "No direct API calls (using bin/ wrappers)"

# ============================================================
# CHECK 8: source .env (should use grep|cut extraction instead)
# Severity: WARN
# ============================================================
echo -e "  ${DIM}[8/8] Safe .env sourcing...${NC}"
CHECK8_CLEAN=true
for f in ${SH_FILES[@]+"${SH_FILES[@]}"}; do
  fname="${f##*/}"
  while IFS=: read -r lineno _; do
    warn "source .env found — use grep|cut extraction instead" "$fname:$lineno"
    CHECK8_CLEAN=false
  done < <(scan_rule "$f" 'source.*\.env')
done
if [ "$SH_COUNT" -eq 0 ]; then
  pass "Safe .env sourcing (no .sh files to check)"
else
  $CHECK8_CLEAN && pass "Safe .env sourcing (no source .env usage)"
fi

# ============================================================
# SUMMARY
# ============================================================
echo ""
if [ $FAIL -eq 0 ] && [ $WARN -eq 0 ]; then
  echo -e "${GREEN}  ✓ All checks passed${NC}"
elif [ $FAIL -eq 0 ]; then
  echo -e "${YELLOW}  ⚠ $PASS passed, $WARN warning(s)${NC}"
else
  echo -e "${RED}  ✗ $PASS passed, $FAIL failure(s), $WARN warning(s)${NC}"
fi

# JSON summary (always last line)
echo "{\"pass\":$PASS,\"fail\":$FAIL,\"warn\":$WARN}"

# Exit 1 if any FAILs
[ $FAIL -eq 0 ]
