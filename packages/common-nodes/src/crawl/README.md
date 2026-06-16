# Crawl nodes

Web fetch, link extraction, and local page storage under
`<project>/.langflower/crawl/{runId}/`.

| File                    | Type id                | Role                                      |
| ----------------------- | ---------------------- | ----------------------------------------- |
| `fetch-url/node.ts`     | `common-fetch-url`     | HTTP GET + HTML → plain text              |
| `extract-links/node.ts` | `common-extract-links` | HTML → absolute URL list                  |
| `save-page/node.ts`     | `common-save-page`     | Persist page JSON under crawl run         |
| `crawl/node.ts`         | `common-crawl`         | BFS via `@langflower/tools/run-bfs-crawl` |

Fetch URL uses `ctx.harness.webFetch` (SSRF guards on the server). Save/Crawl
use `ctx.crawl` injected at run time. Default crawl run id = workflow `runId`.
BFS algorithm is shared with agent `crawl_bfs` under `@langflower/tools`.
Budget control: `maxPages` / `maxDepth` / `maxBytes` / timeouts — not a global
QPS limiter. Unit tests mock `webFetch` / `crawl` (offline).

Demo: `demo-project/.langflower/workflows/crawl-research.json`.

Spec: [node-library.md §7.8](../../../../docs/features/node-library.md#78-web-crawl).
