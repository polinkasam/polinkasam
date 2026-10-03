# Private credential entry

`env` installs a credential through hidden input into an explicitly selected
dotenv file or Railway service. The model sees the key, destination, and
outcome. It never needs the value. Claude Code, Codex, Pi, and Prime follow the
same [canonical command](../.claude/skills/env/SKILL.md) and shared helper.

## Install and rotate are separate operations

**INSTALL** puts a replacement value at a destination. **ROTATE** changes a
credential at its authority, such as an Aura instance, BotFather, or a provider's
token-management page. This helper implements installation only.

For a rotation request, identify the authority and exact account, resource,
page, and rotation action using the user's context or current provider
documentation. Ask the user to complete that action privately and wait for
confirmation before installation. Never infer the authority from the key name
alone. Report the halves separately: “rotated at the authority: user-confirmed;
installed at N of M destinations.” Count only verified `saved` receipts as
installed. List pending, not-written, or unverified destinations separately.
A successful destination write does not prove a rotation occurred.

## Probe without opening a prompt

Probe needs no plan, does not collect input, and opens no dialog:

```bash
python3 bin/secret-entry.py probe
```

Its non-secret result reports `mode` (`dialog`, `terminal`, or `none`),
`verified`, and a `reason` when `none`. Unknown failures may include a sanitized
numeric `code`; subprocess stdout and stderr are never included.

For `dialog`, the helper compiles a hidden-input script with
`osacompile -o /dev/null`. Successful compilation demonstrates that the scripting
addition loads. It cannot demonstrate that a window can display, so `dialog`
always has `verified: false`. A successful compile followed by a failed dialog
at `apply` remains a possible, explicitly handled outcome.

“TTY” below means **both** standard input and standard error are terminals.
Sandbox detection checks a nonempty `CODEX_SANDBOX` value other than `none`,
`false`, or `0`, or a nonempty `APP_SANDBOX_CONTAINER_ID`. A marker alone does
not establish that a dialog is unavailable.

| Input request | Platform | TTY | Sandbox marker | Compilation / diagnostic | Mode | Verified | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `terminal` | Any | Yes | Any | Not run | `terminal` | `true` | — |
| `terminal` | Any | No | Any | Not run | `none` | `false` | `no_tty` |
| `dialog` | Non-macOS | Any | Any | Not run | `none` | `false` | `not_darwin` |
| `auto` | Non-macOS | Yes | Any | Not run | `terminal` | `true` | — |
| `auto` | Non-macOS | No | Any | Not run | `none` | `false` | `not_darwin` |
| `auto` or `dialog` | macOS | Any | Any | Compile succeeds | `dialog` | `false` | — |
| `auto` | macOS | Yes | Any | Compile fails | `terminal` | `true` | — |
| `auto` without TTY, or `dialog` | macOS | As specified | Present | Compile signature and `-2740` or `-1728` | `none` | `false` | `sandbox` |
| `auto` without TTY, or `dialog` | macOS | As specified | Absent | Same compile failure | `none` | `false` | `unknown`, numeric `code` |
| `auto` without TTY, or `dialog` | macOS | As specified | Any | Explicit display / WindowServer unavailable diagnostic | `none` | `false` | `no_display` |
| `auto` without TTY, or `dialog` | macOS | As specified | Any | Other failure | `none` | `false` | `unknown`, numeric `code` when available |

An osascript failure is `cancelled` only when its failing exit status accompanies
`User canceled. (-128)` in stderr. Other failures are
`hidden_input_unavailable`, classified by the same evidence rules. The known
compile signature with `-2740` or `-1728` means `sandbox` only when one of the
documented markers is also present. Without the marker it means `unknown`;
neither the agent nor the helper guesses a cause from an error number alone.
Terminal Ctrl-C or end-of-input cancels. If echo suppression fails despite
both TTY checks passing, the reason is `unknown`; it becomes `no_tty` only
when a fresh check confirms a required terminal is missing.

For controlled diagnostics and deterministic tests only,
`EGREGORE_SECRET_ENTRY_OSASCRIPT` and `EGREGORE_SECRET_ENTRY_OSACOMPILE` override
the respective executable paths. They choose executable paths, never credential
values or scripts supplied through a plan. Tests use a compile-success fixture
and an osascript fixture that exits with a fixed `-2740` compilation error;
that failure happens before a value can be entered or written. Do not set these
overrides during ordinary credential entry or point them at untrusted programs.

