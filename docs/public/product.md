# Product overview

Langflower turns a **local folder** into a **repeatable AI workflow**.

You point it at a workspace, open or create a visual workflow on a canvas, and
let agents read, create, review, and update files there. You see every stage
and decide what must happen before the next stage begins.

**The workflow decides the process — not a model deciding it is “done.”**

## Who it is for

- **Near term:** developers running Langflower against an existing code repo
- **Also useful for:** writing and refining files, research-style fan-out, and
  maintaining project documentation in the same folder

## What makes it different

| Chat-style agent harnesses                           | Cloud / ETL graph tools                              |
| ---------------------------------------------------- | ---------------------------------------------------- |
| Pipeline order is fixed on the canvas (hard harness) | Aimed at **local daily work**, not hosting a service |
| Review and QA stages cannot be skipped by the model  | Bootstrap into a real project folder quickly         |
| You stay on your files, not only in chat history     | Same idea: reusable process, local folder centre     |

### Hard harness

1. The **graph** is the law — stages and edges are authored, not chosen by the
   model at runtime.
2. Logic nodes (gates, asserts, branches) can fail closed between agents when
   you need a check.

## What Langflower is not

- Not a hosted multi-tenant cloud product
- Not a generic cloud ETL clone
- Not a replacement for your editor — it works **with** the files in your
  project folder

## Learn more

- [Getting started](getting-started.md)
- [Workflow ideas](workflows.md)
- [How it works (builders)](how-it-works.md)
