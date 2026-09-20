# Crawl Tools

|              |                      |
| ------------ | -------------------- |
| **Type**     | `common-crawl-tools` |
| **Category** | Tools                |

Emits the full crawl tool pack (`crawl_fetch`, `crawl_extract_links`,
`crawl_save_page`, `crawl_bfs`) for wiring into LLM / Review `tools`.
Invoke is `ToolHandle.invoke` from attached `registration.handler`
([ADR-019](../../../../../docs/architecture/ADR.md#adr-019--toolhandle-invocation-not-harness-toolid-registry)),
not `ctx.harness`. Per-op I/O nodes (Fetch URL, Extract Links, Save Page,
Crawl) remain secondary.

## Ports

| Port    | Wire type         | Notes                          |
| ------- | ----------------- | ------------------------------ |
| `tools` | tool-registration | Full pack as one array payload |
