# Router as canvas edge hub

**Status:** Partial — `common-router` identity channels + dynamic bypass
slots are authorable and exercised by demo `example` / unit runtime tests;
no dedicated dense-graph demo or green WS CI bar yet for the “complex
workflow readability” claim.

## Value

Keep a **complex** workflow readable by parking many wires at a **Router
hub** instead of drawing long cross-canvas edges between every producer and
consumer. Each channel is identity passthrough: values stay typed and
separate; the canvas shows a local fan-in / fan-out meeting point. **Not**
conditional branching (that is IF / Switch / Gate). **Not** Merge’s wait-
and-combine semantics — Router does not fuse channels into one value.

## UX scenarios

### S1 — Replace spaghetti with a hub

**Who:** Author laying out a multi-branch workflow that would otherwise
cross the canvas with long producer→consumer edges.

**Want:** One meeting node so related wires stay short and the rest of the
graph stays scannable.

**Do:** From the palette, drop **Router** (`common-router`) between a
cluster of sources and a cluster of sinks. Wire each source into a Router
channel slot; wire the matching Router output to the sink that should
receive that stream.

**Expect:**

- Router MUST appear in the Flow category and accept wires without custom
  code.
- Each wired channel MUST passthrough its value unchanged (identity) to the
  matching output handle.
- Distinct channels MUST NOT mix values (string on `ch` MUST NOT appear on
  `ch@1`).
- MUST NOT require IF/Switch rules or Merge combine mode to act as a hub.

### S2 — Grow channels while wiring

**Who:** Same author adding a new branch mid-edit.

**Want:** Extra slots appear as edges are added — no panel form to
predeclare N channels before drawing.

**Do:** Wire a new upstream into the Router’s trailing empty bypass slot;
wire the new slot’s output to a new sink. Optionally disconnect a slot and
confirm the spare trailing empty slot remains usable.

**Expect:**

- Multi bypass input MUST grow a free trailing slot after each occupied
  slot ([visual-workflow-editor](../features/visual-workflow-editor.md)
  multi-wire growth).
- New slot MUST get a distinct output handle (`ch`, `ch@1`, …) for the
  downstream wire.
- Dragging / unrelated node updates MUST NOT drop the trailing empty
  bypass slot (canvas dynamic-port bar).
- MUST NOT invent a separate “add channel” wizard for the basic hub flow.

### S3 — Hub a mixed-type delay/preview chain (demo shape)

**Who:** Developer validating the shipped example graph.

**Want:** Prove the hub pattern with more than one upstream type through
one Router.

**Do:** Load workflow **Example** (`example`): String + Number → Router →
Delay → (back through Router) → Preview → Finish. **Run**.

**Expect:**

- Run MUST deliver the string path through Delay `value` and the number
  path through Delay `delay` via distinct Router channels.
- Preview MUST show the delayed string; Finish MUST settle the run.
- Canvas wires from Router MUST show working / pending chrome while values
  flow ([workflow-execution](../features/workflow-execution.md)).
- Feed / work log MUST reflect node activity without claiming chat-agent
  density ([feed-panel](../features/feed-panel.md)).

### S4 — Re-run one hub branch without replaying every channel

**Who:** Operator who changed one upstream of a multi-channel Router.

**Want:** Partial run from a downstream sink (or selected node) refreshes
only the affected branch — good sibling channels stay usable as cache.

**Do:** After a global run on a dual-channel Router → two Previews graph,
change one upstream literal; **Run from** the Preview on that branch (or
partial start on that sink).

**Expect:**

- Partial plan MUST include the Router instance in the fresh set when a
  selective downstream walk needs its channel materialization.
- The unchanged sibling Preview MUST NOT be forced to re-execute solely
  because the sibling channel changed.
- MUST NOT leave stale bus values from a prior global run on the
  re-executed branch.

### S5 — Keep decision nodes out of the hub job

**Who:** Author tempted to use Switch/IF to “route” wires for layout only.

**Want:** Clear product rule: layout hub ≠ harness decision.

**Do:** Compare palette: Router vs IF / Switch / Gate / Merge when the goal
is only edge organization.

**Expect:**

- Docs / node library MUST state Router for **stream fan-out / fan-in** and
  canvas organisation; IF/Switch/Gate for **decisions**; Merge for
  **wait/combine**.
- A hub-only graph MUST remain valid with Router alone — no boolean
  condition required.
- MUST NOT claim Router evaluates rules or picks one output by predicate.

## UI specs

