# Output nodes

Nodes whose primary job is to surface a value in the run UI or end the
run, rather than transform it for downstream wiring.

Work-log rows land in `features/feed/` (not the inspector sidebar).

| File                   | Type id               | Role                                                 |
| ---------------------- | --------------------- | ---------------------------------------------------- |
| `preview/node.ts`      | `common-preview`      | Show a value; `output` passthrough, `text` formatted |
| `hint/node.ts`         | `common-hint`         | Canvas markdown annotation; no wires                 |
| `finish/node.ts`       | `common-finish`       | Passthrough sink; first emit stops the run           |
| `tool-inspect/node.ts` | `common-tool-inspect` | Dump wired `ToolHandle` inventory as text            |

Preview owns both: `output` is the passthrough, `text` is the formatted string.
