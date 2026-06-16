# Tests

Test code and fixtures for the Langflower monorepo.

**Strategy:** [docs/TESTING.md](../docs/TESTING.md)

## Layout

```
tests/
├── fixtures/
│   ├── workflows/          # workflow JSON for integration tests
│   └── eval/               # golden eval packs (epic 09)
├── integration/
│   ├── helpers/            # temp-project, test-server, repo-paths
│   ├── ws/                 # LangflowerWsClient + execute.* WS tests
│   └── *.test.ts           # bootstrap / sample-workflow / eval-gate checks
└── tmp/                    # runtime only — gitignored
```

Unit tests live next to source: `packages/*/src/**/*.test.ts`.

## Commands

```bash
npm run test                 # unit + integration
npm run test:unit
npm run test:integration
npm run verify               # build-all + unit + integration (recommended)
npm run verify:quick         # build-all + unit only
node build/test.mjs --unit
node build/test.mjs --integration
node build/tools/agent-run.mjs verify
```

## Dev workflow

| Change                                            | Run                                                |
| ------------------------------------------------- | -------------------------------------------------- |
| Shared validators, mappers, executor unit logic   | `npm run test:unit`                                |
| Server execution, WS, bootstrap, agents, mock LLM | `npm run test:integration` (after `npm run build`) |
| Before finishing a task                           | `npm run verify`                                   |

Integration tests start an in-process server — no `langflower start` / port 4010
required. See [docs/TESTING.md](../docs/TESTING.md) for failure output format.
