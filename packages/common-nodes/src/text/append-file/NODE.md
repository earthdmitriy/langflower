# Append File

| **Type** | `common-append-file` |
| **Category** | Text |

## Summary

Appends `content` to a **project-relative** file via `ctx.files`. When the file
already has text, inserts `delimiter` between existing content and the new
chunk. Empty/missing file → write `content` only. Absolute paths rejected. No
permission ask.

## Inputs

| Port        | Type   | Notes                                                        |
| ----------- | ------ | ------------------------------------------------------------ |
| `path`      | string | Inline 1-line                                                |
| `delimiter` | string | Inline multiline; default `\n\n`                             |
| `content`   | string | Wire-only; `multi: 'merge'` — each upstream emission appends |

## Outputs

| Port   | Type   | Notes                                 |
| ------ | ------ | ------------------------------------- |
| `path` | string | Relative path after successful append |
