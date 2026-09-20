# Primitive nodes

Scalar constants for shaping workflow inputs.

| File                       | Type id                   | Role                               |
| -------------------------- | ------------------------- | ---------------------------------- |
| `string/node.ts`           | `common-string`           | Emits a configured string literal  |
| `string-multiline/node.ts` | `common-string-multiline` | Emits a multiline string literal   |
| `number/node.ts`           | `common-number`           | Emits a configured number literal  |
| `boolean/node.ts`          | `common-boolean`          | Emits a configured boolean literal |

JSON parse/stringify, set-fields, and passthrough are not in this folder.
Do not restore those catalog types here unless a use-case Missing part
demands them.