## Locate, then select

When the user supplies a key without one exact destination, locate the possible
destinations before preparing anything. Here `key` comes from the request and
`root` is the canonical owning repository inside the active boundary:

```bash
python3 bin/secret-entry.py locate --key '{key}' --root '{root}'
```

For a named Railway target, `project` and `service` come from the user's
non-secret target description; `key` and `root` have the same sources as above:

```bash
python3 bin/secret-entry.py locate --key '{key}' --root '{root}' --project '{project}' --service '{service}'
```

Either Railway selector can be omitted. Names or IDs resolve through verified
provider metadata, including a selected target where the key is absent.
Otherwise Railway candidates are services whose variable **names** include
the requested key, across the signed-in account's projects and environments.
Matching names in different projects or environments are separate credentials
until the user explicitly says otherwise.

Dotenv candidates include existing `.env`, `.env.*`, and `*.env` files whether
or not they already contain the key. They use the same ignored, untracked, within-root,
non-symlink eligibility checks as `prepare`. New keys therefore still have
destinations; discovery does not invent nonexistent filenames. `consumers`
lists relative file paths whose text references the key, excluding tests, docs,
`.egregore/`, `.git/`, dotenv files, and symlinks; it contains no source excerpts.
Discovery prunes dependency and build directories named `node_modules`, `.venv`,
`venv`, `env`, `site-packages`, `dist`, `build`, `target`, `out`, `.cache`,
`__pycache__`, `.tox`, `.mypy_cache`, `.pytest_cache`, `vendor`, `.next`, `.turbo`,
and `coverage`, plus nested repositories with any `.git` entry. Dotenv files
inside those directories are excluded too. Consumer scanning skips files larger
than 1 MiB and stops collecting after 200 matches. Reaching that limit adds a
`filesystem` failure scoped to the root with reason `consumer_scan_truncated`,
making `complete` false; dotenv discovery continues within the eligible tree.
If no suitable existing file is found, the user can select an exact new dotenv
path and let `prepare` verify it before private input.

The report has this shape; identifiers and paths below are redacted:

```json
{
  "complete": false,
  "candidates": [
    {
      "provider": "dotenv",
      "destination": {"file": "<workspace>/.env"},
      "key_exists": false
    },
    {
      "provider": "railway",
      "destination": {
        "project": "<project-id>",
        "environment": "<environment-id>",
        "service": "<service-id>"
      },
      "destination_names": {
        "project": "<project-name>",
        "environment": "<environment-name>",
        "service": "<service-name>"
      },
      "key_exists": true
    }
  ],
  "failures": [
    {
      "provider": "railway",
      "scope": {"project": "<inaccessible-project-id>"},
      "reason": "inaccessible"
    }
  ],
  "consumers": ["<consumer-path>"]
}
```

Every unreadable scope has its own classified failure. Any failure makes
`complete: false`. An empty candidate list with failures means the answer is
**unknown**, not that the key is absent. Railway variable JSON is captured and
parsed only in process; only names survive into discovery. It is never echoed,
logged, stored in a scratch file, or included in failure diagnostics.

Railway failure scopes identify the signed-in account, project, environment,
or service as structured objects. Reasons include `not_authenticated`,
`inaccessible`, `command_unavailable`, `timeout`, `command_failed`,
`invalid_response`, and `wrong_destination`. A named target reports
`target_not_found` only after complete metadata discovery. Filesystem failures
identify the file or root with a fixed read, storage, or eligibility reason.
Discovery may briefly bind the CLI in a private, non-secret directory under
`.egregore/secret-entry/`; it removes that binding and writes no plan or receipt.

Show one receipt with the destinations, key presence, consumers, and failures;
state **incomplete** plainly when applicable. Ask the user to select destinations
before any `prepare`. Skip that question only when the user already named one
exact destination. Discovery does not authorize writes or unify credentials.

## Prepare each selected destination

`prepare` checks access and returns a non-secret plan path and destination
details before any prompt. Plans and receipts live in the gitignored
`.egregore/secret-entry/` directory. They are local operational state, not
organizational memory or a secret store.

For dotenv, `root`, `file`, and `key` come from the selected destination and
confirmed variable name:

```bash
python3 bin/secret-entry.py prepare --provider dotenv --root '{root}' --file '{file}' --key '{key}'
```

