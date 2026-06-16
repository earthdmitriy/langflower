# Langflower

> **Disclaimer:** Langflower is currently in internal testing. Anyone can
> download and try it, but some functions may not be stable.

**Turn a local folder into a repeatable AI workflow.**

Point Langflower at a workspace, choose or create a visual workflow, and let
it read, create, review, and update files there. You see every stage on the
canvas and decide what must happen before the next stage begins.

The workflow decides the process — not a model deciding it is “done.”

![Langflower starter workflow](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/starter.png)

## What can you use it for?

### Ship a code change

Turn a task into a visible pipeline: clarify the request, implement the
change, review it, run QA, and accept the result. You can stop or redirect
the work at the stages that matter.

### Write and refine files

Create an article or prompt in your workspace, review its tone and facts, then
revise it in place. The useful output is a file you own, not only a chat
transcript.

### Build a knowledge base

Ingest project documentation, resolve duplicates or contradictions, review the
proposed changes, and maintain a project wiki or Obsidian vault.

Langflower also supports research fan-out and synthesis, reusable skills,
prompt refinement, regression gates, and multi-agent review. Browse the
[workflow ideas](https://github.com/earthdmitriy/langflower/blob/master/docs/public/workflows.md).

## How it works

1. Start Langflower with a project folder.
2. Open a workflow on the canvas, or create one for the task.
3. Run it and watch agents, tools, checks, and file changes move through
   visible stages.
4. Approve, reject, or add feedback when the workflow asks for a human
   decision.
5. Find the resulting files and data in the same workspace.

The graph is a **hard harness**: it defines the order of work. If review, QA,
or approval is part of the workflow, an agent cannot silently skip it because
it is confident in its own answer. Bring your own review gate — Langflower
enforces it, so LLMs cannot skip or bypass that step.

## Why Langflower

- **Your folder stays the centre of work.** Read and write files locally,
  rather than leaving the result in a provider-hosted chat history.
- **You stay in control.** Workflows can request approval before sensitive
  file edits or shell commands run.
- **Human review is built in.** Ask for a plan review, fact check, rewrite, or
  approval exactly where it makes sense in the process.
- **Long tasks do not own your browser tab.** Close the tab and return later;
  the session continues and the UI catches up when you reconnect.
- **Reuse a process, not just a prompt.** Build a workflow once, then apply it
  to similar folders and tasks.
- **Extend it when the defaults are not enough.** Add markdown skills under
  `.langflower/skills/` or custom nodes under `.langflower/nodes/`.

## Why it stays reliable while you work

Langflower's runtime treats every workflow step as a live exchange of data.
That means a step can naturally wait for your input and continue when you
reply — human review is part of the workflow, not a special interruption
mode.

The server owns the active session, while the browser is a view of it. Closing
or reopening a tab does not create a competing workflow state or cancel a
long-running job; the UI reconnects to the current progress.

For a short builder-oriented picture, see
[How it works](https://github.com/earthdmitriy/langflower/blob/master/docs/public/how-it-works.md).

## How it compares

Langflower gives you graph-based chaining like mature orchestration tools —
stages, branches, and review gates — but it is aimed at **local daily use**,
not at shipping a backend service or wiring a cloud automation platform.

Build a reusable workflow once for coding, documentation, article writing, or
any similar desk work, then run it against the folders and tasks you already
touch every day. The canvas keeps the process visible and repeatable; the
project folder stays where the work happens.

## Quick start

Requires **Node.js ≥ 22**.

```bash
npm install -g langflower
langflower
# or
langflower ./my-project
```

From this monorepo (dogfood snapshot, not a registry install):

```bash
npm run install-local
npx langflower
```

Langflower opens a local UI at `http://127.0.0.1:4010` (or `--port` / the port
in `.langflower/config.json`) for the selected folder. Use `-p` to run several
instances from different folders at once.

Full walkthrough: [Getting started](https://github.com/earthdmitriy/langflower/blob/master/docs/public/getting-started.md).

Maintainers (monorepo only): [docs/RELEASE.md](https://github.com/earthdmitriy/langflower/blob/master/docs/RELEASE.md),
[packages/cli/README.md](https://github.com/earthdmitriy/langflower/blob/master/packages/cli/README.md).

## Learn more

Shipped with the npm package under [`docs/public/`](https://github.com/earthdmitriy/langflower/tree/master/docs/public):

| Want to…                     | Start here                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| Install and first run        | [Getting started](https://github.com/earthdmitriy/langflower/blob/master/docs/public/getting-started.md)   |
| Understand the product       | [Product overview](https://github.com/earthdmitriy/langflower/blob/master/docs/public/product.md)          |
| Use the canvas and runs      | [Using the editor](https://github.com/earthdmitriy/langflower/blob/master/docs/public/using-the-editor.md) |
| Browse workflow ideas        | [Workflow ideas](https://github.com/earthdmitriy/langflower/blob/master/docs/public/workflows.md)          |
| Configure providers and keys | [Configuration](https://github.com/earthdmitriy/langflower/blob/master/docs/public/configuration.md)       |
| Add skills or custom nodes   | [Extending](https://github.com/earthdmitriy/langflower/blob/master/docs/public/extending.md)               |
| Builder runtime picture      | [How it works](https://github.com/earthdmitriy/langflower/blob/master/docs/public/how-it-works.md)         |

## What Langflower is not

Langflower is local and project-scoped. It is not a hosted multi-tenant cloud
product or a generic cloud ETL clone.
