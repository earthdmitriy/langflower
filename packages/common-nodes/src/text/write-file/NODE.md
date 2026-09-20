# Write File

| **Type** | `common-write-file` |
| **Category** | Text |

## Summary

Overwrites a **project-relative** file with `content` through the declared
`paths` capability (`ec.denyPaths` → `createProjectFilesContext`; creates
parent directories). Absolute paths are rejected. No permission ask.

## Inputs

| Port      | Type   | Notes                                                       |
| --------- | ------ | ----------------------------------------------------------- |
| `path`    | string | Inline 1-line                                               |
| `content` | string | Wire-only; `multi: 'merge'` — each upstream emission writes |

## Outputs

| Port   | Type   | Notes                                |
| ------ | ------ | ------------------------------------ |
| `path` | string | Relative path after successful write |
