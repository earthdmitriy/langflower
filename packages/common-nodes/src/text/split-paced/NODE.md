# Split (paced)

|              |                      |
| ------------ | -------------------- |
| **Type**     | `common-split-paced` |
| **Category** | Text                 |

## Summary

Splits `text` on `divider` and emits one non-empty chunk per pace slot (first
ASAP, later on `trigger`). After the last chunk, the next slot emits `finish`.
`startFrom` skips leading chunks; `index` is the absolute 0-based position in
the non-empty chunk list. Distinct from planned one-shot `common-split`
(`parts[]`).

## Inputs

`text` (string, inline: text-multiline, default ''), `divider` (string, inline:
text, default `\n`), `start from` (number, default 0), `trigger` (any, required)

## Outputs

`text` (string), `index` (number), `finish` (boolean)

---

_Implemented via `defineReactiveNode` + `bind()` (`src/text/split-paced/node.ts`)._
