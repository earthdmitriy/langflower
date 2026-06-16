# Workflow ideas

Examples of processes people build on the canvas. Status of each scenario in
the monorepo may still be Partial — treat this list as a **menu of shapes**,
not a guarantee that every Expect is production-ready.

## Coding change

Clarify the request → implement → review → QA → accept. Use human gates where
you need a plan check or final approval. The graph keeps review and QA in the
pipeline so the model cannot skip them.

## Write and refine a file

Topic or brief → draft file in the workspace → tone / fact review → revise in
place. The useful result is a file you own, not only a chat transcript.

## Prompt or skill refinement

Draft a prompt or skill markdown file, run it against fixtures or a short
eval loop, improve it, and keep the improved file in the project.

## Research fan-out

Map several research branches, collect results, then synthesize (and optionally
review conflicts) before writing a summary into the folder.

## Permission-staged ops

Explore with read-only tools first, then allow writes, then shell — each stage
tightened with permission asks so destructive steps stay explicit.

## Checkpoints and long runs

For longer jobs, place explicit checkpoint boundaries and resume from the
picker when you return. Closing the browser mid-run is fine while the Langflower
process stays up — see [Using the editor](using-the-editor.md).

## Multi-agent review

Wire more than one model or Sub-Agent path for adversarial or swarm-style
review, then merge through a review gate before accepting a result.

## Getting started templates

A new project seeds starter workflows under `.langflower/workflows/`. Open
**starter** first, then copy or adapt graphs for your task. Refresh packaged
templates from Settings → Bootstrap when you want newer seeds (it does not
rewrite your main `langflower.jsonc`).
