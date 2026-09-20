# Logic nodes

Control flow — comparisons, assertions, conditional outputs, and multi-way
routing. Router / Merge live under `src/flow/` — reuse them; do not duplicate.

| File                     | Type id          | Role                                             |
| ------------------------ | ---------------- | ------------------------------------------------ |
| `compare/node.ts`        | `common-compare` | Binary comparison → boolean                      |
| `assert/node.ts`         | `common-assert`  | Fails the node when a condition is false         |
| `if/node.ts`             | `common-if`      | Routes value to `true` or `false` output         |
| `gate/node.ts`           | `common-gate`    | Passes value only when condition is true         |
| `switch/node.ts`         | `common-switch`  | Multi-rule routing (`pass` / `fail` / `default`) |
| `switch/switch-rules.ts` |                  | Switch rule parsing/resolution                   |
| `../flow/router/node.ts` | `common-router`  | Visual channel router (bypass ports)             |
| `../flow/merge/node.ts`  | `common-merge`   | Fan-in merge                                     |

Do **not** add `logic/router/` or `logic/merge/` NODE.md — those folders are
not the implementation.
