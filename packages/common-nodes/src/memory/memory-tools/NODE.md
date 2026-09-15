# Memory Tools

Pack node: emits markdown memory ToolHandles for `.langflower/memory/`, plus a
`plan` output that prints the current plan in the work log after `update_plan`.

Wire `tools` → LLM / Sub-Agent / Review. Leave `plan` unwired — the runtime
subscribes it as an end-node output (`feed.role: result`). See ADR-033.
