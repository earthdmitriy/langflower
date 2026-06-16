# Read File

| **Type** | `common-read-file` |
| **Category** | Text |

## Summary

Reads a **project-relative** text file into `content` via `ctx.files`. Absolute
paths are rejected. No permission ask — placing the node is the allow decision.

## Inputs

| Port     | Type    | Notes                                               |
| -------- | ------- | --------------------------------------------------- |
| `path`   | string  | Inline 1-line; relative to project root             |
| `update` | dynamic | Wire-only tick; any emission re-reads the same path |

## Outputs

| Port      | Type   |
| --------- | ------ |
| `content` | string |
