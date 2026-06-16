# Crawl Tools

|              |                      |
| ------------ | -------------------- |
| **Type**     | `common-crawl-tools` |
| **Category** | Crawl                |

Emits the full crawl tool pack (`crawl_fetch`, `crawl_extract_links`,
`crawl_save_page`, `crawl_bfs`) for wiring into LLM / Review `tools`.
Invoke is via `ctx.harness` domain handlers (not graph edges). Per-op I/O nodes
(Fetch URL, Extract Links, Save Page, Crawl) remain secondary.

## Ports

| Port    | Wire type         | Notes                          |
| ------- | ----------------- | ------------------------------ |
| `tools` | tool-registration | Full pack as one array payload |
