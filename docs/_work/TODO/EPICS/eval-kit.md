---
kind: work
owner: docs
covers: []
status: current
---

# Eval kit

**Status:** unscheduled. No epic number until the open questions below are
answered and the file is placed on the queue.

## Problem statement

One task can be built as several workflows. A plain chat loop returns a
result that does not count as valid. The same task behind a hard review
gate spends N tokens and passes. Split into a planner and a worker, it
spends M tokens. The author needs those rows side by side: valid or not,
and what each candidate cost.

Today that comparison is a feeling after a few chats. Nothing records
it, so the next change cannot be checked against the same tasks.

## What already ships

`@langflower/eval` answers a different question: did this one output
match this expected string, and did the mean clear a threshold.

- A case is `input` plus `expected`. Scorers are `exact` and `includes`
  ([eval-pack-types.ts](../../../../packages/eval/src/eval-pack-types.ts)).
- `runCase` returns one string. The suite result is a mean score and a
  pass/fail. Cost is not on the result
  ([run-eval-suite.ts](../../../../packages/eval/src/run-eval-suite.ts)).
- The canvas demo types Suite score and Threshold by hand and runs
  Compare → Assert. It does not run an agent
  ([eval-regression-gate](../../../product/use-cases/eval-regression-gate.md)).
- Skill refining compares edits of one skill file on one pack. It does
  not compare graph topologies
  ([skill-refining](../../../product/use-cases/skill-refining.md)).
- Provider `usage` is not stored. The only token figure in the product
  is `estimateRequestTokens` in
  [llm-context-compaction.ts](../../../../packages/common-nodes/src/ai/features/openai/llm-context-compaction.ts):
  `JSON.stringify(value).length / 4`, used to compact context. That
  figure is not a provider bill.

## Goal

The author can repeat a comparison of candidate workflows on the same
tasks. Each cell says whether the result counted as valid, and what it
cost. The shape of the tool is not chosen. This file stays unnumbered
until the open questions are answered.

## In scope

The comparison, not a screen:

- Several workflows, one task set.
- A validity verdict for each task × workflow.
- A cost for that same pair. The motivating figure is tokens. Turns,
  tool calls, and elapsed time belong on the row when the run already
  has them.
- A report that can show: chat loop invalid, review gate N tokens,
  planner and worker M tokens.

## Out of scope

- Replacing `langflower eval` or the canvas Assert gate.
- Picking a winning graph.
- A live LLM in CI.
- A leaderboard, model rankings, or billing.
- Treating `length / 4` as provider usage.

## Form

Not chosen. Three candidates, no recommendation:

1. Extend the CLI. One pack, several workflows, one table.
   `EvalCaseRunner` returns a string today, so cost cannot ride that
   return.
2. Write one row per run (verdict + usage) and compare the rows later.
   Usage has to be captured at the provider boundary first. Nothing
   stores it today.
3. A comparison panel or a comparison graph. This is the heaviest
   option. Canvas scores can already be typed by hand, so a panel can
   show a comparison that no run produced.

## Open questions

A number waits on these.

- Where the verdict comes from: `exact` / `includes`, an Assert on the
  graph, a schema, or a person.
- Where the token count comes from: the provider usage field, which
  the product does not store, or the row says cost is unknown until
  the provider reports it.
- How one task enters different graphs: a shared port contract, or an
  adapter per candidate.
- One run or many, and what to do with spread.
- Whether a new run is required, or a recorded session is enough.

## Acceptance criteria

No implementation checklist until the questions above are answered.

When a later slice does implement this:

1. Two or more workflows run the same task set.
2. The report has a valid / invalid verdict and a cost for each
   task × workflow.
3. The regression-gate contract is unchanged: pack shape, the
   `runCase` string return, the mean score, and the threshold gate
   stay as they are.

## Verify

Closing a future implementation requires `npm run format`, then
`npm run typecheck` and `npm run test` (or full `verify`). Do not mark
that work done on `verify --quick` or on tests without typecheck.

This file is the record only. It does not change behavior.
