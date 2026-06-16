# Output nodes

Nodes whose primary job is to surface data in the run UI rather than transform
it for downstream wiring.

| File              | Type id          | Role                                                |
| ----------------- | ---------------- | --------------------------------------------------- |
| `preview.node.ts` | `common-preview` | Writes a labeled snapshot to the work log (sidebar) |

Preview accepts any wire type and does not block the graph — downstream nodes
still receive the same value.
