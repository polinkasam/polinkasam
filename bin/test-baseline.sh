#!/usr/bin/env bash
set -euo pipefail
# Repository selection belongs to this script, never to inherited Git overrides.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_COMMON_DIR

# Compare selected suites in a detached base checkout and the working tree.
# Usage: bash bin/test-baseline.sh [--base REF] [--head-first] [--strict-head] [--timeout N] [--keep] [--json] <suite>... | -
# Exit 0 = no regressions (with --strict-head, every head suite executed and passed)
# Exit 1 = regression, or any completed head failure with --strict-head
# Exit 2 = invalid arguments, unavailable base, timeout, environment failure,
#          or unexecuted head suite with --strict-head
# Scratch lives outside the repository under TMPDIR and is removed on exit unless
# --keep is set. The base is clean: suites depending on untracked local files can
# look fixed rather than clean. Suites run sequentially, with no timeout unless
# --timeout supplies a positive deadline in seconds for each child command.
# Timeout termination allows up to one second for suite-owned cleanup before KILL.
# --head-first compares the base only when the head fails; an unchecked base
# cannot distinguish a clean suite from a fix, so successful heads are "passed".
# --strict-head retains comparison classifications and logs but rejects existing
# head failures too. Blocked or incomplete execution takes precedence over failure.
# A suite that executes and returns 0 with SKIP notices remains a reported gap.
# The runner writes only scratch files; suites themselves can write in their cwd.
# Different nonzero exit codes are regressions, even without new failure lines.

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/bin/lib/repo-paths.sh"
export GIT_OPTIONAL_LOCKS=0

usage() {
  echo "Usage: bash bin/test-baseline.sh [--base REF] [--head-first] [--strict-head] [--timeout N] [--keep] [--json] <suite>... | -" >&2
  exit 2
}
error() { printf 'test-baseline: %s\n' "$*" >&2; exit 2; }

base=""
keep=false
json=false
head_first=false
strict_head=false
timeout=""
selected=()
add_suite() {
  local existing
  for existing in ${selected[@]+"${selected[@]}"}; do
    [ "$existing" != "$1" ] || return 0
  done
  selected+=("$1")
}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --base)
      [ "$#" -ge 2 ] && [ -n "$2" ] || usage
      case "$2" in -*) usage ;; esac
      base="$2"; shift 2
      ;;
    --keep) keep=true; shift ;;
    --json) json=true; shift ;;
    --head-first) head_first=true; shift ;;
    --strict-head) strict_head=true; shift ;;
    --timeout)
      [ "$#" -ge 2 ] || usage
      [[ "$2" =~ ^[1-9][0-9]*$ ]] || error 'timeout must be a positive integer'
      timeout="$2"; shift 2
      ;;
    -)
      while IFS= read -r suite || [ -n "$suite" ]; do
        suite="${suite%$'\r'}"
        case "$suite" in ''|\#*) continue ;; esac
        add_suite "$suite"
      done
      shift
      ;;
    -*) usage ;;
    *) add_suite "$1"; shift ;;
  esac
done
if [ -n "$timeout" ]; then command -v sleep >/dev/null 2>&1 || error 'sleep is required for --timeout'; fi
[ "${#selected[@]}" -gt 0 ] || usage
for dependency in git jq bash mktemp mkdir rm readlink grep sort comm tail awk cat; do
  command -v "$dependency" >/dev/null 2>&1 || error "$dependency is required"
done

for suite in "${selected[@]}"; do
  case "$suite" in /*|..|../*|*/../*|*/..) error "suite $suite (outside repository)" ;; esac
  [ -f "$SCRIPT_DIR/$suite" ] || error "suite $suite not found"
  inside_repository "$suite" || error "suite $suite (outside repository)"
  case "$suite" in *.sh|*.py|*.mjs|*.js|*.bats) ;; *) error "unsupported suite type $suite" ;; esac
done
if [ -z "$base" ]; then
  base=$(bash "$SCRIPT_DIR/bin/base-branch.sh" --resolve) || exit 2
fi
base_oid=$(git -C "$SCRIPT_DIR" rev-parse --verify --quiet "$base^{commit}") \
  || error "base $base not found"
head_ref=$(git -C "$SCRIPT_DIR" symbolic-ref --quiet --short HEAD) || head_ref=HEAD

