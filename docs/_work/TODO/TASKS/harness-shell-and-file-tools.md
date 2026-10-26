---
kind: work
owner: docs
covers: []
status: current
---

# Harness shell and file tools — defects observed during a node-authoring session

## Summary

While fixing `.langflower/nodes/lf-dev-nodes/lf-review-gate.ts`, several host
tools did not behave as their descriptions say. This file records **only what
was observed from tool results** in that session — no further probing was done,
and nothing below is a diagnosis of the machine.

The two `bash` defects matter most because they are **silent**: the tool
returns `exit 0` after running only part of the command, so a green result can
mean "the rest of the script never ran".

## Observations

### 1. `bash` executes `cmd.exe`, not bash

| Probe                                                   | Result                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `echo %COMSPEC%`                                        | `C:\WINDOWS\system32\cmd.exe` (literal text, not expanded)      |
| `if 1==1 echo CMD_SEMANTICS_CONFIRMED`                  | `CMD_SEMANTICS_CONFIRMED` — cmd-only syntax                     |
| `echo "AO=$0"; echo "SHELL=$SHELL"; echo "BASH=$BASH…"` | `$0`, `$SHELL`, `$BASH_VERSION` printed **literally**, no value |
| `echo "x=$(echo n)"`                                    | `"x=$(echo n)"` — `$(…)` not substituted                        |
| `chcp`                                                  | `Active code page: 437`                                         |
| `dir .probe-*.txt`, `del`, `findstr`, `reg query`       | all accepted                                                    |

POSIX shape (`VAR=…`, `$(…)`, `;`, heredocs, `&&` chains with real bash
semantics) is not available. The name and the tool description
("Run a shell command in the project root") both suggest bash.

### 2. Multi-line input is truncated to the first line — silently

| Probe                                                                               | Result                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| `echo a` ⏎ `echo b`                                                                 | stdout `a`, `exit 0`                             |
| `echo first` ⏎ `echo second` ⏎ `echo third`                                         | stdout `first`, `exit 0`                         |
| `echo one > .probe-a.txt` ⏎ `echo two > .probe-b.txt` ⏎ `echo three > .probe-c.txt` | `dir .probe-*.txt` shows **only `.probe-a.txt`** |

Nothing in stdout/stderr says lines 2…n were dropped. A pack-facing tool that
sends a multi-line shell command gets a partial run reported as success.

### 3. Redirection and stderr are not reliable

- `echo hi 2>/dev/null && …` → emitted `The system cannot find the path
specified.` on stderr (cmd treated `null` as a path).
- `> nul` produces the redirect artifact the repo already guards against —
  [`.gitignore`](../../../../.gitignore) contains
  `# Windows CMD redirect artifact` / `nul`, i.e. this has bitten the project
  before.
- A command mixing `&` and redirection returned `exit 0` with
  `stderr: The filename, directory name, or volume label syntax is incorrect.`
  — exit status did not reflect the error.

Exit codes do propagate for a **single** command line: `exit 3` → 3,
`node -e "process.exit(5)"` → 5.

### 4. `grep` scoped to one file misses matches that `read` sees

| Probe                                           | Result                                                  |
| ----------------------------------------------- | ------------------------------------------------------- |
| `grep 'Prettier' path=build/format.mjs` (twice) | `(no matches)`                                          |
| `read build/format.mjs` (lines 1–5)             | line 4 reads `* Format repository files with Prettier.` |

Directory-scoped `grep` was not exercised enough to compare.

### 5. `glob` cannot enumerate `build/`, though the files exist

| Probe                                                      | Result                       |
| ---------------------------------------------------------- | ---------------------------- |
| `glob 'build/*.mjs'` (also with `respectGitignore: false`) | no matches                   |
| `glob 'build/**'`, `glob 'build/*'`                        | no matches                   |
| `glob '**/format.mjs'`                                     | no matches                   |
| `ls build` via shell / `read build/format.mjs`             | 40+ entries, file reads fine |

`glob` works elsewhere in the same session (`docs/_work/TODO/**/*.md`,
`packages/*/package.json`, `.langflower/nodes/lf-dev-nodes/*`). Without `glob`
the build scripts had to be enumerated through the shell.

### 6. Shell-name resolution inside packs (harness-relevant part)

`lf-review-gate` → `npm run typecheck` → root `package.json`
(`"typecheck": "bash build/typecheck-all.sh"`). Spawning with
`{ shell: true }` goes through `cmd.exe`, which resolves the **literal** name
`bash` by `PATH` order and picks `C:\Windows\System32\bash.exe` — not the bash
the user's own terminal starts. That stub failed before any script ran, so the
gate received `exit 1` and no `tsc` output at all.

Only the harness angle is filed here: a spawn path that resolves a shell by
bare `PATH` lookup reports a broken shell as a broken **step**. The
environment side is deliberately out of scope (below).

## Impact on this session

- The pack's typecheck step looked like a node bug; the node file was in fact
  clean. Time went into a red herring that the silent-truncation and
  shell-name defects created.
- Any multi-line command issued for verification could report `exit 0` after
  running only its first line — so "verified" claims from the shell tool need
  one-command-per-call discipline.
- `glob` gaps forced shell fallbacks; `grep`-per-file gaps made targeted checks
  unreliable.

Worked around, not fixed: `lib/run-npm-script.ts` in the pack now maps a bare
`bash build/<x>.sh` entry to its `node build/<x>.mjs` twin, so the pack no
longer depends on shell-name resolution.

## Guardrails

- Every claim above must be traceable to a tool result in the session log; no
  defect is inferred from code reading alone.
- Do not publish a fix that makes the failing probe pass while another probe
  in the same table is untested.
- A fix to `bash` must keep single-line exit-code propagation (it already
  works) — do not regress it while adding multi-line support.

## Verification gate

Close this task only when each row below holds:

1. `bash`: multi-line input either runs all lines or fails loudly — no
   `exit 0` after a partial run.
2. `bash`: the documented shell is the shell that executes, or the description
   says it is `cmd.exe`.
3. `grep` with a single-file `path` returns the matches `read` shows for the
   same pattern.
4. `glob 'build/*'` returns the entries `ls build` returns.
5. `stderr` from a command is attributed to that command and to a non-zero /
   truthful exit status, or the harness says it cannot attribute it.
6. A permission flip mid-session is reported at the moment it takes effect,
   not on the next call only.

Then `node build/format.mjs` and `node build/typecheck-all.mjs` — note these
are invoked through `node` directly, because `npm run …` still routes through
the shell defect in item 7.
