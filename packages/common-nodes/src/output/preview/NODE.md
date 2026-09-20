# Preview

|              |                  |
| ------------ | ---------------- |
| **Type**     | `common-preview` |
| **Category** | Output           |

## Summary

Formats the wired `text` input as display string (JSON for objects) and
emits it on `text` with `feed.role: result` (work log in `features/feed/`).
Passthrough — downstream nodes still receive the formatted string.

Live bind: `src/output/preview/node.ts`.

## Inputs

`text` (any, required, inline: preview-markdown)

## Outputs

`text` (passthrough, `feed.role: result`)