# Refuse scratch inside the checkout or either Git metadata directory, including
# a linked worktree's shared Git directory outside its checkout.
temp_root=$(cd -P "${TMPDIR:-/tmp}" 2>/dev/null && pwd) || error "cannot access scratch directory"
physical_root=$(cd -P "$SCRIPT_DIR" && pwd)
case "$temp_root" in "$physical_root"|"$physical_root"/*) error "scratch directory is inside repository" ;; esac
for git_directory_option in --git-dir --git-common-dir; do
  git_directory=$(git -C "$SCRIPT_DIR" rev-parse --path-format=absolute "$git_directory_option") \
    || error "cannot resolve Git directory"
  git_directory=$(physical_path "$git_directory") || error "cannot resolve Git directory"
  case "$temp_root" in "$git_directory"|"$git_directory"/*) error "scratch directory is inside repository" ;; esac
done

run_dir=""
child_pid=""
watchdog_pid=""
# shellcheck disable=SC2329
stop_watchdog() {
  if [ -n "$watchdog_pid" ]; then
    kill -KILL -- "-$watchdog_pid" 2>/dev/null || kill -KILL "$watchdog_pid" 2>/dev/null || true
    wait "$watchdog_pid" 2>/dev/null || true
    watchdog_pid=""
  fi
}
# Called by the signal and EXIT traps.
# shellcheck disable=SC2329
stop_child() {
  stop_watchdog
  if [ -n "$child_pid" ]; then
    # Each child has its own process group, including shell-suite descendants.
    kill -TERM -- "-$child_pid" 2>/dev/null || kill -TERM "$child_pid" 2>/dev/null || true
    kill -KILL -- "-$child_pid" 2>/dev/null || kill -KILL "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
    child_pid=""
  fi
}
# shellcheck disable=SC2329
cleanup() {
  stop_child
  if [ -n "$run_dir" ] && ! $keep; then
    git -C "$SCRIPT_DIR" worktree remove --force "$run_dir/base" >/dev/null 2>&1 || true
    rm -rf "$run_dir"
  fi
}
trap cleanup EXIT
trap 'stop_child; exit 130' INT
trap 'stop_child; exit 143' TERM
# Unexpected command/filesystem errors are environment failures, never regressions.
trap 'error "environment command failed (line $LINENO)"' ERR
set -E
run_dir=$(mktemp -d "${TMPDIR:-/tmp}/qa-baseline.XXXXXX") || error "cannot create scratch directory"
# Use the physical spelling consistently in Git, logs, and failure normalization.
run_dir=$(cd -P "$run_dir" && pwd)
mkdir -p "$run_dir/logs/base" "$run_dir/logs/head" || error "cannot create scratch logs"
if ! git -C "$SCRIPT_DIR" worktree add --detach --quiet "$run_dir/base" "$base_oid" \
    > "$run_dir/worktree.out" 2> "$run_dir/worktree.err"; then
  echo 'test-baseline: cannot create the base worktree:' >&2
  cat "$run_dir/worktree.err" >&2
  exit 2
fi
for suite in "${selected[@]}"; do
  if [ -e "$run_dir/base/$suite" ] || [ -L "$run_dir/base/$suite" ]; then
    inside_repository "$suite" "$run_dir/base" || error "suite $suite (outside repository at base)"
  fi
done

# Background children and wait let INT/TERM run immediately, even for a hung suite.
# Job control gives each child a private process group; no global process search.
run_child() {
  local tree="$1" log="$2" start=$SECONDS watched_pid
  shift 2
  rm -f "$run_dir/timed-out"
  run_timed_out=false
  set -m
  (cd "$tree" && exec "$@") < /dev/null > "$log" 2>&1 &
  child_pid=$!
  if [ -n "$timeout" ]; then
    watched_pid=$child_pid
    (
      # This watchdog owns a separate group, including its sleep process, so
      # normal completion and external interruption cancel the whole timer.
      set +m
      if ! sleep "$timeout"; then
        : > "$run_dir/timer-failed"
      fi
      if kill -0 -- "-$watched_pid" 2>/dev/null; then
        : > "$run_dir/timed-out"
        kill -TERM -- "-$watched_pid" 2>/dev/null || true
        # Harness suites may own additional groups and clean them in a TERM
        # trap. Only expired commands pay this grace period; normal completion
        # cancels the watchdog and its sleep immediately.
        sleep 1 || true
        kill -KILL -- "-$watched_pid" 2>/dev/null || true
      fi
    ) < /dev/null > /dev/null 2>&1 &
    watchdog_pid=$!
  fi
  set +m
  run_exit=0
  wait "$child_pid" || run_exit=$?
  stop_child
  [ ! -f "$run_dir/timer-failed" ] || error 'suite deadline timer failed'
  if [ -f "$run_dir/timed-out" ]; then run_timed_out=true; run_exit=124; fi
  run_seconds=$((SECONDS - start))
}
pytest_state=unknown
base_node_state=unknown
head_node_state=unknown
base_node=()
head_node=()
probe_node() {
  local tree="$1" side="$2"
  node_command=()
  node_probe_timed_out=false
  if [ -f "$tree/bin/node-run.sh" ]; then
    inside_repository bin/node-run.sh "$tree" || error "node adapter (outside repository)"
    run_child "$tree" "$run_dir/node-$side.log" bash bin/node-run.sh --version
    if $run_timed_out; then node_probe_timed_out=true; return; fi
    if [ "$run_exit" -eq 0 ]; then node_command=(bash bin/node-run.sh); return; fi
  fi
  if command -v node >/dev/null 2>&1; then
    run_child "$tree" "$run_dir/node-$side.log" node --version
    if $run_timed_out; then node_probe_timed_out=true; return; fi
    if [ "$run_exit" -eq 0 ]; then node_command=(node); fi
  fi
}
prepare_node() {
  local tree="$1" side="$2"
  if [ "$side" = base ]; then node_state=$base_node_state
  else node_state=$head_node_state; fi
  if [ "$node_state" = unknown ]; then
    probe_node "$tree" "$side"
    if $node_probe_timed_out; then node_state=timeout
    elif [ "${#node_command[@]}" -eq 0 ]; then node_state=missing
    else node_state=available; fi
    if [ "$side" = base ]; then
      base_node_state=$node_state; base_node=(${node_command[@]+"${node_command[@]}"})
    else
      head_node_state=$node_state; head_node=(${node_command[@]+"${node_command[@]}"})
    fi
  fi
}
failure_lines() {
  local code=0 escape
  escape=$(printf '\033')
  grep -aE '✗|FAIL|ERROR|not ok|Traceback' "$1" > "$run_dir/matched" || code=$?
  [ "$code" -le 1 ] || error "cannot read suite log"
  # Scratch paths are random per run: the runner's own TMPDIR (whatever it is),
  # the system temp roots, and both checkouts all collapse to fixed tokens.
  jq -Rsr --arg base "$run_dir/base" --arg head "$SCRIPT_DIR" --arg esc "$escape" \
    --arg tmp "${TMPDIR:-/tmp}" '
    split("\n")[] | select(length > 0)
    | gsub($esc + "\\[[0-?]*[ -/]*[@-~]"; "")
    | select(test("^[[:space:]]*(PASS\\b|✓|ok[[:space:]]+[0-9]+\\b)") | not)
    | split($base) | join("<root>") | split($head) | join("<root>")
    | ($tmp | sub("/+$"; "")) as $t
    | if ($t | length) > 1 then split($t) as $p
        | $p[0] + ($p[1:] | map("<tmp>" + sub("^[^[:space:]]*"; "")) | join(""))
      else . end
    | gsub("(/private)?(/var/folders|/tmp)/[^[:space:]]*"; "<tmp>")
  ' "$run_dir/matched" | LC_ALL=C sort -u > "$2"
}
result_text() {
  if [ "$1" = null ]; then printf absent
  elif [ "$1" -eq 0 ]; then printf 'pass %ss' "$2"
  else printf 'fail %s %ss' "$1" "$2"; fi
}
: > "$run_dir/suites.jsonl"
{
  printf 'QA baseline\nBase: %s (%s)\n' "$base" "${base_oid:0:7}"
  printf 'Head: %s + working tree\nSuites (%s):\n' "$head_ref" "${#selected[@]}"
} > "$run_dir/report"
if ! $json; then cat "$run_dir/report"; fi
for suite in "${selected[@]}"; do
  note=""
  status=""
  runner=""
  printf 'test-baseline: suite %s\n' "$suite" >&2
  case "$suite" in
    *.sh) runner=bash ;;
    *.py)
      runner=pytest
      if [ "$pytest_state" = unknown ]; then
        pytest_state=missing
        if command -v python3 >/dev/null 2>&1; then
          run_child "$SCRIPT_DIR" "$run_dir/pytest.log" python3 -c 'import pytest'
          if $run_timed_out; then pytest_state=timeout
          elif [ "$run_exit" -eq 0 ]; then pytest_state=available; fi
        fi
      fi
      if [ "$pytest_state" = timeout ]; then
        status=blocked; note="pytest probe timed out after ${timeout}s"
      elif [ "$pytest_state" != available ]; then status=skipped; note='no pytest'; fi
      ;;
    *.mjs|*.js)
      runner=node
      # Full comparison retains its existing all-or-skip dependency preflight.
      # Head-first deliberately defers the base adapter until comparison is needed.
      if ! $head_first; then
        for side in base head; do
          if [ "$side" = base ]; then
            tree="$run_dir/base"
            [ -f "$tree/$suite" ] || continue
          else tree="$SCRIPT_DIR"; fi
          prepare_node "$tree" "$side"
          if [ "$node_state" = timeout ]; then
            status=blocked; note="$side Node probe timed out after ${timeout}s"; break
          elif [ "$node_state" = missing ]; then status=skipped; note='no Node'; break; fi
        done
      fi
      ;;
    *.bats)
      runner=bats
      if ! command -v bats >/dev/null 2>&1; then status=skipped; note='no bats'; fi
      ;;
  esac
  base_exit=null; base_seconds=null; base_timed_out=false
  head_exit=null; head_seconds=null; head_timed_out=false
  : > "$run_dir/base.lines"
  : > "$run_dir/head.lines"
  : > "$run_dir/new.lines"
  log_name="${suite//\//__}.log"
  if [ -n "$status" ]; then
    runner=""
  else
    sides=(base head)
    if $head_first; then sides=(head base); fi
    for side in "${sides[@]}"; do
      if [ "$side" = base ]; then
        tree="$run_dir/base"
        [ -f "$tree/$suite" ] || continue
      else tree="$SCRIPT_DIR"; fi
      command_args=()
      case "$runner" in
        bash) command_args=(bash) ;;
        pytest) command_args=(python3 -m pytest -q) ;;
        node)
          prepare_node "$tree" "$side"
          if [ "$node_state" = timeout ]; then
            status=blocked; note="$side Node probe timed out after ${timeout}s"; break
          elif [ "$node_state" = missing ]; then
            if $head_first && [ "$side" = base ]; then
              status=blocked; note='no Node at base to compare failing head'
            else status=skipped; note='no Node'; fi
            break
          fi
          if [ "$side" = base ]; then command_args=("${base_node[@]}")
          else command_args=("${head_node[@]}"); fi
          ;;
        bats) command_args=(bats) ;;
      esac
      printf 'test-baseline: %s %s starting\n' "$side" "$suite" >&2
      run_child "$tree" "$run_dir/logs/$side/$log_name" "${command_args[@]}" "./$suite"
      printf 'test-baseline: %s %s exit=%s seconds=%s timed_out=%s\n' \
        "$side" "$suite" "$run_exit" "$run_seconds" "$run_timed_out" >&2
      failure_lines "$run_dir/logs/$side/$log_name" "$run_dir/$side.lines"
      if [ "$side" = base ]; then
        base_exit=$run_exit; base_seconds=$run_seconds; base_timed_out=$run_timed_out
      else
        head_exit=$run_exit; head_seconds=$run_seconds; head_timed_out=$run_timed_out
      fi
      if $run_timed_out; then
        status=blocked; note="$side timed out after ${timeout}s"; break
      fi
      if $head_first && [ "$side" = head ] && [ "$head_exit" -eq 0 ]; then break; fi
    done
    if ! $head_first || [ "$head_exit" != 0 ]; then
      LC_ALL=C comm -13 "$run_dir/base.lines" "$run_dir/head.lines" > "$run_dir/new.lines"
    fi
    if [ -z "$status" ]; then
      # A leading SKIP is a whole-suite skip only when the entire log contains
      # skip notices and blank lines. A partial skip followed by test results
      # must retain its executed status and duration.
      skip_note=$(awk '
        NR == 1 && /^SKIP: */ { reason = $0; sub(/^SKIP: */, "", reason) }
        NF && $0 !~ /^SKIP:/ { executed = 1 }
        END { if (!executed) print reason }
      ' "$run_dir/logs/head/$log_name")
      if [ "$head_exit" -eq 0 ] && [ -n "$skip_note" ]; then status=skipped; note="$skip_note"
      elif $head_first && [ "$head_exit" -eq 0 ]; then status=passed
      elif [ "$base_exit" = null ]; then
        if [ "$head_exit" -eq 0 ]; then status=new
        else status=regression; note='new suite, failing at head'; fi
      elif [ "$head_exit" -eq 0 ]; then
        if [ "$base_exit" -eq 0 ]; then status=clean; else status=fixed; fi
      elif [ "$base_exit" -eq 0 ]; then status=regression
      elif [ "$base_exit" -ne "$head_exit" ]; then status=regression; note="exit code changed $base_exit → $head_exit"
      elif [ -s "$run_dir/new.lines" ]; then status=regression; note='new failures inside a red suite'
      else status=pre-existing; fi
    fi
  fi
  jq -cn --arg suite "$suite" --arg runner "$runner" --arg status "$status" --arg note "$note" \
    --argjson base_exit "$base_exit" --argjson base_seconds "$base_seconds" \
    --argjson head_exit "$head_exit" --argjson head_seconds "$head_seconds" \
    --argjson base_timed_out "$base_timed_out" --argjson head_timed_out "$head_timed_out" \
    --rawfile lines "$run_dir/new.lines" '
    {suite: $suite, runner: (if $runner == "" then null else $runner end), status: $status,
     base: (if $base_exit == null then null else {exit: $base_exit, seconds: $base_seconds, timed_out: $base_timed_out} end),
     head: (if $head_exit == null then null else {exit: $head_exit, seconds: $head_seconds, timed_out: $head_timed_out} end),
     new_failure_lines: ($lines | split("\n") | map(select(length > 0))),
     note: (if $note == "" then null else $note end)}' >> "$run_dir/suites.jsonl"
  {
    printf '  %-12s %s  ' "$status" "$suite"
    if [ "$status" = skipped ]; then printf '%s\n' "$note"
    elif [ "$status" = passed ]; then
      printf 'base not checked → head %s\n' "$(result_text "$head_exit" "$head_seconds")"
    else
      printf 'base %s → head %s\n' "$(result_text "$base_exit" "$base_seconds")" "$(result_text "$head_exit" "$head_seconds")"
    fi
    if [ "$status" = blocked ]; then printf '    %s\n' "$note"; fi
    if [ "$status" = regression ]; then
      awk 'NR <= 10 { print "    + " $0 }' "$run_dir/new.lines"
      printf '    head log (last 20 lines):\n'
      tail -n 20 "$run_dir/logs/head/$log_name" | awk '{ print "    " $0 }'
    fi
  } > "$run_dir/suite-report"
  cat "$run_dir/suite-report" >> "$run_dir/report"
  if ! $json; then cat "$run_dir/suite-report"; fi
  printf 'test-baseline: %s %s\n' "$status" "$suite" >&2
