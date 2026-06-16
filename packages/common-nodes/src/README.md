# Common nodes

Built-in workflow nodes for Langflower. **Runtime registry:**
[`catalog.ts`](./catalog.ts) — only types listed there appear in the palette.

| Folder                         | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| [`ai/`](./ai/)                 | LLM / Fake LLM agents (openai-llm, review, critique, sub-agent…) |
| [`tools/`](./tools/)           | Runtime tool inventory helpers                                   |
| [`mcp/`](./mcp/)               | MCP resolve + MCP Server node                                    |
| [`hitl/`](./hitl/)             | Review Gate, Chat Input                                          |
| [`output/`](./output/)         | Preview, Finish                                                  |
| [`primitives/`](./primitives/) | String, Number, Boolean                                          |
| [`flow/`](./flow/)             | Router, Merge, Delay                                             |
| [`text/`](./text/)             | Concat (+ other text NODE.md stubs)                              |
| [`logic/`](./logic/)           | Assert/IF/Switch/… **NODE.md stubs** (Router/Merge live in flow) |
| [`memory/`](./memory/)         | Memory tools pack only                                           |
| [`crawl/`](./crawl/)           | Crawl nodes — **NODE.md stubs** (+ `html/` utilities)            |
| [`test-nodes/`](./test-nodes/) | Demo and harness fixtures (not production catalog)               |

Product catalog / target specs:
[`docs/features/node-library.md`](../../../docs/features/node-library.md).
Implementation status: [`docs/STATUS.md`](../../../docs/STATUS.md).
Use-case readiness: [`docs/use-cases/`](../../../docs/use-cases/README.md) +
[`docs/DONE/EPICS/`](../../../docs/DONE/EPICS/README.md).
