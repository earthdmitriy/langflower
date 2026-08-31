# Langflower Tools

Pack node: emits bus-backed tools for agent inventory. **Unsafe** graph /
compile actions — an agent can call them only if this node’s `tools` port is
wired in (starter Helper / Writer already do).

Local `emitRegistrationTools` peeks this node’s seeded ExecutionContext
for bus RPC. Other packs keep `defineToolRegistrations` (agent `toolCtx`);
do not put that peek in the author SDK factory.

This pack may grow more bus-backed tools later (`editor.addNode` /
`removeNode` / `addEdge` / `removeEdge`). This release ships
`compile_custom_nodes` only: same intent as Custom → **Update**
(`customPalette.update.requested` → `customPalette.snapshot`). After writing
`.ts`, call with no args (fingerprint miss). Pass `{ force: true }` to rebuild
when hashes match. Failures also write pack `COMPILATION_ERRORS.md`.
