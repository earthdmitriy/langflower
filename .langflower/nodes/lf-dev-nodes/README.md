# lf-dev-nodes

Dogfood pack for the Langflower repo: LLM-callable npm script tools and a
graph QA gate.

Not a bootstrap seed. Place types from Custom. Wire **LF Dev Tools** `tools`
into an agent / LLM `tools` port. Wire **LF Review Gate** `trigger` →
downstream on `ok`, or Preview / agent on `fail`.

## Node

| Type             | Role                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `lf-dev-tools`   | `defineToolRegistrations` — `npm_*` scripts + `run_targeted_tests`                                     |
| `lf-review-gate` | `defineReactiveNode` — format (always) → typecheck → test; `ok` passthroughs `trigger`; `fail` is text |

Hang / wipe scripts (`start`, `dev`, `test:watch`, `clean*`) are omitted.
`format` and `lint:fix` rewrite the working tree. **LF Review Gate** always
runs `format` (writes; formatter findings are not a gate failure), then
`typecheck`, then `test`, and stops on the first typecheck or test failure.

Tool and `fail`-port results are **stripped**: `ok  npm_test` on success, or
a short failed-test / compiler / linter list — not raw stdout.

Targeted tests: `node build/test.mjs [--unit|--integration] -- <paths>`
(`suite` default `unit`). Paths must stay under `ctx.projectDir`.