done
jq -n --arg base "$base" --arg oid "$base_oid" --arg head "$head_ref" \
  --arg scratch "$run_dir" --argjson keep "$keep" --slurpfile suites "$run_dir/suites.jsonl" '
  {base: {ref: $base, oid: $oid, tree: (if $keep then $scratch + "/base" else null end)},
   head: {ref: $head, working_tree: true}, suites: $suites,
   summary: (reduce $suites[] as $suite
     ({regression: 0, pre_existing: 0, fixed: 0, clean: 0, new: 0, skipped: 0, passed: 0, blocked: 0};
      .[$suite.status | gsub("-"; "_")] += 1)),
   logs: (if $keep then $scratch + "/logs" else null end)}' > "$run_dir/report.json"
if $json; then cat "$run_dir/report.json"
else
  jq -r '.summary | "Summary: \(.regression) regression, \(.pre_existing) pre-existing, \(.fixed) fixed, \(.clean) clean, \(.new) new, \(.skipped) skipped, \(.passed) passed, \(.blocked) blocked"' \
    "$run_dir/report.json" > "$run_dir/summary"
  cat "$run_dir/summary" >> "$run_dir/report"
  cat "$run_dir/summary"
  if $keep; then
    printf 'Kept: %s\nRemove with: git worktree remove --force %s/base\n' "$run_dir" "$run_dir"
  fi
fi
if jq -e '.summary.blocked > 0' "$run_dir/report.json" >/dev/null; then exit 2; fi
if $strict_head; then
  if jq -e 'any(.suites[]; .head == null)' "$run_dir/report.json" >/dev/null; then exit 2; fi
  if jq -e 'any(.suites[]; .head.exit != 0)' "$run_dir/report.json" >/dev/null; then exit 1; fi
fi
if jq -e '.summary.regression > 0' "$run_dir/report.json" >/dev/null; then exit 1; fi
exit 0
