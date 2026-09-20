# Common nodes

Built-in workflow nodes for Langflower. **Runtime registry:**
[`catalog.ts`](./catalog.ts) — only types listed there appear in the palette.

| Folder                                     | Purpose                                                          |
| ------------------------------------------ | ---------------------------------------------------------------- |
| [`ai/`](./ai/)                             | LLM / Fake LLM agents (openai-llm, review, critique, sub-agent…) |
| [`tools/`](./tools/)                       | Runtime tool inventory helpers                                   |
| [`mcp/`](./mcp/)                           | MCP resolve + MCP Server node                                    |
| [`hitl/`](./hitl/)                         | Review Gate, Chat Loop, Chat Input                               |
| [`output/`](./output/)                     | Preview, Finish, Tool inspect                                    |
| [`primitives/`](./primitives/)             | String, String (multiline), Number, Boolean                      |
| [`flow/`](./flow/)                         | Router, Merge, Delay, Checkpoint                                 |
| [`text/`](./text/)                         | Concat, Split (paced), Read/Write/Append File                    |
| [`logic/`](./logic/)                       | Compare, Assert, If, Gate, Switch (Router/Merge live in `flow/`) |
| [`memory/`](./memory/)                     | Memory tools pack only                                           |
| [`embeddings/`](./embeddings/)             | Embed provider + embed text                                      |
| [`langflower-tools/`](./langflower-tools/) | Langflower Tools bus node                                        |
| [`run-host/`](./run-host/)                 | Run-scoped host bag (not a catalog node)                         |
| [`crawl/`](./crawl/)                       | Fetch URL, Extract Links, Save Page, Crawl, Crawl tools          |
| [`test-nodes/`](./test-nodes/)             | Demo and harness fixtures (not production catalog)               |

Product catalog / target specs:
[`docs/features/node-library.md`](../../../docs/features/node-library.md).
Implementation status: [`docs/STATUS.md`](../../../docs/STATUS.md).
Use-case readiness: [`docs/use-cases/`](../../../docs/use-cases/README.md) +
[`docs/DONE/EPICS/`](../../../docs/DONE/EPICS/README.md).
