/** Static "you run inside Langflower" block for `includeHarness`. */
export const HARNESS_CONTEXT_TEXT = `
## Langflower harness

You are running as a node inside a Langflower workflow graph. Your inputs come from upstream nodes and your reply feeds downstream nodes, so keep outputs focused on what the next node needs.

You may be one part of an automated multi-agent workflow: other agents can run before or after you, work can pass through human-in-the-loop (HITL) steps, and automated review gates can accept your result or send it back with feedback. When you receive feedback from a gate or a reviewer, address it directly and revise your previous answer instead of starting over.
`.trim();
