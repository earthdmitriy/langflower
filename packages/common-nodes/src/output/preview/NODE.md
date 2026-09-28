# Preview

|              |                  |
| ------------ | ---------------- |
| **Type**     | `common-preview` |
| **Category** | Output           |

## Summary

Shows a wired value on the canvas and in the work log. `output` passes the
input through unchanged. `text` emits the display string (JSON for objects)
with `feed.role: result` (work log in `features/feed/`).

Live bind: `src/output/preview/node.ts`.

## Inputs

`input` (dynamic, required, inline: preview-markdown)

## Outputs

`output` (passthrough, type follows `input`)

`text` (string, formatted display text, `feed.role: result`)
