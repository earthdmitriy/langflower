---
kind: adr
owner: docs
covers: []
status: current
id: ADR-043
supersedes: []
superseded-by: []
package: runtime
---

# ADR: Union wire types connect on a shared member

| Field      | Value                                                   |
| ---------- | ------------------------------------------------------- |
| **Status** | accepted                                                |
| **Date**   | 2026-10-25                                              |
| **Scope**  | `packages/runtime`, `packages/node-sdk`, LLM node ports |

## Context

`RuntimeEditor` connected an edge only when the source and target
`wireType` strings were equal, apart from `any` and `dynamic`. Turn
attachments added a `user-turn` payload (`{ text, files }`). No `string`
port accepted it, so the LLM nodes grew a second port beside each string
input (`userTurn` beside `userPrompt`, `turnFeedback` beside `feedback`)
and a run-time `excludes` rule so both could not be wired at once. Every
agent node showed duplicated ports on the canvas.

## Decision

`wireType` is `string | readonly string[]`. A scalar behaves exactly as
before. A list is a union.

- An edge connects when the source and target lists share a member, or
  either side holds `any`.
- `dynamic` is scalar-only. A list containing `dynamic`, or an empty
  list, throws when the port is defined.
- A node that declares a union handles every member it lists. The LLM
  nodes coerce a string to `{ text, files: [] }` with
  `coerceChatUserTurn`.
- `userPrompt` and `feedback` on OpenAI, Fake and the other LLM-class
  nodes are `['string', 'user-turn']`. `userTurn`, `turnFeedback`, and
  the `excludes` run refusal are removed.
- The author SDK keeps its own copy of `WireTypeSpec`
  ([ADR-027](027-author-sdk-owns-port-types-no-production-runtime-dep.md));
  `runtime-parity.types.test.ts` locks the two together.
- Read sites use `wireTypeIs` (exact single type), `wireTypesCompatible`
  (edge rule), and `formatWireType` (`string | user-turn` on the canvas
  and in the inspector). Inline `number` and `boolean` coercion applies
  only to an exact scalar.

## Consequences

- Graphs saved before attachments (Chat Input `message` into
  `userPrompt`) connect with no migration and show no second port.
- Persisted workflows store port ids, not wire types, so no data
  migrates.
- The overlap rule is looser than equality: a union port accepts any
  member, so authors must handle every member.
- `userTurn` and `turnFeedback` never shipped. A graph saved in a
  working tree that used them must rewire to `userPrompt` and `feedback`.

## Not chosen

- **A global `string` → `user-turn` widening.** One implicit rule for
  every future `user-turn` consumer, and a one-way relation the editor
  would need beside equality.
- **A parallel port per payload type.** The duplicated ports and the
  exclusion rule this ADR removes.
- **Encoding files inside the string.** Preview, Concat and Review Gate
  would show or corrupt the token.
