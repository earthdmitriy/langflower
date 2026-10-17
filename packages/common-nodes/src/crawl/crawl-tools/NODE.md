---
kind: guide
owner: common-nodes
covers:
    - 'packages/common-nodes/src/crawl/crawl-tools/**'
status: current
---

# Crawl Tools

|              |                      |
| ------------ | -------------------- |
| **Type**     | `common-crawl-tools` |
| **Category** | Tools                |

Emits the full crawl tool pack (`crawl_fetch`, `crawl_extract_links`,
`crawl_save_page`, `crawl_bfs`) for wiring into LLM / Review `tools`.
Invoke is `ToolHandle.invoke` from attached `registration.handler`
([ADR-019](../../../../../docs/adr/019-toolhandle-invocation-not-harness-toolid-registry.md)),
not `ctx.harness`. Per-op I/O nodes (Fetch URL, Extract Links, Save Page,
Crawl) remain secondary.

## Ports

| Port    | Wire type         | Notes                          |
| ------- | ----------------- | ------------------------------ |
| `tools` | tool-registration | Full pack as one array payload |
