# Node state across runs — landed

Nodes may **intentionally** keep internal state across runs (instance closures /
once-per-instance streams) until the user loads another workflow or Langflower
shuts down.

Canonical write-up: [REACTIVE_NODES](../REACTIVE_NODES.md) § Instance lifetime
and cross-run state.

Regression:
`packages/runtime/src/testing/workflows/share-replay-rerun.workflow.test.ts`.