The file must be gitignored and untracked. Egregore worktrees may link `.env`
to the primary checkout. Resolve the actual file and select its owning repository
as `root` within the boundary; do not replace the shared symlink. The local
writer supports literal, single-line `KEY=value` entries, preserves other
entries, and stops for duplicate target keys or concurrent file changes. It
does not execute shell syntax. Multiline secrets need a destination adapter.

For Railway, the three IDs come from verified metadata for the selected target;
`root` is the owning repository and `key` is the confirmed variable name:

```bash
python3 bin/secret-entry.py prepare --provider railway --root '{root}' --key '{key}' --project '{project_id}' --environment '{environment_id}' --service '{service_id}'
```

The adapter verifies all three IDs. It uses a directory binding inside the
plan's own folder, preserving other links; the CLI's current directory link
does not select a destination. It uses the signed-in CLI account rather than
an inherited project token and targets Railway's production API. Installing
a variable uses stdin and skips deployment.

Show each plan receipt with the destination, key, and **replace** or **create**
from `existing_key`. Prepare one plan per selected destination.

## Apply or hand off private entry

Choose the input path from `probe`. For mode `dialog`, `plan` is the returned
absolute plan path:

```bash
python3 bin/secret-entry.py apply --plan '{plan}' --input dialog
```

Keep the process alive while the user enters the value. For mode `terminal`
in a real interactive terminal, `plan` is the same returned path:

```bash
python3 bin/secret-entry.py apply --plan '{plan}' --input terminal
```

The helper refuses terminal input without both required TTYs or when input
would echo. Never put the value in chat, a questionnaire, command arguments,
shell history, clipboard-reading requests, logs, or scratch files.

**Harness-specific:** when a sandbox blocks the dialog, a harness with an
escalation flow may request to run only that exact `apply` command outside the
sandbox. Use the active harness's permission flow; do not assume all harnesses
or sessions offer it. If escalation is unavailable or declined, hand the user
the exact terminal command with the real plan path and report **PENDING**.

The terminal command must run **on the host that holds the plan, the workspace,
and the provider login**, from that workspace. A terminal on the user's laptop
cannot apply a plan that exists only on a remote host. Keep PENDING until the
non-secret receipt can be read; do not ask for credential-bearing terminal
output in chat.

If that host has no user shell, end with `not_written` and the known reason.
The remaining private paths are to run on a host with the workspace and login,
preparing a plan there, or to set the value in the provider's own console.
An unavailable terminal is a truthful endpoint, not a completed installation.

Fallback to another input path is permitted for exactly one outcome:
`hidden_input_unavailable` **before any write**. This includes compilation
succeeding at probe followed by the dialog failing to open at apply. The
receipt has `status: not_written` and the input failure's classified `reason`.
Those input reasons are `sandbox`, `no_display`, `not_darwin`, `no_tty`, or
`unknown`; unknown failures may also carry a sanitized numeric `code`.
Cancellation (`cancelled`) stops the command; it never falls back to another
input path. `write_attempted_unverified` never triggers an automatic retry,
even if a different input path becomes available.

## Report the result

Success requires exact read-back equality in memory. Non-secret receipts
record the key and destination; they never contain the value, a preview, or
its hash. Input failures add a classified `reason`, and unknown failures may
include a sanitized numeric `code`.

| Outcome | Meaning and next action |
| --- | --- |
| `saved` | The write and exact verification succeeded. Name the key and destination. |
| `not_written` | Preparation, input, or validation stopped before a write. Report its reason. Only unavailable private input qualifies for an input fallback. |
| `write_attempted_unverified` | A write may have happened. Report the uncertainty and inspect the destination privately before preparing any new write. Never retry automatically. |
| **PENDING** | The user has a terminal command but no completed receipt has been read. This is a workflow state, not a helper receipt or proof of saving. |

Provider validity is a separate task-specific check: an installed token can
still lack permissions or be invalid for its API. Use narrowly scoped read-only
checks with credential-bearing output suppressed. Installation alone does not
demonstrate that a bot, integration, or deployment is running.

## Another destination

The adapters are dotenv and Railway. To support another destination, add a
fixed adapter to the shared helper: validate an explicit destination before
input, transfer secrets outside arguments, logs, and scratch files, preserve
unrelated configuration, verify the exact write, and emit the same non-secret
outcomes. Test provider response shapes and failure paths. Do not turn plans
into arbitrary shell commands or accept provider URLs from them.