| Spec                                                            | Scenarios covered                                                                                                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Visual workflow editor](../features/visual-workflow-editor.md) | [S1](#s1--replace-spaghetti-with-a-hub), [S2](#s2--grow-channels-while-wiring), [S5](#s5--keep-decision-nodes-out-of-the-hub-job)                     |
| [Node library](../features/node-library.md)                     | [S1](#s1--replace-spaghetti-with-a-hub), [S3](#s3--hub-a-mixed-type-delaypreview-chain-demo-shape), [S5](#s5--keep-decision-nodes-out-of-the-hub-job) |
| [Workflow execution](../features/workflow-execution.md)         | [S3](#s3--hub-a-mixed-type-delaypreview-chain-demo-shape), [S4](#s4--re-run-one-hub-branch-without-replaying-every-channel)                           |
| [Feed panel](../features/feed-panel.md)                         | [S3](#s3--hub-a-mixed-type-delaypreview-chain-demo-shape)                                                                                             |

## Runtime requirements

| Need                                                              | Why (scenario)                                                                                                                                                 | Today                              | Caution                                   |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------- |
| `common-router` bypass channels + `passthroughFrom`               | Identity hub ([S1](#s1--replace-spaghetti-with-a-hub), [S3](#s3--hub-a-mixed-type-delaypreview-chain-demo-shape))                                              | Landed                             | Not IF/Switch                             |
| Dynamic multi bypass slots from live edges                        | Grow while wiring ([S2](#s2--grow-channels-while-wiring))                                                                                                      | Landed (canvas `resolveNodePorts`) | Do not freeze slots on `graphInput`       |
| Per-instance channel topology in resolve / partial plan           | Correct `ch@n` + selective fresh ([S3](#s3--hub-a-mixed-type-delaypreview-chain-demo-shape), [S4](#s4--re-run-one-hub-branch-without-replaying-every-channel)) | Landed                             | Instance ≠ static type def                |
| Bypass `output-emitted` + edgeIds for wire chrome                 | Working wires ([S3](#s3--hub-a-mixed-type-delaypreview-chain-demo-shape))                                                                                      | Landed                             | Telemetry on dataflow, not raw-only       |
| Partial run includes Router in `mustFresh` / selective downstream | Branch re-run ([S4](#s4--re-run-one-hub-branch-without-replaying-every-channel))                                                                               | Landed (unit / prior WS fixes)     | WS scenario still todo                    |
| Dense multi-hub demo proving readability claim                    | Complex-workflow Value                                                                                                                                         | **Missing**                        | example is small smoke, not density proof |

## Workflow shape

Matches `demo-project/.langflower/workflows/example.json` (hub smoke — not
a dense-graph showcase):

```mermaid
flowchart LR
  str[String]
  num[Number]
  router[Router]
  delay[Delay]
  preview[Preview]
  finish[Finish]

  str -->|ch| router
  num -->|ch@1| router
  router -->|ch| delay
  router -->|ch@1| delay
  delay -->|ch@2| router
  router -->|ch@2| preview
  preview --> finish
```

Target (not a demo file yet): several producer clusters → one or more
Router hubs → sink clusters, with short local edges and no cross-canvas
spaghetti. Label any future mermaid that is not checked into
`demo-project` as **target**.

## Status

**Partial** — hub wiring, dynamic slots, identity passthrough, wire
telemetry, and selective Router inclusion in partial plans are landed for
the small example shape. The customer Value (“very complex workflows stay
readable”) is not proven by a dense demo or a green WS scenario for
dual-channel partial re-run.

**Implementable when** S1–S4 Expects pass on a checked-in dense hub demo
(or an expanded `example`), WS CI covers dual-channel global + partial
branch re-run, and S5 remains the documented product rule (already in
node-library).

### Missing parts

| Layer        | Gap                                                            | Sn     | Done when                                                                                             |
| ------------ | -------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| Demo         | No dense multi-hub workflow proving edge organisation at scale | S1, S3 | Checked-in demo with ≥2 hubs or ≥4 channels; README/run path                                          |
| Runtime / CI | `router-two-channels` WS scenario todos unfinished             | S3, S4 | Green WS: dual Preview values + partial sibling isolation                                             |
| UI           | Optional human labels for channels beyond `ch` / `ch@n`        | S1     | Only if product wants named hubs; not required for Partial→Implementable if slot indices stay the bar |

### Workarounds

- Use demo **Example** (`example`) as the small hub smoke today.
- For true combine-into-one-value, drop **Merge** — do not overload Router.
- For predicate routing, use IF / Switch / Gate — keep Router for layout +
  identity channels.

### Demo / CI

- Demo: `demo-project/.langflower/workflows/example.json` (String + Number →
  Router → Delay → Router → Preview → Finish)
- Unit: `packages/runtime/src/testing/workflows/router.workflow.test.ts`,
  `packages/common-nodes/src/flow/router/router.test.ts`,
  canvas dynamic ports in `packages/ui` dynamic-port-update tests
- CI (partial): `tests/integration/ws/execute-router.ws.test.ts` — scenario
  graph asserted; runtime cases still `it.todo`
- Related: [node-library § Router](../features/node-library.md),
  [REACTIVE_NODES.md](../REACTIVE_NODES.md),
  [visual-workflow-editor](../features/visual-workflow-editor.md)
